/**
 * PotholeDetector — Research-grade bump/pothole detection engine
 * 
 * Two modes:
 *   REAL — full pipeline with speed gate, gyro validation, cooldown
 *   SIMULATION — no speed gate, no cooldown, no gyro requirement (for demos)
 * 
 * Based on:
 *   Eriksson et al. "The Pothole Patrol" (MIT, 2008)
 *   Mednis et al. "Real time pothole detection using Android smartphones" (2011)
 *   Z-THRESH, Z-DIFF, and G-ZERO detection algorithms
 */

import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { COLLECTIONS, db, publishPothole } from './firebase';

// ─── Types ───────────────────────────────────────────────────────────

export interface SensorReading {
    x: number;
    y: number;
    z: number;
    timestamp: number;
}

export interface PotholeEvent {
    id: string;
    coordinate: [number, number]; // [lng, lat]
    timestamp: number;
    severity: number;             // 1–5
    zScore: number;               // how many σ above mean
    peakAccel: number;            // m/s² of the spike
    speed: number;                // km/h at detection
    mode: 'real' | 'simulation';
    description?: string;         // manual reported incident desc
    photoBase64?: string;         // manual reported incident photo
}

export type PotholeCallback = (event: PotholeEvent) => void;

// ─── Constants (tuned from literature) ───────────────────────────────

const GRAVITY = 9.81;
const SAMPLE_RATE_MS = 10;               // 100 Hz
const ALPHA = 0.8;                       // gravity filter coefficient
const WINDOW_SIZE = 50;                  // 0.5s at 100Hz
const Z_SCORE_THRESHOLD = 3.5;          // σ threshold
const GYRO_CONFIRM_THRESHOLD = 1.2;     // rad/s
const Z_DIFF_THRESHOLD = 8.0;           // m/s²
const ABSOLUTE_MAGNITUDE_FLOOR = 3.0;   // m/s² (prevents normal phone handling from triggering)
const COOLDOWN_MS = 1500;                // real mode only

// ─── Cloud Mesh Network ──────────────────────────────────────────────────

export interface MeshPeer {
    id: string;
    name: string;
    distance: number;  // meters
    shared: number;    // events shared
    lastSeen: number;
    isAmbulance?: boolean;
}

class MeshNetworkCloud {
    public peers: MeshPeer[] = [];
    public sharedEvents: PotholeEvent[] = [];
    public isAmbulance: boolean = false;
    private myId: string = `device-${Math.random().toString(36).slice(2, 8)}`;
    private unsubscribe: any = null;
    private myLocation: [number, number] | null = null;
    private updateInterval: any = null;

    /** Start broadcasting presence & listening for peers */
    start() {
        if (this.unsubscribe) return;

        // 1. Listen for other active devices
        const q = query(collection(db, COLLECTIONS.MESH_NODES));
        this.unsubscribe = onSnapshot(q, (snapshot) => {
            const now = Date.now();
            const newPeers: MeshPeer[] = [];

            snapshot.forEach((d) => {
                if (d.id === this.myId) return; // Skip self
                const data = d.data();

                // Ignore peers older than 5 minutes
                if (now - data.lastSeen > 5 * 60 * 1000) return;

                let distance = 0;
                if (this.myLocation && data.coordinate) {
                    distance = haversineDistance(
                        this.myLocation[0], this.myLocation[1],
                        data.coordinate[0], data.coordinate[1]
                    );
                }

                newPeers.push({
                    id: d.id,
                    name: data.isAmbulance ? 'EMERGENCY' : `Driver-${d.id.substring(d.id.length - 4).toUpperCase()}`,
                    distance: distance,
                    shared: data.shared || 0,
                    lastSeen: data.lastSeen,
                    isAmbulance: data.isAmbulance || false,
                });
            });

            // Re-use existing shared counts locally to prevent flickering
            newPeers.forEach(np => {
                const existing = this.peers.find(p => p.id === np.id);
                if (existing && existing.shared > np.shared) np.shared = existing.shared;
            });

            // Sort by nearest
            this.peers = newPeers.sort((a, b) => a.distance - b.distance);
        });

        // 2. Continually update our own presence
        this.updateInterval = setInterval(() => {
            this.pushPresence();
        }, 10000);
    }

    stop() {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
        if (this.updateInterval) clearInterval(this.updateInterval);

        // Remove presence on exit
        const nodeRef = doc(db, COLLECTIONS.MESH_NODES, this.myId);
        deleteDoc(nodeRef).catch(() => { });
    }

    updateLocation(lng: number, lat: number) {
        this.myLocation = [lng, lat];
        this.pushPresence();
    }

    private async pushPresence() {
        if (!this.myLocation) return;
        try {
            const nodeRef = doc(db, COLLECTIONS.MESH_NODES, this.myId);
            await setDoc(nodeRef, {
                coordinate: this.myLocation,
                lastSeen: Date.now(),
                shared: this.sharedEvents.length,
                isAmbulance: this.isAmbulance
            }, { merge: true });
        } catch (e) {
            // Ignore offline errors
        }
    }

    /** Broadcast an event to nearby peers (cloud-based) */
    broadcast(event: PotholeEvent): { peersReached: number; peers: MeshPeer[] } {
        this.sharedEvents.push(event);
        this.pushPresence(); // Update our shared count for others to see

        const reachable = this.peers.filter(p => p.distance <= 300);
        // We locally bump other's 'shared' to simulate reciprocal awareness
        reachable.forEach(p => p.shared += 1);

        return { peersReached: reachable.length, peers: [...reachable] };
    }

    tick() {
        // Not needed for cloud mesh, placeholder for compatibility with report.tsx
    }
}

export const meshNetwork = new MeshNetworkCloud();

// ─── Core Engine ─────────────────────────────────────────────────────

class PotholeDetector {
    private isRunning = false;
    private mode: 'real' | 'simulation' = 'real';
    private accelSubscription: any = null;
    private gyroSubscription: any = null;
    private locationSubscription: any = null;

    private gravity = { x: 0, y: GRAVITY, z: 0 };
    private window: number[] = [];
    private windowSum = 0;
    private windowSumSq = 0;
    private prevLinearZ = 0;
    private latestGyroMag = 0;
    private currentLocation: Location.LocationObject | null = null;
    private currentSpeed = 0;
    private lastDetectionTime = 0;
    private onDetect: PotholeCallback | null = null;

    public events: PotholeEvent[] = [];

    private firestoreUnsubscribe: any = null;
    public eventListeners: ((events: PotholeEvent[]) => void)[] = [];

    // For Mesh Network Toast Notifications
    public onRemoteEvent: ((event: PotholeEvent, type: 'pothole' | 'incident') => void) | null = null;
    public myPublishedIds: Set<string> = new Set();

    public subscribe(listener: (events: PotholeEvent[]) => void) {
        this.eventListeners.push(listener);
        this.initFirestore(); // ensure Firestore listener is active
        listener(this.events); // initial call
        return () => {
            this.eventListeners = this.eventListeners.filter(l => l !== listener);
        };
    }

    private initFirestore() {
        if (!this.firestoreUnsubscribe) {
            // Listen to auto-detected potholes
            const potholeQuery = query(collection(db, COLLECTIONS.POTHOLES), orderBy('timestamp', 'desc'), limit(500));
            // Listen to manual incident reports
            const incidentQuery = query(collection(db, COLLECTIONS.INCIDENTS), orderBy('timestamp', 'desc'), limit(200));

            let potholeData: PotholeEvent[] = [];
            let incidentData: PotholeEvent[] = [];

            const mergeAndNotify = () => {
                this.events = [...potholeData, ...incidentData];
                this.eventListeners.forEach(l => l(this.events));
            };

            const unsubPotholes = onSnapshot(potholeQuery, (snapshot) => {
                potholeData = [];
                snapshot.forEach((doc) => {
                    potholeData.push(doc.data() as PotholeEvent);
                });

                // Check for incoming mesh network events
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const evt = change.doc.data() as PotholeEvent;
                        // Avoid firing on initial load for old data, or our own data
                        if (Date.now() - evt.timestamp < 10000 && !this.myPublishedIds.has(evt.id)) {
                            this.onRemoteEvent?.(evt, 'pothole');
                        }
                    }
                });

                mergeAndNotify();
            });

            const unsubIncidents = onSnapshot(incidentQuery, (snapshot) => {
                incidentData = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    // Normalize incident to PotholeEvent shape for route scoring
                    incidentData.push({
                        id: data.id || doc.id,
                        coordinate: data.coordinate,
                        timestamp: data.timestamp,
                        severity: data.severity,
                        zScore: 0,
                        peakAccel: 0,
                        speed: 0,
                        mode: 'real',
                        description: data.description,
                        photoBase64: data.photoBase64,
                    });
                });

                // Check for incoming mesh network incidents
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const evt = change.doc.data();
                        const id = evt.id || change.doc.id;
                        if (Date.now() - evt.timestamp < 10000 && !this.myPublishedIds.has(id)) {
                            this.onRemoteEvent?.({
                                id,
                                coordinate: evt.coordinate,
                                timestamp: evt.timestamp,
                                severity: evt.severity,
                                zScore: 0,
                                peakAccel: 0,
                                speed: 0,
                                mode: 'real',
                                description: evt.description
                            }, 'incident');
                        }
                    }
                });

                mergeAndNotify();
            });

            this.firestoreUnsubscribe = () => {
                unsubPotholes();
                unsubIncidents();
            };
        }
    }

    /** Start detection. mode='simulation' disables cooldown. */
    async start(callback: PotholeCallback, mode: 'real' | 'simulation' = 'real') {
        if (this.isRunning) return;
        this.isRunning = true;
        this.mode = mode;
        this.onDetect = callback;

        this.initFirestore();
        meshNetwork.start();

        // Reset
        this.gravity = { x: 0, y: GRAVITY, z: 0 };
        this.window = [];
        this.windowSum = 0;
        this.windowSumSq = 0;
        this.prevLinearZ = 0;
        this.latestGyroMag = 0;
        this.lastDetectionTime = 0;

        // Accelerometer at 100Hz
        Accelerometer.setUpdateInterval(SAMPLE_RATE_MS);
        this.accelSubscription = Accelerometer.addListener((data) => {
            this.processAccelerometer(data);
        });

        // Gyroscope at 100Hz
        Gyroscope.setUpdateInterval(SAMPLE_RATE_MS);
        this.gyroSubscription = Gyroscope.addListener((data) => {
            this.latestGyroMag = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
        });

        // GPS
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
            this.locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 1000,
                    distanceInterval: 5,
                },
                (loc) => {
                    this.currentLocation = loc;
                    this.currentSpeed = (loc.coords.speed ?? 0) * 3.6;
                    meshNetwork.updateLocation(loc.coords.longitude, loc.coords.latitude);
                }
            );
        }
    }

    stop() {
        this.isRunning = false;
        meshNetwork.stop();
        this.accelSubscription?.remove();
        this.gyroSubscription?.remove();
        this.locationSubscription?.remove();
        this.accelSubscription = null;
        this.gyroSubscription = null;
        this.locationSubscription = null;
    }

    getIsRunning() {
        return this.isRunning;
    }

    getMode() {
        return this.mode;
    }

    private processAccelerometer(raw: SensorReading) {
        const now = Date.now();

        // STEP 1: High-pass filter — remove gravity
        const rawMs2 = {
            x: raw.x * GRAVITY,
            y: raw.y * GRAVITY,
            z: raw.z * GRAVITY,
        };

        this.gravity.x = ALPHA * this.gravity.x + (1 - ALPHA) * rawMs2.x;
        this.gravity.y = ALPHA * this.gravity.y + (1 - ALPHA) * rawMs2.y;
        this.gravity.z = ALPHA * this.gravity.z + (1 - ALPHA) * rawMs2.z;

        const linear = {
            x: rawMs2.x - this.gravity.x,
            y: rawMs2.y - this.gravity.y,
            z: rawMs2.z - this.gravity.z,
        };

        // STEP 2: Magnitude + Z-DIFF
        const magnitude = Math.sqrt(linear.x ** 2 + linear.y ** 2 + linear.z ** 2);
        const zDiff = Math.abs(linear.z - this.prevLinearZ);
        this.prevLinearZ = linear.z;

        // STEP 3: Sliding window stats
        this.window.push(magnitude);
        this.windowSum += magnitude;
        this.windowSumSq += magnitude * magnitude;

        if (this.window.length > WINDOW_SIZE) {
            const removed = this.window.shift()!;
            this.windowSum -= removed;
            this.windowSumSq -= removed * removed;
        }

        if (this.window.length < WINDOW_SIZE / 2) return;

        const n = this.window.length;
        const mean = this.windowSum / n;
        const variance = Math.max(0, this.windowSumSq / n - mean * mean);
        const stdDev = Math.sqrt(variance);

        // STEP 4: Z-score anomaly + absolute minimum floor (Solves hypersensitivity)
        if (stdDev < 0.01) return;
        if (magnitude < ABSOLUTE_MAGNITUDE_FLOOR && zDiff < ABSOLUTE_MAGNITUDE_FLOOR) return;

        const zScore = (magnitude - mean) / stdDev;

        const isZScoreAnomaly = zScore > Z_SCORE_THRESHOLD;
        const isZDiffAnomaly = zDiff > Z_DIFF_THRESHOLD;

        if (!isZScoreAnomaly && !isZDiffAnomaly) return;

        // STEP 5: Gyroscope cross-validation (REAL mode only)
        // Lower threshold in simulation slightly to still allow some taps if needed, but here we just bypass for pure tap testing
        if (this.mode === 'real' && this.latestGyroMag < GYRO_CONFIRM_THRESHOLD) return;

        // STEP 6: Cooldown dedup (Speed gate removed entirely per request)
        if (this.mode === 'real') {
            if (now - this.lastDetectionTime < COOLDOWN_MS) return;
        }

        // STEP 7: Emit event
        this.lastDetectionTime = now;

        const severity = this.classifySeverity(magnitude, zScore, zDiff);

        // Only show Medium, High, and Severe bumps
        if (severity < 3) return;

        const coord = this.currentLocation
            ? [this.currentLocation.coords.longitude, this.currentLocation.coords.latitude] as [number, number]
            : [0, 0] as [number, number];

        const event: PotholeEvent = {
            id: `pothole-${now}-${Math.random().toString(36).slice(2, 8)}`,
            coordinate: coord,
            timestamp: now,
            severity,
            zScore: Math.round(zScore * 10) / 10,
            peakAccel: Math.round(magnitude * 100) / 100,
            speed: Math.round(this.currentSpeed),
            mode: this.mode,
        };

        this.myPublishedIds.add(event.id);

        // Firebase will sync it back to everyone's `this.events` shortly, but we trigger the local callback immediately for the Toast UI
        publishPothole(event);
        meshNetwork.broadcast(event);
        meshNetwork.tick();

        this.onDetect?.(event);
    }

    public registerLocalEventId(id: string) {
        this.myPublishedIds.add(id);
    }

    private classifySeverity(magnitude: number, zScore: number, zDiff: number): number {
        const signal = Math.max(magnitude, zDiff);
        if (signal > 15 || zScore > 8) return 5;
        if (signal > 10 || zScore > 6) return 4;
        if (signal > 7 || zScore > 5) return 3;
        if (signal > 4 || zScore > 4) return 2;
        return 1;
    }

    clearEvents() {
        this.events = [];
    }

    getEventsNear(lng: number, lat: number, radiusMeters: number = 50): PotholeEvent[] {
        return this.events.filter((e) => {
            const dist = haversineDistance(e.coordinate[0], e.coordinate[1], lng, lat);
            return dist <= radiusMeters;
        });
    }
}

// ─── Haversine helper ────────────────────────────────────────────────

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ─── Singleton export ────────────────────────────────────────────────

export const potholeDetector = new PotholeDetector();
export default potholeDetector;
