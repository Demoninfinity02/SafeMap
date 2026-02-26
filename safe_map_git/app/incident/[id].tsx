import Mapbox from '@rnmapbox/maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { AlertTriangle, Calendar, ChevronLeft, MapPin, Radio } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { potholeDetector, PotholeEvent } from '../../src/services/potholeDetector';
import { useTheme } from '../ThemeContext';

export default function IncidentDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { isDarkMode } = useTheme();

    const [event, setEvent] = useState<PotholeEvent | null>(null);

    // Color tokens
    const bg = isDarkMode ? '#000000' : '#f2f2f7';
    const cardBg = isDarkMode ? '#1c1c1e' : '#ffffff';
    const labelColor = isDarkMode ? '#ffffff' : '#000000';
    const secondaryLabel = isDarkMode ? '#8e8e93' : '#8e8e93';
    const separator = isDarkMode ? '#38383a' : '#c6c6c8';
    const activeAccent = '#5a45ff';

    useEffect(() => {
        const found = potholeDetector.events.find(e => e.id === id);
        if (found) setEvent(found);
    }, [id]);

    if (!event) return null; // or a loading/not found state

    const isManual = event.speed === 0 && event.peakAccel === 0;

    const getSeverityDetails = (sev: number) => {
        switch (sev) {
            case 5: return { color: '#ef4444', label: 'Severe', desc: 'Do not travel this route' };
            case 4: return { color: '#f87171', label: 'High', desc: 'Potential damage to vehicle' };
            case 3: return { color: '#fb923c', label: 'Medium', desc: 'Vehicle wear risk' };
            case 2: return { color: '#fbbf24', label: 'Low', desc: 'Uncomfortable but passable' };
            default: return { color: '#34d399', label: 'Very Low', desc: 'Small bump, barely noticeable' };
        }
    };

    const sev = getSeverityDetails(event.severity);

    return (
        <View style={[s.container, { backgroundColor: bg }]}>
            <ExpoStatusBar style={isDarkMode ? 'light' : 'dark'} />

            {/* iOS-style header positioned absolutely over map */}
            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
                    <ChevronLeft size={28} color="#ffffff" strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            <ScrollView bounces={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
                {/* ── MAP HEADER ── */}
                <View style={s.mapContainer}>
                    <Mapbox.MapView
                        style={StyleSheet.absoluteFillObject}
                        projection="mercator"
                        pitchEnabled={false}
                        rotateEnabled={false}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        compassEnabled={false}
                        scaleBarEnabled={false}
                        styleURL={isDarkMode ? "mapbox://styles/atharv714/cmlxyl4ov001101sc15hxdsnx" : Mapbox.StyleURL.Street}
                    >
                        <Mapbox.Camera
                            zoomLevel={15.5}
                            centerCoordinate={event.coordinate}
                            animationMode="flyTo"
                        />
                        <Mapbox.PointAnnotation
                            id="incident-pin"
                            coordinate={event.coordinate}
                        >
                            <View style={s.pinOuter}>
                                <View style={[s.pinInner, { backgroundColor: sev.color }]} />
                            </View>
                        </Mapbox.PointAnnotation>
                    </Mapbox.MapView>
                    <View style={s.mapGradient} pointerEvents="none" />
                </View>

                {/* ── EVENT INFO ── */}
                <View style={s.content}>
                    <View style={s.titleRow}>
                        <View style={[s.iconBox, { backgroundColor: isManual ? sev.color + '20' : activeAccent + '20' }]}>
                            {isManual ? (
                                <AlertTriangle size={24} color={sev.color} />
                            ) : (
                                <Radio size={24} color={activeAccent} />
                            )}
                        </View>
                        <View style={s.titleWrap}>
                            <Text style={[s.title, { color: labelColor }]}>{isManual ? 'Reported Hazard' : 'Auto-detected Pothole'}</Text>
                            <View style={s.timeRow}>
                                <Calendar size={14} color={secondaryLabel} />
                                <Text style={[s.timeText, { color: secondaryLabel }]}>
                                    {new Date(event.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── SEVERITY CARD ── */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel }]}>SEVERITY</Text>
                    <View style={[s.card, { backgroundColor: cardBg }]}>
                        <View style={s.cardRow}>
                            <View style={[s.severityBadge, { backgroundColor: sev.color + '20' }]}>
                                <Text style={[s.severityBadgeText, { color: sev.color }]}>{sev.label}</Text>
                            </View>
                            <Text style={[s.severityDesc, { color: labelColor }]}>{sev.desc}</Text>
                        </View>
                    </View>

                    {/* ── DETAILS (PHOTO/TEXT OR SENSORS) ── */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel }]}>DETAILS</Text>
                    <View style={[s.card, { backgroundColor: cardBg, padding: 16 }]}>
                        {isManual ? (
                            <>
                                {event.photoBase64 ? (
                                    <View style={s.photoWrapper}>
                                        <Image source={{ uri: event.photoBase64 }} style={s.photo} />
                                    </View>
                                ) : null}
                                {event.description ? (
                                    <Text style={[s.descText, { color: labelColor, marginTop: event.photoBase64 ? 12 : 0 }]}>
                                        {event.description}
                                    </Text>
                                ) : (
                                    !event.photoBase64 && <Text style={[s.descText, { color: secondaryLabel, fontStyle: 'italic' }]}>No description provided.</Text>
                                )}
                            </>
                        ) : (
                            <View style={s.statsGrid}>
                                <View style={s.statBox}>
                                    <Text style={[s.statTitle, { color: secondaryLabel }]}>G-Force</Text>
                                    <Text style={[s.statValue, { color: labelColor }]}>{event.peakAccel} <Text style={s.statUnit}>m/s²</Text></Text>
                                </View>
                                <View style={s.statBox}>
                                    <Text style={[s.statTitle, { color: secondaryLabel }]}>Anomaly (Z)</Text>
                                    <Text style={[s.statValue, { color: labelColor }]}>{event.zScore} <Text style={s.statUnit}>σ</Text></Text>
                                </View>
                                <View style={s.statBox}>
                                    <Text style={[s.statTitle, { color: secondaryLabel }]}>Speed</Text>
                                    <Text style={[s.statValue, { color: labelColor }]}>{event.speed} <Text style={s.statUnit}>km/h</Text></Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Location Exact coords mapping */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel }]}>LOCATION</Text>
                    <View style={[s.card, { backgroundColor: cardBg }]}>
                        <View style={s.cardRow}>
                            <MapPin size={20} color={secondaryLabel} />
                            <Text style={[s.coordText, { color: labelColor }]}>
                                {event.coordinate[1].toFixed(5)}, {event.coordinate[0].toFixed(5)}
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    header: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 10,
        paddingHorizontal: 16,
    },
    backBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4
    },
    mapContainer: {
        width: '100%',
        height: 250,
        position: 'relative'
    },
    pinOuter: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center', justifyContent: 'center'
    },
    pinInner: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2, borderColor: '#ffffff',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5
    },
    mapGradient: {
        position: 'absolute', bottom: -1, left: 0, right: 0, height: 30,
        // Since react-native doesn't easily let us fade to transparent without a package like expo-linear-gradient, we just keep the map clean here.
    },
    content: {
        paddingTop: 24,
    },
    titleRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        alignItems: 'center',
        marginBottom: 8,
    },
    iconBox: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 16,
    },
    titleWrap: {
        flex: 1,
    },
    title: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 22,
        marginBottom: 4,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    timeText: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 14,
    },
    sectionHeader: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 13,
        textTransform: 'uppercase',
        paddingHorizontal: 36,
        paddingTop: 32,
        paddingBottom: 8,
    },
    card: {
        marginHorizontal: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12
    },
    severityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    severityBadgeText: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 13,
        textTransform: 'uppercase',
    },
    severityDesc: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 15,
        flex: 1,
    },
    photoWrapper: {
        width: '100%',
        height: 200,
        borderRadius: 8,
        overflow: 'hidden',
    },
    photo: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover'
    },
    descText: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 16,
        lineHeight: 22,
    },
    coordText: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 15,
        letterSpacing: 0.5,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    statBox: {
        alignItems: 'center',
    },
    statTitle: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 12,
        marginBottom: 4,
        textTransform: 'uppercase'
    },
    statValue: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 20,
    },
    statUnit: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 14,
    }
});
