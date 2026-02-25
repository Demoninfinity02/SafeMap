/**
 * Firebase — Core initialization & shared Firestore helpers
 */

import { initializeApp } from 'firebase/app';
import { addDoc, collection, deleteDoc, getDocs, getFirestore, query, where } from 'firebase/firestore';

// ─── Config ──────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey: "AIzaSyBgGO5T8LpQjojzginIxQlxdSuHcDvrmQY",
    authDomain: "safe-map-f62d7.firebaseapp.com",
    projectId: "safe-map-f62d7",
    storageBucket: "safe-map-f62d7.firebasestorage.app",
    messagingSenderId: "915795766559",
    appId: "1:915795766559:web:03a244e58c4fbbc3dc142a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ─── Collections ─────────────────────────────────────────────────────

export const COLLECTIONS = {
    POTHOLES: 'potholes',
    INCIDENTS: 'incidents',
    MESH_NODES: 'mesh_nodes'
} as const;

// ─── Pothole helpers (auto-detected bumps) ───────────────────────────

export const publishPothole = async (event: any) => {
    try {
        await addDoc(collection(db, COLLECTIONS.POTHOLES), event);
    } catch (error) {
        console.warn("[Firebase] Failed to publish pothole:", error);
    }
};

export const clearPotholes = async (mode: 'real' | 'simulation') => {
    try {
        const q = query(collection(db, COLLECTIONS.POTHOLES), where('mode', '==', mode));
        const snapshot = await getDocs(q);
        const promises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(promises);
        console.log(`[Firebase] Cleared ${promises.length} ${mode} potholes`);
    } catch (error) {
        console.warn(`[Firebase] Failed to clear ${mode} potholes:`, error);
    }
};

// ─── Incident helpers (manual user reports) ──────────────────────────

export interface IncidentReport {
    id: string;
    coordinate: [number, number]; // [lng, lat]
    timestamp: number;
    severity: number;             // 1–5
    description: string;
    photoBase64?: string;         // base64 data URI of attached photo
    source: 'manual';
}

export const publishIncident = async (incident: IncidentReport) => {
    try {
        await addDoc(collection(db, COLLECTIONS.INCIDENTS), incident);
        console.log(`[Firebase] Incident published: ${incident.id}`);
    } catch (error) {
        console.warn("[Firebase] Failed to publish incident:", error);
    }
};

export const clearIncidents = async () => {
    try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.INCIDENTS));
        const promises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(promises);
        console.log(`[Firebase] Cleared ${promises.length} incidents`);
    } catch (error) {
        console.warn("[Firebase] Failed to clear incidents:", error);
    }
};
