import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ambulance, Bell, ChevronLeft, ChevronRight, CircleHelp, Eye, Heart, Info, Mic, Moon, Shield, Smartphone, Sun, User, Wind } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { themeMode, setThemeMode, isDarkMode, isAmbulanceMode, setAmbulanceMode, isWomensMode, setWomensMode, isAsthmaMode, setAsthmaMode, isSirenMode, setSirenMode, isDrowsinessMode, setDrowsinessMode } = useTheme();

    // Color tokens — AMOLED pure black for dark
    const bg = isDarkMode ? '#000000' : '#f2f2f7';
    const cardBg = isDarkMode ? '#1c1c1e' : '#ffffff';
    const labelColor = isDarkMode ? '#ffffff' : '#000000';
    const secondaryLabel = isDarkMode ? '#8e8e93' : '#8e8e93';
    const separator = isDarkMode ? '#38383a' : '#c6c6c8';
    const activeAccent = '#5a45ff';

    const ThemeOption = ({ mode, icon: Icon, label }: { mode: 'light' | 'dark' | 'system'; icon: any; label: string }) => {
        const isActive = themeMode === mode;
        return (
            <TouchableOpacity
                style={[
                    s.themeCell,
                    {
                        backgroundColor: isActive ? activeAccent : cardBg,
                        borderColor: isActive ? activeAccent : 'transparent',
                    },
                ]}
                onPress={() => setThemeMode(mode)}
                activeOpacity={0.7}
            >
                <Icon size={26} color={isActive ? '#ffffff' : secondaryLabel} strokeWidth={1.8} />
                <Text
                    style={[
                        s.themeCellLabel,
                        { color: isActive ? '#ffffff' : labelColor },
                    ]}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    const SettingsRow = ({ icon: Icon, label, showSep = true, rightElement }: { icon: any; label: string; showSep?: boolean; rightElement?: React.ReactNode }) => (
        <TouchableOpacity style={[s.row, showSep && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]} activeOpacity={rightElement ? 1 : 0.5}>
            <Icon size={20} color={secondaryLabel} strokeWidth={1.8} />
            <Text style={[s.rowLabel, { color: labelColor }]}>{label}</Text>
            {rightElement ? rightElement : <ChevronRight size={18} color={isDarkMode ? '#48484a' : '#c7c7cc'} strokeWidth={2} />}
        </TouchableOpacity>
    );

    return (
        <View style={[s.container, { backgroundColor: bg }]}>
            <ExpoStatusBar style={isDarkMode ? 'light' : 'dark'} />

            {/* iOS-style large title header */}
            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backRow}>
                    <ChevronLeft size={28} color={activeAccent} strokeWidth={2.2} />
                    <Text style={[s.backLabel, { color: activeAccent }]}>Map</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
                <Text style={[s.largeTitle, { color: labelColor }]}>Settings</Text>

                {/* ─── Appearance ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel }]}>Appearance</Text>
                <View style={[s.card, { backgroundColor: cardBg }]}>
                    <View style={s.themeRow}>
                        <ThemeOption mode="light" icon={Sun} label="Light" />
                        <ThemeOption mode="dark" icon={Moon} label="Dark" />
                        <ThemeOption mode="system" icon={Smartphone} label="Auto" />
                    </View>
                </View>

                {/* ─── Safety Features ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel }]}>Safety Features</Text>
                <View style={[s.card, { backgroundColor: cardBg }]}>
                    <SettingsRow
                        icon={Heart}
                        label="Women's Only Mode"
                        showSep={true}
                        rightElement={
                            <Switch
                                value={isWomensMode}
                                onValueChange={setWomensMode}
                                trackColor={{ false: '#3e3e3e', true: '#5a45ff' }}
                                thumbColor={'#ffffff'}
                            />
                        }
                    />
                    <SettingsRow
                        icon={Wind}
                        label="Asthma Mode"
                        showSep={false}
                        rightElement={
                            <Switch
                                value={isAsthmaMode}
                                onValueChange={setAsthmaMode}
                                trackColor={{ false: '#3e3e3e', true: '#5a45ff' }}
                                thumbColor={'#ffffff'}
                            />
                        }
                    />
                </View>

                {/* ─── Emergency Response ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel }]}>Emergency Response</Text>
                <View style={[s.card, { backgroundColor: cardBg }]}>
                    <SettingsRow
                        icon={Ambulance}
                        label="Emergency Mode"
                        showSep={false}
                        rightElement={
                            <Switch
                                value={isAmbulanceMode}
                                onValueChange={setAmbulanceMode}
                                trackColor={{ false: '#3e3e3e', true: '#5a45ff' }}
                                thumbColor={'#ffffff'}
                            />
                        }
                    />
                </View>

                {/* ─── General ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel }]}>General</Text>
                <View style={[s.card, { backgroundColor: cardBg }]}>
                    <SettingsRow icon={User} label="Account" />
                    <SettingsRow icon={Bell} label="Notifications" />
                    <SettingsRow icon={Shield} label="Privacy" showSep={false} />
                </View>

                {/* ─── About ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel }]}>About</Text>
                <View style={[s.card, { backgroundColor: cardBg }]}>
                    <SettingsRow icon={CircleHelp} label="Help" />
                    <SettingsRow icon={Info} label="About SafeMap" showSep={false} />
                </View>

                {/* ─── Experimental ─── */}
                <Text style={[s.sectionHeader, { color: secondaryLabel, marginTop: 12 }]}>Experimental</Text>
                <View style={[s.card, { backgroundColor: cardBg, marginBottom: 12 }]}>
                    <SettingsRow
                        icon={Mic}
                        label="Siren Detection (Mic)"
                        showSep={false}
                        rightElement={
                            <Switch
                                value={isSirenMode}
                                onValueChange={async (val) => {
                                    if (val) {
                                        const { status } = await requestRecordingPermissionsAsync();
                                        if (status !== 'granted') {
                                            alert('Microphone permission is required for Siren Detection.');
                                            setSirenMode(false);
                                            return;
                                        }
                                    }
                                    setSirenMode(val);
                                }}
                                trackColor={{ false: '#3e3e3e', true: '#5a45ff' }}
                                thumbColor={'#ffffff'}
                            />
                        }
                    />
                    <SettingsRow
                        icon={Eye}
                        label="Drowsiness Check"
                        showSep={false}
                        rightElement={
                            <Switch
                                value={isDrowsinessMode}
                                onValueChange={(val) => setDrowsinessMode(val)}
                                trackColor={{ false: '#3e3e3e', true: '#5a45ff' }}
                                thumbColor={'#ffffff'}
                            />
                        }
                    />
                </View>

                <Text style={[s.footer, { color: secondaryLabel }]}>SafeMap v1.0.0</Text>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: 16,
        paddingBottom: 0,
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backLabel: {
        fontFamily: 'GoogleSans-Regular',
        fontSize: 17,
        marginLeft: 2,
    },
    largeTitle: {
        fontFamily: 'GoogleSans-Bold',
        fontSize: 34,
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 8,
    },
    sectionHeader: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 13,
        textTransform: 'uppercase',
        paddingHorizontal: 36,
        paddingTop: 28,
        paddingBottom: 8,
    },
    card: {
        marginHorizontal: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    themeRow: {
        flexDirection: 'row',
        padding: 12,
        gap: 10,
    },
    themeCell: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    themeCellLabel: {
        fontFamily: 'GoogleSans-Medium',
        fontSize: 13,
        marginTop: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    rowLabel: {
        flex: 1,
        fontFamily: 'GoogleSans-Regular',
        fontSize: 17,
        marginLeft: 14,
    },
    footer: {
        textAlign: 'center',
        fontFamily: 'GoogleSans-Regular',
        fontSize: 13,
        marginTop: 36,
    },
});
