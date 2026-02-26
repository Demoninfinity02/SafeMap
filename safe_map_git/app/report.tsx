import Mapbox from '@rnmapbox/maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Activity, AlertCircle, AlertTriangle, Camera, ChevronLeft, Map, MapPin, Radio, Search, Trash2, Wifi, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Keyboard, PanResponder, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearIncidents, clearPotholes, IncidentReport, publishIncident } from '../src/services/firebase';
import { searchPlaces } from '../src/services/mapbox';
import { meshNetwork, potholeDetector, PotholeEvent } from '../src/services/potholeDetector';
import { useTheme } from './ThemeContext';

// ─── Severity Config ────────────────────────────────────────────────
const SEVERITY_CONFIG = [
    { val: 1, label: 'Very Low', desc: 'Small bump, barely noticeable', color: '#34d399' },
    { val: 2, label: 'Low', desc: 'Uncomfortable but passable', color: '#fbbf24' },
    { val: 3, label: 'Medium', desc: 'Vehicle wear risk', color: '#fb923c' },
    { val: 4, label: 'High', desc: 'Potential damage to vehicle', color: '#f87171' },
    { val: 5, label: 'Severe', desc: 'Do not travel this route', color: '#ef4444' },
] as const;

export default function ReportScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { isDarkMode } = useTheme();

    const [activeTab, setActiveTab] = useState<'detection' | 'incident'>('detection');

    // ─── Incident Form ──────────────────────────────────────────────
    const [incidentSeverity, setIncidentSeverity] = useState<number>(3);
    const [incidentDesc, setIncidentDesc] = useState('');
    const [incidentPhotoBase64, setIncidentPhotoBase64] = useState<string | null>(null);
    const [incidentLocating, setIncidentLocating] = useState(false);
    const [incidentLocation, setIncidentLocation] = useState<[number, number] | null>(null);
    const [incidentSubmitting, setIncidentSubmitting] = useState(false);
    const [incidentSearchQuery, setIncidentSearchQuery] = useState('');
    const [incidentSearchResults, setIncidentSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Slider: use pixel-based positioning via onLayout
    const [trackWidth, setTrackWidth] = useState(0);
    const trackWidthRef = useRef(0);
    const sliderValRef = useRef(3);
    const sliderAnim = useRef(new Animated.Value(0)).current;
    const trackMeasured = useRef(false);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (evt, gestureState) => {
                const w = trackWidthRef.current;
                if (w > 0) {
                    const startX = ((sliderValRef.current - 1) / 4) * w;
                    let newX = startX + gestureState.dx;
                    newX = Math.max(0, Math.min(newX, w));

                    sliderAnim.setValue(newX);

                    const val = Math.round((newX / w) * 4) + 1;
                    setIncidentSeverity(val);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                const w = trackWidthRef.current;
                if (w > 0) {
                    const startX = ((sliderValRef.current - 1) / 4) * w;
                    let newX = startX + gestureState.dx;
                    newX = Math.max(0, Math.min(newX, w));

                    const val = Math.round((newX / w) * 4) + 1;
                    setSeverityAnimated(val);
                }
            }
        })
    ).current;

    useEffect(() => {
        if (params.lat && params.lng) {
            setIncidentLocation([parseFloat(params.lng as string), parseFloat(params.lat as string)]);
            setIncidentSearchQuery('Location from Map');
            setActiveTab('incident');
        }
    }, [params.lat, params.lng]);

    const handleIncidentSearch = async (text: string) => {
        setIncidentSearchQuery(text);
        if (text.trim().length > 2) {
            setIsSearching(true);
            const res = await searchPlaces(text);
            setIncidentSearchResults(res);
            setIsSearching(false);
        } else {
            setIncidentSearchResults([]);
        }
    };

    const handleSelectSearchResult = (result: any) => {
        setIncidentLocation(result.center);
        setIncidentSearchQuery(result.place_name);
        setIncidentSearchResults([]);
        Keyboard.dismiss();
    };

    const handleGetLocation = async () => {
        setIncidentLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "Location access is required.");
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setIncidentLocation([loc.coords.longitude, loc.coords.latitude]);
            setIncidentSearchQuery('Current Location');
            setIncidentSearchResults([]);
            Keyboard.dismiss();
        } catch (e) {
            console.warn(e);
        } finally {
            setIncidentLocating(false);
        }
    };

    const analyzePhotoWithGroq = async (base64Str: string) => {
        const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
        if (!apiKey) {
            setIncidentDesc("Error: EXPO_PUBLIC_GROQ_API_KEY is missing in .env");
            return;
        }

        // Auto-fill a placeholder if the description is currently empty
        setIncidentDesc((prev) => prev ? prev : "Analyzing ...");

        try {
            const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-4-scout-17b-16e-instruct",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "Briefly describe this road hazard or incident for a very short map report (under 10 words). Keep it concise without markdown." },
                                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Str}` } }
                            ]
                        }
                    ],
                    max_completion_tokens: 30,
                    temperature: 0.1
                })
            });
            const data = await res.json();

            if (!res.ok) {
                // Groq API explicit error
                setIncidentDesc(`Groq API Error: ${data?.error?.message || res.status}`);
                return;
            }

            if (data?.choices?.[0]?.message?.content) {
                const aiDesc = data.choices[0].message.content.trim().replace(/^"|"$/g, '').replace(/\n/g, ' ');
                setIncidentDesc((prev) => prev.startsWith("Analyzing") ? aiDesc : prev);
            } else {
                setIncidentDesc(`AI failed to generate. Data: ${JSON.stringify(data).slice(0, 80)}...`);
            }
        } catch (err: any) {
            console.log("Groq API Error", err);
            setIncidentDesc(`Groq API Error: ${err?.message || "Unknown error"}`);
        }
    };

    const handlePickPhoto = () => {
        Alert.alert("Attach Photo", "Choose a source", [
            {
                text: "Camera", onPress: async () => {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (!perm.granted) { Alert.alert("Permission Denied"); return; }
                    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.1, allowsEditing: true });
                    if (!result.canceled && result.assets[0].base64) {
                        setIncidentPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
                        analyzePhotoWithGroq(result.assets[0].base64);
                    }
                }
            },
            {
                text: "Gallery", onPress: async () => {
                    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!perm.granted) { Alert.alert("Permission Denied"); return; }
                    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.1, allowsEditing: true });
                    if (!result.canceled && result.assets[0].base64) {
                        setIncidentPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
                        analyzePhotoWithGroq(result.assets[0].base64);
                    }
                }
            },
            { text: "Cancel", style: "cancel" }
        ]);
    };

    const handleSubmitIncident = async () => {
        if (!incidentLocation) {
            Alert.alert("Missing Location", "Please provide a location for the incident.");
            return;
        }
        setIncidentSubmitting(true);

        const incident: IncidentReport = {
            id: `incident-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            coordinate: incidentLocation,
            timestamp: Date.now(),
            severity: incidentSeverity,
            description: incidentDesc,
            source: 'manual',
        };

        if (incidentPhotoBase64) {
            incident.photoBase64 = incidentPhotoBase64;
        }

        potholeDetector.registerLocalEventId(incident.id);
        await publishIncident(incident);

        // Broadcast to mesh network so peers get immediate updates
        meshNetwork.broadcast({
            id: incident.id,
            coordinate: incident.coordinate,
            timestamp: incident.timestamp,
            severity: incident.severity,
            zScore: 0,
            peakAccel: 0,
            speed: 0,
            mode: 'real',
            description: incident.description,
        });

        setIncidentSeverity(3);
        setIncidentDesc('');
        setIncidentPhotoBase64(null);
        setIncidentLocation(null);
        setIncidentSearchQuery('');
        setIncidentSubmitting(false);

        // Reset animation to severity 3 position
        sliderValRef.current = 3;
        if (trackWidth > 0) {
            Animated.timing(sliderAnim, { toValue: (2 / 4) * trackWidth, duration: 150, useNativeDriver: false }).start();
        }

        Alert.alert(
            "Incident Reported",
            "Your incident has been published. Routes through this area will be penalized.",
            [{ text: "OK", onPress: () => router.back() }]
        );
    };

    const handleTrackLayout = (e: any) => {
        const w = e.nativeEvent.layout.width;
        setTrackWidth(w);
        trackWidthRef.current = w;
        if (!trackMeasured.current) {
            trackMeasured.current = true;
            // Set initial position
            sliderAnim.setValue(((sliderValRef.current - 1) / 4) * w);
        }
    };

    const setSeverityAnimated = (val: number) => {
        setIncidentSeverity(val);
        sliderValRef.current = val;
        const w = trackWidthRef.current;
        if (w > 0) {
            const pos = ((val - 1) / 4) * w;
            Animated.timing(sliderAnim, { toValue: pos, duration: 150, useNativeDriver: false }).start();
        }
    };

    // ─── Detection State ────────────────────────────────────────────
    const [events, setEvents] = useState<PotholeEvent[]>([]);
    const [isDetecting, setIsDetecting] = useState(false);
    const [meshPeers, setMeshPeers] = useState(meshNetwork.peers);
    const [meshSharedCount, setMeshSharedCount] = useState(0);
    const [lastEvent, setLastEvent] = useState<PotholeEvent | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Theme ──────────────────────────────────────────────────────
    const bg = isDarkMode ? '#000000' : '#f2f2f7';
    const cardBg = isDarkMode ? '#1c1c1e' : '#ffffff';
    const labelColor = isDarkMode ? '#ffffff' : '#000000';
    const secondaryLabel = isDarkMode ? '#8e8e93' : '#8e8e93';
    const separator = isDarkMode ? '#38383a' : '#c6c6c8';
    const accent = '#5a45ff';
    const accentSoft = isDarkMode ? 'rgba(90,69,255,0.15)' : 'rgba(90,69,255,0.08)';

    const handleDetectionEvent = useCallback((event: PotholeEvent) => {
        setEvents(prev => [event, ...prev]);
        setMeshPeers([...meshNetwork.peers]);
        setMeshSharedCount(meshNetwork.sharedEvents.length);
        setLastEvent(event);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setLastEvent(null), 2500);
    }, []);

    const toggleDetection = async () => {
        if (isDetecting) {
            potholeDetector.stop();
            setIsDetecting(false);
        } else {
            await potholeDetector.start(handleDetectionEvent, 'real');
            setIsDetecting(true);
        }
    };

    const handleClearData = async () => {
        if (activeTab === 'incident') {
            await clearIncidents();
        } else {
            await clearPotholes('real');
        }
        setEvents(prev => prev.filter(e => e.mode !== 'real'));
        potholeDetector.clearEvents();
    };

    useEffect(() => {
        if (isDetecting) {
            potholeDetector.stop();
            setIsDetecting(false);
        }
    }, [activeTab]);

    useEffect(() => {
        return () => {
            if (potholeDetector.getIsRunning()) {
                potholeDetector.stop();
            }
        };
    }, []);

    const severityColor = (s: number) => {
        if (s >= 4) return '#ef4444';
        if (s >= 3) return '#f59e0b';
        return '#fb923c';
    };

    const severityLabel = (s: number) => {
        if (s >= 5) return 'SEVERE';
        if (s >= 4) return 'HIGH';
        if (s >= 3) return 'MEDIUM';
        if (s >= 2) return 'LOW';
        return 'MINOR';
    };

    const timeSince = (ts: number) => {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    };

    const renderEventItem = ({ item }: { item: PotholeEvent }) => (
        <View style={[s.eventCard, { backgroundColor: cardBg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.severityBadge, { backgroundColor: severityColor(item.severity) }]}>
                        <Text style={s.severityBadgeText}>{item.severity}</Text>
                    </View>
                    <View>
                        <Text style={[s.eventTitle, { color: labelColor }]}>{severityLabel(item.severity)} Bump</Text>
                        <Text style={[s.eventSub, { color: secondaryLabel }]}>
                            {item.peakAccel.toFixed(1)} m/s² • z-score {item.zScore}
                        </Text>
                    </View>
                </View>
                <Text style={[s.eventTime, { color: secondaryLabel }]}>{timeSince(item.timestamp)}</Text>
            </View>
            {item.coordinate[0] !== 0 && (
                <Text style={[s.eventCoord, { color: secondaryLabel }]}>
                    📍 {item.coordinate[1].toFixed(5)}, {item.coordinate[0].toFixed(5)}
                </Text>
            )}
        </View>
    );

    // ─── Current severity config ────────────────────────────────────
    const currentSev = SEVERITY_CONFIG[incidentSeverity - 1];

    return (
        <View style={[s.container, { backgroundColor: bg }]}>
            <ExpoStatusBar style={isDarkMode ? 'light' : 'dark'} />

            {/* Header */}
            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backRow}>
                    <ChevronLeft size={28} color={accent} strokeWidth={2.2} />
                    <Text style={[s.backLabel, { color: accent }]}>Map</Text>
                </TouchableOpacity>
            </View>

            <Text style={[s.largeTitle, { color: labelColor }]}>Report</Text>

            {/* ─── Tab Switcher ─────────────────────────────────────── */}
            <View style={[s.tabRow, { backgroundColor: isDarkMode ? '#1c1c1e' : '#e5e5ea' }]}>
                <TouchableOpacity
                    style={[s.tab, activeTab === 'detection' && { backgroundColor: accent }]}
                    onPress={() => setActiveTab('detection')}
                >
                    <Activity size={16} color={activeTab === 'detection' ? '#fff' : secondaryLabel} strokeWidth={2} />
                    <Text style={[s.tabText, activeTab === 'detection' && { color: '#ffffff' }]}>Detection</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.tab, activeTab === 'incident' && { backgroundColor: accent }]}
                    onPress={() => setActiveTab('incident')}
                >
                    <AlertCircle size={16} color={activeTab === 'incident' ? '#fff' : secondaryLabel} strokeWidth={2} />
                    <Text style={[s.tabText, activeTab === 'incident' && { color: '#ffffff' }]}>Report Incident</Text>
                </TouchableOpacity>
            </View>

            {/* ─── Tab Description ─────────────────────────────────── */}
            <Text style={[s.modeDesc, { color: secondaryLabel }]}>
                {activeTab === 'detection'
                    ? 'Detects Potholes using phone gyro and accelerometer sensors'
                    : 'Manually report hazards. Routes will be penalized based on severity.'}
            </Text>

            {/* ════════════════════════════════════════════════════════
                INCIDENT TAB
               ════════════════════════════════════════════════════════ */}
            {activeTab === 'incident' ? (
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── LOCATION ─────────────────────────────────── */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel }]}>LOCATION</Text>

                    {incidentLocation ? (
                        <View style={[s.card, { backgroundColor: cardBg, overflow: 'hidden' }]}>
                            <View style={{ height: 160, width: '100%', backgroundColor: '#e5e5ea' }}>
                                <Mapbox.MapView style={{ flex: 1 }} pitchEnabled={false} rotateEnabled={false} scrollEnabled={false} zoomEnabled={false} logoEnabled={false} attributionEnabled={false} styleURL={isDarkMode ? "mapbox://styles/atharv714/cmlxyl4ov001101sc15hxdsnx" : Mapbox.StyleURL.Light}>
                                    <Mapbox.Camera centerCoordinate={incidentLocation} zoomLevel={15} animationDuration={0} />
                                    <Mapbox.PointAnnotation id="incident-pin" coordinate={incidentLocation}>
                                        <View style={{ alignItems: 'center' }}>
                                            <MapPin size={32} color={currentSev.color} fill={currentSev.color} />
                                        </View>
                                    </Mapbox.PointAnnotation>
                                </Mapbox.MapView>
                            </View>
                            <View style={s.selectedLocFooter}>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={[s.selectedLocTitle, { color: labelColor }]} numberOfLines={1}>{incidentSearchQuery || 'Selected Location'}</Text>
                                    <Text style={[s.selectedLocSub, { color: secondaryLabel }]}>{incidentLocation[1].toFixed(5)}, {incidentLocation[0].toFixed(5)}</Text>
                                </View>
                                <TouchableOpacity style={[s.changeLocBtn, { backgroundColor: accentSoft }]} onPress={() => setIncidentLocation(null)}>
                                    <Text style={[s.changeLocText, { color: accent }]}>Change</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <View style={[s.searchBarInputContainer, { backgroundColor: cardBg }]}>
                                    <Search size={18} color={secondaryLabel} style={{ marginLeft: 14 }} />
                                    <TextInput style={[s.locationInput, { color: labelColor }]} placeholder="Search for a place..." placeholderTextColor={isDarkMode ? '#48484a' : '#c7c7cc'} value={incidentSearchQuery} onChangeText={handleIncidentSearch} />
                                    {isSearching ? (
                                        <ActivityIndicator size="small" color={accent} style={{ marginRight: 14 }} />
                                    ) : incidentSearchQuery.length > 0 ? (
                                        <TouchableOpacity onPress={() => { setIncidentSearchQuery(''); setIncidentSearchResults([]); }} style={{ padding: 14 }}>
                                            <X size={16} color={secondaryLabel} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                                <TouchableOpacity style={[s.iconBtn, { backgroundColor: cardBg }]} onPress={handleGetLocation}>
                                    {incidentLocating ? <ActivityIndicator size="small" color={accent} /> : <MapPin size={22} color={accent} />}
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.iconBtn, { backgroundColor: cardBg }]} onPress={() => router.push('/?selectingIncident=true')}>
                                    <Map size={22} color={accent} />
                                </TouchableOpacity>
                            </View>

                            {incidentSearchResults.length > 0 && (
                                <View style={[s.searchResultsArea, { backgroundColor: cardBg }]}>
                                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                                        {incidentSearchResults.map((item, index) => (
                                            <TouchableOpacity key={item.id} style={[s.searchResult, index !== incidentSearchResults.length - 1 && { borderBottomColor: separator, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => handleSelectSearchResult(item)}>
                                                <MapPin size={16} color={secondaryLabel} />
                                                <Text style={[s.searchResultText, { color: labelColor }]} numberOfLines={2}>{item.place_name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    )}

                    {/* ── SEVERITY ─────────────────────────────────── */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel, marginTop: 16 }]}>SEVERITY</Text>
                    <View style={[s.card, { backgroundColor: cardBg, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 }]}>
                        {/* Label + Description */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28 }}>
                            <View>
                                <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 17, color: labelColor }}>{currentSev.label}</Text>
                                <Text style={{ fontFamily: 'GoogleSans-Regular', fontSize: 13, color: secondaryLabel, marginTop: 2 }}>{currentSev.desc}</Text>
                            </View>
                        </View>

                        {/* ── macOS-style track ──────────────────── */}
                        <View style={s.sliderOuter} onLayout={handleTrackLayout}>
                            {/* Background track */}
                            <View style={[s.sliderTrackBg, { backgroundColor: isDarkMode ? '#3a3a3c' : '#d1d1d6' }]} />

                            {/* Filled track */}
                            <Animated.View style={[s.sliderTrackFill, { backgroundColor: currentSev.color, width: sliderAnim }]} />

                            {/* Thumb */}
                            <Animated.View style={[s.sliderThumb, { left: Animated.subtract(sliderAnim, 14) }]} {...panResponder.panHandlers}>
                                <View style={s.sliderThumbInner} />
                            </Animated.View>

                            {/* Invisible touch targets */}
                            <View style={s.sliderTouchRow}>
                                {[1, 2, 3, 4, 5].map(v => (
                                    <TouchableOpacity key={v} style={s.sliderTouchTarget} onPress={() => setSeverityAnimated(v)} activeOpacity={1} />
                                ))}
                            </View>
                        </View>

                        {/* Labels */}
                        <View style={s.sliderLabels}>
                            {SEVERITY_CONFIG.map(sev => (
                                <View key={sev.val} style={s.sliderLabelContainer}>
                                    <Text style={[s.sliderLabelText, { color: incidentSeverity === sev.val ? labelColor : secondaryLabel, fontFamily: incidentSeverity === sev.val ? 'GoogleSans-Bold' : 'GoogleSans-Regular' }]}>
                                        {sev.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── DETAILS ──────────────────────────────────── */}
                    <Text style={[s.sectionHeader, { color: secondaryLabel, marginTop: 16 }]}>DETAILS</Text>
                    <View style={[s.card, { backgroundColor: cardBg, padding: 16 }]}>
                        <TextInput style={[s.descInput, { color: labelColor, backgroundColor: isDarkMode ? '#121212' : '#f2f2f7' }]} placeholder="Describe the hazard (optional)..." placeholderTextColor={isDarkMode ? '#636366' : '#8e8e93'} value={incidentDesc} onChangeText={setIncidentDesc} multiline textAlignVertical="top" />

                        {incidentPhotoBase64 ? (
                            <View style={s.photoPreviewContainer}>
                                <Image source={{ uri: incidentPhotoBase64 }} style={s.photoPreviewImage} />
                                <TouchableOpacity style={[s.photoRemoveBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={() => setIncidentPhotoBase64(null)}>
                                    <X size={18} color="#ffffff" strokeWidth={3} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={[s.addPhotoBtn, { borderColor: separator, backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff' }]} onPress={handlePickPhoto}>
                                <Camera size={22} color={accent} strokeWidth={2} />
                                <Text style={[s.addPhotoText, { color: accent }]}>Attach Photo</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* ── SUBMIT ───────────────────────────────────── */}
                    <TouchableOpacity style={[s.submitBtn, { backgroundColor: incidentLocation ? accent : (isDarkMode ? '#2c2c2e' : '#e5e5ea'), opacity: incidentSubmitting ? 0.6 : 1, marginTop: 32 }]} onPress={handleSubmitIncident} disabled={!incidentLocation || incidentSubmitting} activeOpacity={0.8}>
                        {incidentSubmitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={[s.submitBtnText, { color: incidentLocation ? '#ffffff' : secondaryLabel }]}>Submit Report</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>

            ) : (
                /* ════════════════════════════════════════════════════
                    DETECTION TAB (untouched logic, just cleaner layout)
                   ════════════════════════════════════════════════════ */
                <View style={{ flex: 1 }}>
                    {/* Start/Stop + Clear */}
                    <View style={[s.controlRow, { flexDirection: 'row', gap: 10 }]}>
                        <TouchableOpacity
                            style={[s.controlBtn, { flex: 1, backgroundColor: isDetecting ? '#ef4444' : '#22c55e' }]}
                            onPress={toggleDetection}
                            activeOpacity={0.8}
                        >
                            <Radio size={20} color="#ffffff" strokeWidth={2.5} />
                            <Text style={s.controlBtnText}>{isDetecting ? 'Stop Detection' : 'Start Detection'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[s.controlBtn, { flex: 0, paddingHorizontal: 20, backgroundColor: isDarkMode ? '#2c2c2e' : '#e5e5ea' }]}
                            onPress={handleClearData}
                            activeOpacity={0.8}
                        >
                            <Trash2 size={22} color={isDarkMode ? '#ff453a' : '#ff3b30'} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>

                    {/* Toast */}
                    {lastEvent && (
                        <View style={[s.toast, { backgroundColor: severityColor(lastEvent.severity) }]}>
                            <AlertTriangle size={18} color="#ffffff" strokeWidth={2.5} />
                            <Text style={s.toastText}>
                                {severityLabel(lastEvent.severity)} — {lastEvent.peakAccel.toFixed(1)} m/s²
                            </Text>
                        </View>
                    )}

                    {/* Mesh Network */}
                    <View style={[s.meshCard, { backgroundColor: cardBg }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Wifi size={18} color={accent} strokeWidth={2} />
                            <Text style={[s.meshTitle, { color: labelColor }]}>Mesh Network</Text>
                            <View style={[s.meshLive, { backgroundColor: isDetecting ? '#22c55e' : '#ef4444' }]} />
                        </View>

                        <View style={s.meshPeerRow}>
                            {meshPeers.map((peer) => (
                                <View key={peer.id} style={[s.peerChip, { borderColor: separator }]}>
                                    <Text style={[s.peerName, { color: labelColor }]}>{peer.name.split('-')[2]}</Text>
                                    <Text style={[s.peerDist, { color: secondaryLabel }]}>{Math.round(peer.distance)}m</Text>
                                    {peer.shared > 0 && (
                                        <View style={[s.peerBadge, { backgroundColor: accent }]}>
                                            <Text style={s.peerBadgeText}>{peer.shared}</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>

                        <Text style={[s.meshStat, { color: secondaryLabel }]}>
                            {meshSharedCount} event{meshSharedCount !== 1 ? 's' : ''} shared • {meshPeers.filter(p => p.distance <= 300).length} peers in range
                        </Text>
                    </View>

                    {/* Events */}
                    <View style={{ flex: 1 }}>
                        <Text style={[s.sectionHeader, { color: secondaryLabel }]}>
                            DETECTIONS ({events.filter(e => e.mode === 'real').length})
                        </Text>
                        <FlatList
                            data={events.filter(e => e.mode === 'real')}
                            keyExtractor={(item) => item.id}
                            renderItem={renderEventItem}
                            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
                            ListEmptyComponent={
                                <View style={s.emptyState}>
                                    <AlertTriangle size={32} color={secondaryLabel} strokeWidth={1.5} />
                                    <Text style={[s.emptyText, { color: secondaryLabel }]}>
                                        {isDetecting ? 'Listening for bumps...' : 'Start detection to capture road events'}
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            )}
        </View>
    );
}

// ═════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingBottom: 0 },
    backRow: { flexDirection: 'row', alignItems: 'center' },
    backLabel: { fontFamily: 'GoogleSans-Regular', fontSize: 17, marginLeft: 2 },
    largeTitle: { fontFamily: 'GoogleSans-Bold', fontSize: 34, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },

    // ── Tabs ─────────────────────────────────────────────────────────
    tabRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        borderRadius: 12,
        padding: 3,
        marginBottom: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
    },
    tabText: { fontFamily: 'GoogleSans-Bold', fontSize: 14, color: '#8e8e93' },
    modeDesc: { fontFamily: 'GoogleSans-Regular', fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },

    // ── Cards ────────────────────────────────────────────────────────
    card: { borderRadius: 14, overflow: 'hidden', marginBottom: 4 },

    // ── Section ──────────────────────────────────────────────────────
    sectionHeader: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 13,
        letterSpacing: 0.8,
        paddingHorizontal: 4,
        paddingTop: 7,
        paddingBottom: 8,
        textTransform: 'uppercase'
    },

    // ── LOCATION (Search & Actions) ──────────────────────────────────
    searchBarInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        height: 45,
    },
    locationInput: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 16,
        flex: 1,
        height: '100%',
        paddingRight: 14,
        marginLeft: 10,
    },
    iconBtn: {
        width: 52,
        height: 45,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center'
    },
    searchResultsArea: {
        marginTop: 8,
        borderRadius: 10,
        overflow: 'hidden',
    },
    searchResult: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
    },
    searchResultText: { fontFamily: 'GoogleSans-Regular', fontSize: 15, flex: 1 },

    // ── LOCATION (Selected Map) ──────────────────────────────────────
    selectedLocFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12
    },
    selectedLocTitle: { fontFamily: 'GoogleSans-Bold', fontSize: 16, marginBottom: 2 },
    selectedLocSub: { fontFamily: 'GoogleSans-Regular', fontSize: 14 },
    changeLocBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    changeLocText: { fontFamily: 'GoogleSans-Bold', fontSize: 14 },

    // ── SEVERITY SLIDER (macOS-style) ─────────────────────────────────
    sliderOuter: {
        height: 20,
        justifyContent: 'center',
        position: 'relative',
    },
    sliderTrackBg: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 8,
        borderRadius: 10,
    },
    sliderTrackFill: {
        position: 'absolute',
        left: 0,
        height: 8,
        borderRadius: 10,
    },
    sliderThumb: {
        position: 'absolute',
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sliderThumbInner: {
        width: 18,
        height: 18,
        borderRadius: 10,
        backgroundColor: '#ffffff',
        shadowColor: 'black',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.25,
        elevation: 5,
    },
    sliderTouchRow: {
        position: 'absolute',
        left: -8,
        right: -8,
        top: -14,
        bottom: -14,
        flexDirection: 'row',
    },
    sliderTouchTarget: {
        flex: 1,
    },
    sliderLabels: {
        flexDirection: 'row',
        marginTop: 12,
        marginHorizontal: -12, // allow text to overflow slightly past the track
    },
    sliderLabelContainer: {
        flex: 1,
        alignItems: 'center',
    },
    sliderLabelText: {
        fontSize: 11,
        textAlign: 'center',
    },

    // ── PREVIEW / ADD PHOTO ──────────────────────────────────────────
    photoPreviewContainer: {
        width: '100%',
        height: 180,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative'
    },
    photoPreviewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    photoRemoveBtn: {
        position: 'absolute',
        top: 10, right: 10,
        width: 36, height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center'
    },
    addPhotoBtn: {
        width: '100%',
        height: 45,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: 'dashed',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10
    },
    addPhotoText: { fontFamily: 'GoogleSans-Bold', fontSize: 15 },

    // ── Description ──────────────────────────────────────────────────
    descInput: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 15,
        height: 110,
        borderRadius: 10,
        padding: 16,
        marginBottom: 16
    },

    // ── Submit ───────────────────────────────────────────────────────
    submitBtn: {
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
    },
    submitBtnText: { fontFamily: 'GoogleSans-Bold', fontSize: 16 },

    // ── Detection Tab ────────────────────────────────────────────────
    controlRow: { paddingHorizontal: 16, marginBottom: 12 },
    controlBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 11,
        borderRadius: 10,
    },
    controlBtnText: { fontFamily: 'GoogleSans-Bold', fontSize: 16, color: '#ffffff' },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    toastText: { fontFamily: 'GoogleSans-Bold', fontSize: 14, color: '#ffffff' },
    meshCard: { marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 12 },
    meshTitle: { fontFamily: 'GoogleSans-Bold', fontSize: 16, flex: 1 },
    meshLive: { width: 8, height: 8, borderRadius: 4 },
    meshPeerRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    peerChip: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
    peerName: { fontFamily: 'GoogleSans-Bold', fontSize: 13 },
    peerDist: { fontFamily: 'GoogleSans-Regular', fontSize: 11, marginTop: 2 },
    peerBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    peerBadgeText: { fontFamily: 'GoogleSans-Bold', fontSize: 11, color: '#ffffff' },
    meshStat: { fontFamily: 'GoogleSans-Regular', fontSize: 12 },
    eventCard: { borderRadius: 12, padding: 14, marginBottom: 8 },
    severityBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    severityBadgeText: { fontFamily: 'GoogleSans-Bold', fontSize: 16, color: '#ffffff' },
    eventTitle: { fontFamily: 'GoogleSans-Bold', fontSize: 15 },
    eventSub: { fontFamily: 'GoogleSans-Regular', fontSize: 12, marginTop: 1 },
    eventTime: { fontFamily: 'GoogleSans-Regular', fontSize: 12 },
    eventCoord: { fontFamily: 'GoogleSans-Regular', fontSize: 11, marginTop: 8 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 12 },
    emptyText: { fontFamily: 'GoogleSans-Regular', fontSize: 15, textAlign: 'center' },
});