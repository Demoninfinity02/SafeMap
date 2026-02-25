// Mapbox API Service
// Using fetch instead of the SDK to avoid Node.js polyfill issues in React Native

export const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoiYXRoYXJ2NzE0IiwiYSI6ImNtZzF3OTZzYjBoaXcya3M2bDJsOGM3ZGoifQ.evBj8EGSAJMsdXc1flPWww';

if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN.includes('REPLACE')) {
    console.warn('Mapbox Access Token is missing! Please set EXPO_PUBLIC_MAPBOX_TOKEN in .env or src/services/mapbox.ts');
}

const BASE_URL = 'https://api.mapbox.com';

export const getDirections = async (coords: [number, number][], profile: string = 'driving') => {
    try {
        const coordsString = coords.map(c => `${c[0]},${c[1]}`).join(';');
        const actualProfile = profile === 'driving' ? 'driving-traffic' : profile;
        const annotations = actualProfile === 'driving-traffic' ? '&annotations=congestion,distance' : '';
        const url = `${BASE_URL}/directions/v5/mapbox/${actualProfile}/${coordsString}?overview=full&steps=true&geometries=geojson&alternatives=true${annotations}&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.routes && json.routes.length > 0) {
            return json.routes;
        }
    } catch (error) {
        console.error('Error fetching directions:', error);
    }
    return null;
};

export const searchPlaces = async (query: string, proximity?: [number, number]) => {
    try {
        // Appended &country=IN to prioritize/limit results to India
        let url = `${BASE_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=IN`;
        if (proximity) {
            url += `&proximity=${proximity[0]},${proximity[1]}`;
        }
        const response = await fetch(url);
        const json = await response.json();

        return json.features || [];
    } catch (error) {
        console.error('Error searching places:', error);
        return [];
    }
};
