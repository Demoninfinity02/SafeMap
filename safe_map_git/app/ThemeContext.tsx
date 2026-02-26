import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextProps {
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    isDarkMode: boolean;
    isAmbulanceMode: boolean;
    setAmbulanceMode: (val: boolean) => void;
    isWomensMode: boolean;
    setWomensMode: (val: boolean) => void;
    isAsthmaMode: boolean;
    setAsthmaMode: (val: boolean) => void;
    isSirenMode: boolean;
    setSirenMode: (val: boolean) => void;
    isDrowsinessMode: boolean;
    setDrowsinessMode: (val: boolean) => void;
}

const ThemeContext = createContext<ThemeContextProps>({
    themeMode: 'system',
    setThemeMode: () => { },
    isDarkMode: false,
    isAmbulanceMode: false,
    setAmbulanceMode: () => { },
    isWomensMode: false,
    setWomensMode: () => { },
    isAsthmaMode: false,
    setAsthmaMode: () => { },
    isSirenMode: false,
    setSirenMode: () => { },
    isDrowsinessMode: true,
    setDrowsinessMode: () => { },
});

// Avoid circular imports, so we import conditionally inside the setter if needed, or import at the top
import { meshNetwork } from '../src/services/potholeDetector';

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(systemColorScheme === 'dark');
    const [isAmbulanceMode, setIsAmbulanceMode] = useState<boolean>(false);
    const [isWomensMode, setIsWomensMode] = useState<boolean>(false);
    const [isAsthmaMode, setIsAsthmaMode] = useState<boolean>(false);
    const [isSirenMode, setIsSirenMode] = useState<boolean>(false);
    const [isDrowsinessMode, setIsDrowsinessMode] = useState<boolean>(true);

    useEffect(() => {
        (async () => {
            try {
                const storedTheme = await AsyncStorage.getItem('@safe_map_theme');
                if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
                    setThemeMode(storedTheme as ThemeMode);
                }
                const storedAmb = await AsyncStorage.getItem('@safe_map_ambulance');
                if (storedAmb !== null) {
                    setIsAmbulanceMode(storedAmb === 'true');
                    meshNetwork.isAmbulance = storedAmb === 'true';
                }
                const storedWomen = await AsyncStorage.getItem('@safe_map_womens');
                if (storedWomen !== null) {
                    setIsWomensMode(storedWomen === 'true');
                }
                const storedAsthma = await AsyncStorage.getItem('@safe_map_asthma');
                if (storedAsthma !== null) {
                    setIsAsthmaMode(storedAsthma === 'true');
                }
                const storedSiren = await AsyncStorage.getItem('@safe_map_siren');
                if (storedSiren !== null) {
                    setIsSirenMode(storedSiren === 'true');
                }
                const storedDrowsiness = await AsyncStorage.getItem('@safe_map_drowsiness');
                if (storedDrowsiness !== null) {
                    setIsDrowsinessMode(storedDrowsiness === 'true');
                }
            } catch (e) { }
        })();
    }, []);

    useEffect(() => {
        if (themeMode === 'system') {
            setIsDarkMode(systemColorScheme === 'dark');
        } else {
            setIsDarkMode(themeMode === 'dark');
        }
    }, [themeMode, systemColorScheme]);

    const handleSetThemeMode = async (mode: ThemeMode) => {
        setThemeMode(mode);
        try {
            await AsyncStorage.setItem('@safe_map_theme', mode);
        } catch (e) { }
    };

    const handleSetAmbulanceMode = async (val: boolean) => {
        setIsAmbulanceMode(val);
        meshNetwork.isAmbulance = val;
        try {
            await AsyncStorage.setItem('@safe_map_ambulance', val.toString());
        } catch (e) { }
    };

    const handleSetWomensMode = async (val: boolean) => {
        setIsWomensMode(val);
        try {
            await AsyncStorage.setItem('@safe_map_womens', val.toString());
        } catch (e) { }
    };

    const handleSetAsthmaMode = async (val: boolean) => {
        setIsAsthmaMode(val);
        try {
            await AsyncStorage.setItem('@safe_map_asthma', val.toString());
        } catch (e) { }
    };

    const handleSetSirenMode = async (val: boolean) => {
        setIsSirenMode(val);
        try {
            await AsyncStorage.setItem('@safe_map_siren', val.toString());
        } catch (e) { }
    };

    const handleSetDrowsinessMode = async (val: boolean) => {
        setIsDrowsinessMode(val);
        try {
            await AsyncStorage.setItem('@safe_map_drowsiness', val.toString());
        } catch (e) { }
    };

    return (
        <ThemeContext.Provider value={{
            themeMode, setThemeMode: handleSetThemeMode,
            isDarkMode,
            isAmbulanceMode, setAmbulanceMode: handleSetAmbulanceMode,
            isWomensMode, setWomensMode: handleSetWomensMode,
            isAsthmaMode, setAsthmaMode: handleSetAsthmaMode,
            isSirenMode, setSirenMode: handleSetSirenMode,
            isDrowsinessMode, setDrowsinessMode: handleSetDrowsinessMode,
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);

export default function ThemeContextRoute() { return null; }
