/**
 * RoadQualityScorer — Scores and re-ranks route alternatives
 * based on crowdsourced pothole data.
 *
 * ALGORITHM:
 *   For each candidate route from Mapbox:
 *     1. Sample N points evenly along the route polyline
 *     2. For each sample point, query nearby pothole events (30m radius)
 *     3. Accumulate a penalty: Σ(severity * decay_factor)
 *        where decay_factor = exp(-age_hours / HALF_LIFE_HOURS)
 *        (older reports matter less — roads get fixed)
 *     4. Weighted score = base_duration + penalty * PENALTY_WEIGHT
 *     5. Route with lowest weighted score is the "safest"
 *
 * The penalty weight is calibrated so that a single severity-5
 * pothole adds ~60 seconds of equivalent "badness" to the route.
 */

import * as turf from '@turf/turf';
import type { PotholeEvent } from './potholeDetector';

// ─── Constants ───────────────────────────────────────────────────────

const SAMPLE_SPACING_METERS = 50;        // sample every 50m along route
const SEARCH_RADIUS_METERS = 100;         // potholes within 100m of route count
const PENALTY_PER_SEVERITY = 120;         // 2 minutes (120 seconds) added per severity point
const HALF_LIFE_HOURS = 168;               // pothole reports decay over a week

// ─── Types ───────────────────────────────────────────────────────────

export interface ScoredRoute {
    routeIndex: number;
    baseDuration: number;           // seconds (from Mapbox)
    baseDistance: number;           // meters
    potholeCount: number;           // how many potholes along this route
    totalPenalty: number;           // penalty in equivalent seconds
    weightedScore: number;          // baseDuration + totalPenalty
    qualityLabel: 'smooth' | 'fair' | 'rough';
}

// ─── Haversine ───────────────────────────────────────────────────────

function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Core Scoring ────────────────────────────────────────────────────

/**
 * Score a single route against the known pothole database
 */
export function scoreRoute(
    route: any,
    routeIndex: number,
    potholeEvents: PotholeEvent[],
    isWomensMode: boolean = false
): ScoredRoute {
    const now = Date.now();
    const geometry = route.geometry;

    if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
        return {
            routeIndex,
            baseDuration: route.duration || 0,
            baseDistance: route.distance || 0,
            potholeCount: 0,
            totalPenalty: 0,
            weightedScore: route.duration || 0,
            qualityLabel: 'smooth',
        };
    }

    // Create a Turf linestring from the route
    const line = turf.lineString(geometry.coordinates);
    const routeLength = turf.length(line, { units: 'meters' });

    // To prevent the React Native JS thread from freezing on very long routes (e.g. 1000km+),
    // we do NOT use turf.along in a massive loop (which is O(N^2) and extremely slow).
    // Instead, Mapbox provides extremely high-res geometries, so we simply use their provided 
    // coordinate vertices directly! We cap the samples at ~500 points to keep the loops lightning fast.
    const maxSamples = 500;
    const step = Math.max(1, Math.floor(geometry.coordinates.length / maxSamples));
    const samplePoints: [number, number][] = geometry.coordinates.filter((_: any, i: number) => i % step === 0);

    // For each sample point, find nearby potholes and accumulate penalty
    let totalPenalty = 0;
    let potholeCount = 0;
    const countedPotholes = new Set<string>(); // avoid double-counting

    for (const [sLng, sLat] of samplePoints) {
        for (const pothole of potholeEvents) {
            if (countedPotholes.has(pothole.id)) continue;

            const dist = haversine(sLng, sLat, pothole.coordinate[0], pothole.coordinate[1]);
            if (dist <= SEARCH_RADIUS_METERS) {
                countedPotholes.add(pothole.id);
                potholeCount++;

                // Time-decay: older reports penalize less (exponential decay)
                const ageMs = now - pothole.timestamp;
                const ageHours = ageMs / (1000 * 60 * 60);
                const decay = Math.exp((-ageHours * Math.LN2) / HALF_LIFE_HOURS);

                // Proximity weighting: closer to route center = higher penalty
                const proximityFactor = 1 - dist / SEARCH_RADIUS_METERS;

                if (pothole.severity >= 5) {
                    // "Should not go at any cost" -> MASSIVE penalty to guarantee reroute
                    totalPenalty += 100000;
                } else {
                    totalPenalty +=
                        pothole.severity * PENALTY_PER_SEVERITY * decay * (0.5 + 0.5 * proximityFactor);
                }
            }
        }
    }

    // --- Women's Only Mode Logic (Highway Priority vs Side-Streets) ---
    // Instead of relying on flawed Mapbox traffic annotations, we use Physics.
    // Highways (NH48) allow faster average speeds. Narrow, isolated side roads (JNU) force slower speeds.
    // We heavily penalize routes with lower average speeds to force the algorithm onto main lit arterial roads.
    if (isWomensMode && route.distance && route.duration) {
        const averageSpeedMps = route.distance / route.duration;

        // If the route's average speed is less than 10.5 m/s (~38 km/h), it means it's full of narrow side streets
        if (averageSpeedMps < 10.5) {
            // Apply a massive 15-minute penalty to force rerouting
            totalPenalty += 900;
        } else {
            // Reward highways with a bonus
            totalPenalty -= 300;
        }
    }

    const baseDuration = route.duration || 0;
    const weightedScore = baseDuration + totalPenalty;

    // Quality label
    let qualityLabel: 'smooth' | 'fair' | 'rough' = 'smooth';
    const potholesPer10Km = (potholeCount / (routeLength / 10000)) || 0;
    if (potholesPer10Km > 5) qualityLabel = 'rough';
    else if (potholesPer10Km > 2) qualityLabel = 'fair';

    return {
        routeIndex,
        baseDuration,
        baseDistance: route.distance || 0,
        potholeCount,
        totalPenalty: Math.round(totalPenalty),
        weightedScore: Math.round(weightedScore),
        qualityLabel,
    };
}

/**
 * Score all candidate routes and return them sorted (best first).
 */
export function scoreAndRankRoutes(
    routes: any[],
    potholeEvents: PotholeEvent[],
    isWomensMode: boolean = false
): ScoredRoute[] {
    const scored = routes.map((route, idx) => scoreRoute(route, idx, potholeEvents, isWomensMode));
    // Sort by weighted score (lowest = best route)
    scored.sort((a, b) => a.weightedScore - b.weightedScore);
    return scored;
}

/**
 * Get the best route index from the scored results.
 */
export function getBestRouteIndex(
    routes: any[],
    potholeEvents: PotholeEvent[],
    isWomensMode: boolean = false
): number {
    if (routes.length === 0) return 0;
    if (potholeEvents.length === 0 && !isWomensMode) return 0; // no data, use Mapbox default

    const ranked = scoreAndRankRoutes(routes, potholeEvents, isWomensMode);
    return ranked[0].routeIndex;
}
