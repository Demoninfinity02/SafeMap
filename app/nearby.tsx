import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { AlertTriangle, ChevronLeft, MapPin, Radio } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { potholeDetector, PotholeEvent } from '../src/services/potholeDetector';
import { useTheme } from './ThemeContext';

export default function NearbyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { isDarkMode } = useTheme();

    const [events, setEvents] = useState<PotholeEvent[]>([]);
    const [userLoc, setUserLoc] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(true);

    // Color tokens
    const bg = isDarkMode ? '#000000' : '#f2f2f7';
    const cardBg = isDarkMode ? '#000000ff' : '#ffffff';
    const labelColor = isDarkMode ? '#ffffff' : '#000000';
    const secondaryLabel = isDarkMode ? '#8e8e93' : '#8e8e93';
    const separator = isDarkMode ? '#38383a' : '#c6c6c8';
    const activeAccent = '#5a45ff';

    useEffect(() => {
        // Subscribe to all incidents + pothole events
        const unsub = potholeDetector.subscribe(data => {
            setEvents(data);
            setLoading(false);
        });

        // Get location for distance string
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                setUserLoc(loc);
            }
        })();

        return () => unsub();
    }, []);

    // ─── Haversine Helper ───
    const getDistanceStr = (coord: [number, number]) => {
        if (!userLoc) return '';
        const R = 6371; // km
        const dLat = (userLoc.coords.latitude - coord[1]) * Math.PI / 180;
        const dLon = (userLoc.coords.longitude - coord[0]) * Math.PI / 180;
        const lat1 = coord[1] * Math.PI / 180;
        const lat2 = userLoc.coords.latitude * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;

        if (d < 1) return `${Math.round(d * 1000)}m away`;
        return `${d.toFixed(1)}km away`;
    };

    const getSeverityColor = (sev: number) => {
        switch (sev) {
            case 5: return '#ef4444';
            case 4: return '#f87171';
            case 3: return '#fb923c';
            case 2: return '#fbbf24';
            default: return '#34d399';
        }
    };

    const getSeverityLabel = (sev: number) => {
        switch (sev) {
            case 5: return 'Severe';
            case 4: return 'High';
            case 3: return 'Medium';
            case 2: return 'Low';
            default: return 'Very Low';
        }
    };

    const renderItem = ({ item, index }: { item: PotholeEvent, index: number }) => {
        const isLast = index === events.length - 1;
        const distStr = getDistanceStr(item.coordinate);
        // We know it's manual if speed === 0 and peakAccel === 0 based on our logic in potholeDetector.ts
        const isManual = item.speed === 0 && item.peakAccel === 0;

        return (
            <TouchableOpacity
                style={[s.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}
                activeOpacity={0.6}
                onPress={() => router.push(`/incident/${item.id}`)}
            >
                <View style={[s.iconBox, { backgroundColor: isDarkMode ? '#2c2c2e' : '#e5e5ea' }]}>
                    {isManual ? (
                        <AlertTriangle size={18} color={getSeverityColor(item.severity)} />
                    ) : (
                        <Radio size={18} color={getSeverityColor(item.severity)} />
                    )}
                </View>

                <View style={s.rowContent}>
                    <View style={s.rowTop}>
                        <Text style={[s.eventTitle, { color: labelColor }]}>
                            {isManual ? 'Reported Hazard' : 'Auto-detected Pothole'}
                        </Text>
                        <Text style={[s.eventDist, { color: secondaryLabel }]}>{distStr}</Text>
                    </View>
                    <View style={s.rowBottom}>
                        <View style={[s.badge, { backgroundColor: getSeverityColor(item.severity) + '20' }]}>
                            <Text style={[s.badgeText, { color: getSeverityColor(item.severity) }]}>{getSeverityLabel(item.severity)}</Text>
                        </View>
                        <Text style={[s.eventTime, { color: secondaryLabel }]}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[s.container, { backgroundColor: cardBg }]}>
            <ExpoStatusBar style={isDarkMode ? 'light' : 'dark'} />

            {/* iOS-style header */}
            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backRow}>
                    <ChevronLeft size={28} color={activeAccent} strokeWidth={2.2} />
                    <Text style={[s.backLabel, { color: activeAccent }]}>Map</Text>
                </TouchableOpacity>
            </View>

            <Text style={[s.largeTitle, { color: labelColor }]}>Nearby</Text>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="small" color={activeAccent} />
                </View>
            ) : events.length === 0 ? (
                <View style={s.center}>
                    <MapPin size={40} color={separator} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                    <Text style={[s.emptyText, { color: secondaryLabel }]}>No reported hazards nearby</Text>
                </View>
            ) : (
                <FlatList
                    data={events}
                    keyExtractor={(it) => it.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingBottom: 0 },
    backRow: { flexDirection: 'row', alignItems: 'center' },
    backLabel: { fontFamily: 'GoogleSans-Regular', fontSize: 17, marginLeft: 2 },
    largeTitle: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 34,
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 16,
    },
    row: {
        flexDirection: 'row',
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    rowContent: {
        flex: 1,
    },
    rowTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    eventTitle: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 16,
    },
    eventDist: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 13,
    },
    rowBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    eventTime: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 13,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 16,
    }
});
