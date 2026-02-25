import Alert01Icon from '@hugeicons/core-free-icons/Alert01Icon';
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import BicycleIcon from '@hugeicons/core-free-icons/BicycleIcon';
import Bookmark02Icon from '@hugeicons/core-free-icons/Bookmark02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Car01Icon from '@hugeicons/core-free-icons/Car01Icon';
import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import MapsLocation01Icon from '@hugeicons/core-free-icons/MapsLocation01Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import Mic01Icon from '@hugeicons/core-free-icons/Mic01Icon';
import Navigation03Icon from '@hugeicons/core-free-icons/Navigation03Icon';
import Target01Icon from '@hugeicons/core-free-icons/Navigation06Icon';
import NewsIcon from '@hugeicons/core-free-icons/NewsIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import Share01Icon from '@hugeicons/core-free-icons/Share01Icon';
import WalkingIcon from '@hugeicons/core-free-icons/WalkingIcon';
import { HugeiconsIcon } from '@hugeicons/react-native';
import Mapbox from '@rnmapbox/maps';
import { BlurView } from '@sbaiahmed1/react-native-blur';
import * as turf from '@turf/turf';
import * as ExpoAudio from 'expo-audio';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, GitBranch, GitMerge, MapPin, Navigation, RotateCcw, RotateCw, Wind } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Dimensions, Easing, FlatList, Keyboard, LogBox, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { getDirections, MAPBOX_ACCESS_TOKEN, searchPlaces } from '../src/services/mapbox';
import { meshNetwork, potholeDetector, PotholeEvent } from '../src/services/potholeDetector';
import { scoreAndRankRoutes, ScoredRoute } from '../src/services/roadQuality';
import { useTheme } from './ThemeContext';

LogBox.ignoreLogs(['Unable to activate keep awake']);

// Set the access token
Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);

  // Routes State
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isDirectionsPreview, setIsDirectionsPreview] = useState(false);
  const [travelProfile, setTravelProfile] = useState<'driving' | 'cycling' | 'walking'>('driving');
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isChoosingOnMap, setIsChoosingOnMap] = useState(false);
  const [customOrigin, setCustomOrigin] = useState<any>(null);
  const [isSettingOrigin, setIsSettingOrigin] = useState(false);

  const route = routes[selectedRouteIndex] || null;

  const [isNavigating, setIsNavigating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ reasoning: string, gases?: any, routeScores?: any[] } | null>(null);
  const [recommendedRouteIndex, setRecommendedRouteIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userInteracting, setUserInteracting] = useState(false);
  const { isDarkMode, isAmbulanceMode, isWomensMode, isAsthmaMode, isSirenMode } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [previewStepIndex, setPreviewStepIndex] = useState(0);
  const navScrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = Dimensions.get('window');

  // Pothole & Incident detection state
  const [potholeEvents, setPotholeEvents] = useState<PotholeEvent[]>([]);
  const [lastDetection, setLastDetection] = useState<PotholeEvent | null>(null);
  const detectionToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [remoteDetection, setRemoteDetection] = useState<{ event: PotholeEvent, type: 'pothole' | 'incident' } | null>(null);
  const remoteToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isChoosingForIncident, setIsChoosingForIncident] = useState(false);
  const [ambulanceNearby, setAmbulanceNearby] = useState(false);

  // Mesh Network polling for Ambulance
  useEffect(() => {
    // Make sure we are part of the network
    meshNetwork.start();

    const interval = setInterval(() => {
      // If we ARE the ambulance, we don't warn ourselves
      if (isAmbulanceMode) {
        setAmbulanceNearby(false);
        return;
      }

      const ambulance = meshNetwork.peers.find(p => p.isAmbulance && p.distance <= 400); // within 400m
      setAmbulanceNearby(!!ambulance);
    }, 2000);

    return () => {
      clearInterval(interval);
      meshNetwork.stop();
    };
  }, [isAmbulanceMode]);

  useEffect(() => {
    if (params.selectingIncident === 'true') {
      setIsChoosingOnMap(true);
      setIsChoosingForIncident(true);
      router.setParams({ selectingIncident: '' });
      setIsSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
      setIsDirectionsPreview(false);
      setRoutes([]);
      setSelectedDestination(null);
    }
  }, [params.selectingIncident]);

  // Sync pothole data globally from Firebase via our detector
  useEffect(() => {
    const unsub = potholeDetector.subscribe((events) => {
      setPotholeEvents(events);
    });

    potholeDetector.onRemoteEvent = (event, type) => {
      // Only show remote toasts if we are actively navigating to prevent spam
      if (isNavigating) {
        setRemoteDetection({ event, type });
        if (remoteToastTimeout.current) clearTimeout(remoteToastTimeout.current);
        remoteToastTimeout.current = setTimeout(() => setRemoteDetection(null), 3500);
      }
    };

    return () => {
      unsub();
      potholeDetector.onRemoteEvent = null;
    };
  }, [isNavigating]);

  // ─── Reactive Route Sorting for Demos ───
  // Instantly changes the Recommended Route when Women's Mode toggles or new potholes are detected
  useEffect(() => {
    if (routes.length > 0 && !isAsthmaMode && !isDirectionsPreview && !isNavigating) {
      const ranked = scoreAndRankRoutes(routes, potholeEvents, isWomensMode);
      if (ranked.length > 0 && ranked[0].routeIndex !== recommendedRouteIndex) {
        setRecommendedRouteIndex(ranked[0].routeIndex);
        setSelectedRouteIndex(ranked[0].routeIndex);

        // Optionally recenter camera on new recommended route
        if (cameraRef.current) {
          const start = customOrigin ? customOrigin.center : [location?.coords.longitude, location?.coords.latitude];
          const end = selectedDestination?.center;
          if (start && end) {
            cameraRef.current.fitBounds(
              [Math.min(start[0], end[0]), Math.min(start[1], end[1])],
              [Math.max(start[0], end[0]), Math.max(start[1], end[1])],
              [100, 50, Platform.OS === 'ios' ? 450 : 400, 50],
              800
            );
          }
        }
      }
    }
  }, [isWomensMode, potholeEvents, routes]);

  // ─── Siren Detection Background Loop ───
  useEffect(() => {
    let localRecording: any = null;
    let isActive = false;

    if (isSirenMode && isNavigating && !isAmbulanceMode) {
      isActive = true;
      const startLoop = async () => {
        try {
          const permission = await ExpoAudio.requestRecordingPermissionsAsync();
          if (permission.status !== 'granted') return;

          await ExpoAudio.setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });

          const executeChunk = async () => {
            if (!isActive) return;
            try {
              const r = new (ExpoAudio as any).AudioModule.AudioRecorder((ExpoAudio as any).RecordingPresets.HIGH_QUALITY);
              await r.prepareToRecordAsync();
              r.record();
              localRecording = r;

              // Record for 3 seconds
              await new Promise(resolve => setTimeout(resolve, 3000));

              if (!isActive) {
                await r.stop().catch(() => { });
                return;
              }

              await r.stop().catch(() => { });
              const uri = r.uri;

              if (uri) {
                const formData = new FormData();
                formData.append('file', {
                  uri,
                  name: 'chunk.m4a',
                  type: 'audio/m4a'
                } as any);

                fetch('http://10.1.7.47:8000/api/v1/siren_prediction', {
                  method: 'POST',
                  body: formData,
                  headers: { 'Content-Type': 'multipart/form-data' }
                })
                  .then(res => res.json())
                  .then(data => {
                    if (data.prediction === "Emergency" && data.confidence > 70) {
                      setAmbulanceNearby(true);

                      // Auto-hide ambulance alert after 15 seconds if no more sirens
                      setTimeout(() => setAmbulanceNearby(false), 15000);
                    }
                  }).catch(err => console.log("Siren payload error", err));
              }

              if (isActive) {
                executeChunk();
              }
            } catch (e) {
              console.log("Chunk recording err", e);
            }
          };

          executeChunk();

        } catch (e) {
          console.warn("Siren loop init err", e);
        }
      };

      startLoop();
    } else {
      isActive = false;
      if (localRecording) {
        localRecording.stop().catch(() => { });
      }
    }

    return () => {
      isActive = false;
      if (localRecording) {
        localRecording.stop().catch(() => { });
      }
    };
  }, [isSirenMode, isNavigating, isAmbulanceMode]);

  // Helper to get maneuver icon
  const getManeuverIcon = (step: any) => {
    const maneuver = step?.maneuver;
    if (!maneuver) return ArrowUp;

    const type = maneuver.type;
    const modifier = maneuver.modifier;

    if (type === 'arrive') return MapPin;
    if (type === 'depart') return Navigation;
    if (type === 'roundabout' || type === 'rotary') return RotateCw;
    if (type === 'merge') return GitMerge;
    if (type === 'fork') return GitBranch;

    switch (modifier) {
      case 'left':
      case 'sharp left':
        return CornerUpLeft;
      case 'right':
      case 'sharp right':
        return CornerUpRight;
      case 'slight left':
        return ArrowUpLeft;
      case 'slight right':
        return ArrowUpRight;
      case 'uturn':
        return RotateCcw;
      case 'straight':
        return ArrowUp;
      default:
        return ArrowUp;
    }
  };

  // Helper to calculate distance
  const getDistance = (coord1: [number, number], coord2: [number, number]) => {
    const R = 6371e3; // metres
    const φ1 = coord1[1] * Math.PI / 180;
    const φ2 = coord2[1] * Math.PI / 180;
    const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180;
    const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getEstimatedTime = (mode: 'driving' | 'cycling' | 'walking') => {
    if (routes.length > 0 && travelProfile === mode && routes[selectedRouteIndex]?.duration) {
      const mins = Math.ceil(routes[selectedRouteIndex].duration / 60);
      return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
    }
    const originCoords = customOrigin ? customOrigin.center : (location ? [location.coords.longitude, location.coords.latitude] : null);
    if (!originCoords || !selectedDestination) return '--';
    const dist = getDistance(originCoords, selectedDestination.center) * 1.3;
    let t = 0;
    if (mode === 'driving') t = dist / 11.1;
    else if (mode === 'cycling') t = dist / 4.1;
    else t = dist / 1.4;
    const mins = Math.ceil(t / 60);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  };

  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        distanceInterval: 10
      }, (loc) => {
        // Only fit bounds on first location fix if we aren't routing
        if (!location && !route && cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
            zoomLevel: 15,
            animationDuration: 1000
          });
        }

        setLocation(loc);

        // Navigation Logic
        if (isNavigating && route && route.legs && route.legs[0].steps) {
          const steps = route.legs[0].steps;
          if (currentStepIndex < steps.length - 1) {
            const nextStep = steps[currentStepIndex + 1];
            const stepCoords = nextStep.maneuver.location;
            const dist = getDistance(
              [loc.coords.longitude, loc.coords.latitude],
              stepCoords
            );

            // If within 30 meters of the turn, advance
            if (dist < 30) {
              setCurrentStepIndex(prev => prev + 1);
              setPreviewStepIndex(prev => prev + 1); // Also advance preview step
              // Scroll to the next step in the navigation instructions
              if (navScrollRef.current) {
                navScrollRef.current.scrollTo({ x: (currentStepIndex + 1) * screenWidth, animated: true });
              }
            }
          }
        }
      });
    })();

    return () => {
      if (subscription) subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNavigating, route, currentStepIndex]);

  // Split the route during navigation to de-color the past trajectory
  const routeGeometries = React.useMemo(() => {
    if (!route || !route.geometry) return { future: null, past: null };
    if (!isNavigating || !location) return { future: route.geometry, past: null };

    try {
      const line = turf.lineString(route.geometry.coordinates);
      const currentPt = turf.point([location.coords.longitude, location.coords.latitude]);
      const nearest = turf.nearestPointOnLine(line, currentPt);

      // Slice from nearest point to end (Purple Active)
      const endPt = turf.point(route.geometry.coordinates[route.geometry.coordinates.length - 1]);
      const futureSliced = turf.lineSlice(nearest, endPt, line);

      // Slice from start to nearest point (Gray Past)
      const startPt = turf.point(route.geometry.coordinates[0]);
      const pastSliced = turf.lineSlice(startPt, nearest, line);

      return {
        future: futureSliced.geometry,
        past: pastSliced.geometry,
      };
    } catch (e) {
      return { future: route.geometry, past: null };
    }
  }, [route, location, isNavigating]);

  useEffect(() => {
    const onBackPress = () => {
      if (isNavigating) {
        stopNavigation();
        return true;
      }
      if (isSearchActive) {
        setIsSearchActive(false);
        return true;
      }
      if (isChoosingOnMap) {
        setIsChoosingOnMap(false);
        return true;
      }
      if (isDirectionsPreview) {
        setIsDirectionsPreview(false);
        return true;
      }
      if (selectedDestination) {
        setSelectedDestination(null);
        setRoutes([]);
        setWaypoints([]);
        setCustomOrigin(null);
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, [isSearchActive, isChoosingOnMap, isDirectionsPreview, selectedDestination, isNavigating]);

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length > 2) {
      const proximity = location ? [location.coords.longitude, location.coords.latitude] as [number, number] : undefined;
      const results = await searchPlaces(text, proximity);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectPlace = async (place: any) => {
    if (isSettingOrigin) {
      Keyboard.dismiss();
      setIsSettingOrigin(false);
      setIsSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
      setCustomOrigin(place);
      fetchRoutes(travelProfile, waypoints, place);
      return;
    }

    if (isAddingWaypoint) {
      Keyboard.dismiss();
      setIsAddingWaypoint(false);
      setIsSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
      const newWaypoints = [...waypoints, place];
      setWaypoints(newWaypoints);
      fetchRoutes(travelProfile, newWaypoints, customOrigin);
      return;
    }

    Keyboard.dismiss();
    setSearchResults([]);
    setSearchQuery('');
    setSelectedDestination(place);
    setRoutes([]);
    setIsDirectionsPreview(false);
    setWaypoints([]);

    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: place.center,
        zoomLevel: 15,
        animationDuration: 1500
      });
    }
  };

  const fetchRoutes = async (profile: string, currentWaypoints = waypoints, originPlace = customOrigin) => {
    if ((location || originPlace) && selectedDestination) {
      setLoading(true);
      const start = originPlace ? originPlace.center : ([location?.coords.longitude, location?.coords.latitude] as [number, number]);
      const end = selectedDestination.center;

      const coords = [start, ...currentWaypoints.map(wp => wp.center), end];

      const routesData = await getDirections(coords, profile);
      if (routesData && routesData.length > 0) {

        // Reset old AI analysis
        setAiAnalysis(null);

        let bestIdx = 0;

        if (isAsthmaMode) {
          try {
            const backendUrl = 'http://10.1.7.47:8000';

            // PHASE 1: Fast route scoring (instant, no LLM wait)
            const response = await fetch(`${backendUrl}/api/v1/route`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                routes: routesData,
                user_profile: {
                  respiratory_issue: true,
                  low_eyesight: false
                }
              })
            });
            if (response.ok) {
              const aiData = await response.json();
              bestIdx = aiData.best_route_index;
              setAiAnalysis({
                reasoning: '✨ Analyzing air quality data...',
                gases: aiData.gas_concentrations,
                routeScores: aiData.route_scores
              });

              // PHASE 2: Stream LLM reasoning in background via XMLHttpRequest
              const xhr = new XMLHttpRequest();
              xhr.open('POST', `${backendUrl}/api/v1/route/reasoning`);
              xhr.setRequestHeader('Content-Type', 'application/json');
              let lastLength = 0;
              xhr.onprogress = () => {
                const newText = xhr.responseText.substring(lastLength);
                lastLength = xhr.responseText.length;
                if (newText) {
                  setAiAnalysis(prev => prev ? { ...prev, reasoning: xhr.responseText } : prev);
                }
              };
              xhr.onload = () => {
                setAiAnalysis(prev => prev ? { ...prev, reasoning: xhr.responseText || 'Route selected based on lowest air pollution levels for your safety.' } : prev);
              };
              xhr.onerror = () => {
                setAiAnalysis(prev => prev ? { ...prev, reasoning: 'Route selected based on lowest air pollution levels for your safety.' } : prev);
              };
              xhr.send(JSON.stringify({
                routes: routesData,
                user_profile: { respiratory_issue: true, low_eyesight: false }
              }));

            } else {
              const ranked = scoreAndRankRoutes(routesData, potholeEvents, isWomensMode);
              bestIdx = ranked.length > 0 ? ranked[0].routeIndex : 0;
            }
          } catch (err) {
            console.error('AQI Backend Error', err);
            const ranked = scoreAndRankRoutes(routesData, potholeEvents, isWomensMode);
            bestIdx = ranked.length > 0 ? ranked[0].routeIndex : 0;
          }
        } else {
          // Standard local offline routing scoring
          const ranked = scoreAndRankRoutes(routesData, potholeEvents, isWomensMode);
          bestIdx = ranked.length > 0 ? ranked[0].routeIndex : 0;
        }

        setRoutes(routesData);
        setRecommendedRouteIndex(bestIdx);
        setSelectedRouteIndex(bestIdx);
      } else {
        setRoutes(routesData || []);
        setRecommendedRouteIndex(0);
        setSelectedRouteIndex(0);
      }
      setLoading(false);

      if (cameraRef.current && routesData && routesData.length > 0) {
        cameraRef.current.fitBounds(
          [Math.min(start[0], end[0]), Math.min(start[1], end[1])],
          [Math.max(start[0], end[0]), Math.max(start[1], end[1])],
          [100, 50, Platform.OS === 'ios' ? 450 : 400, 50],
          1500
        );
      }
    }
  };

  const getDirectionsForSelected = async () => {
    await fetchRoutes(travelProfile);
    setIsDirectionsPreview(true);
  };

  const startNavigationDirect = async () => {
    if (routes.length === 0) {
      await fetchRoutes(travelProfile);
    }
    setIsDirectionsPreview(false);
    setIsNavigating(true);
    setUserInteracting(false);

    // Start pothole detection
    potholeDetector.start((event) => {
      setLastDetection(event);
      // Auto-clear toast after 3 seconds
      if (detectionToastTimeout.current) clearTimeout(detectionToastTimeout.current);
      detectionToastTimeout.current = setTimeout(() => setLastDetection(null), 3000);
    });

    if (cameraRef.current && location) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 18,
        pitch: 65,
        animationDuration: 2000,
      });
    }
  };

  const clearSelection = () => {
    setRoutes([]);
    setSelectedDestination(null);
    setSearchQuery('');
    setIsDirectionsPreview(false);
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    Keyboard.dismiss();
    setSearchQuery('');
  };

  const startNavigation = () => {
    setIsNavigating(true);
    setUserInteracting(false);

    // Start pothole detection
    potholeDetector.start((event) => {
      setLastDetection(event);
      if (detectionToastTimeout.current) clearTimeout(detectionToastTimeout.current);
      detectionToastTimeout.current = setTimeout(() => setLastDetection(null), 3000);
    });

    if (cameraRef.current && location) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 18,
        pitch: 65,
        animationDuration: 2000,
      });
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setIsDirectionsPreview(true);
    setCurrentStepIndex(0);
    setPreviewStepIndex(0);
    setUserInteracting(false);
    setLastDetection(null);

    // Stop pothole detection
    potholeDetector.stop();

    if (cameraRef.current && location) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 15,
        pitch: 0,
        animationDuration: 1500,
      });
    }
  };

  const centerOnUser = () => {
    setUserInteracting(false);
    if (location && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 15,
        animationDuration: 1000,
        pitch: isNavigating ? 65 : 0,
      });
    }
  };

  const renderLocationPin = (id: string, coordinate: [number, number], isOrigin: boolean = false) => (
    <Mapbox.PointAnnotation key={id} id={id} coordinate={coordinate} anchor={{ x: 0.5, y: 1 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Svg width="46" height="46" viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
            fill={isOrigin ? "#3b82f6" : "#5a45ff"}
            stroke={isOrigin ? "#2563eb" : "#4338ca"}
            strokeWidth="1"
          />
          <Circle cx="12" cy="10" r="3.5" fill="white" />
        </Svg>
      </View>
    </Mapbox.PointAnnotation>
  );

  return (
    <SafeAreaProvider>
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#000000' : '#ffffff' }]}>
        <ExpoStatusBar style={isDarkMode ? "light" : "dark"} translucent={true} backgroundColor="transparent" />
        <Mapbox.MapView
          style={styles.map}
          ref={mapRef}
          surfaceView={false} // Required for Android BlurView to work
          styleURL={isDarkMode ? "mapbox://styles/atharv714/cmlxyl4ov001101sc15hxdsnx" : "mapbox://styles/mapbox/standard"}
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          onTouchStart={() => setUserInteracting(true)} // Stop auto tracking if user pans
        >
          <Mapbox.Camera
            ref={cameraRef}
            // Only auto-follow if the user hasn't explicitly broken out of it by dragging AND we are on current step
            followUserLocation={!userInteracting && isNavigating && previewStepIndex === currentStepIndex}
            followUserMode={Mapbox.UserTrackingMode.FollowWithCourse}
            followZoomLevel={isNavigating && previewStepIndex === currentStepIndex ? 18 : undefined}
            followPitch={isNavigating && previewStepIndex === currentStepIndex ? 65 : undefined}
          />


          {/* Google Maps style Blue Dot. It pulses correctly inside Mapbox. */}
          <Mapbox.Images>
            <Mapbox.Image name="nav-arrow">
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Svg viewBox="0 0 24 24" width="40" height="40" fill="none">
                  <Path fill="#5a45ff" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M6.73726 10.4584C9.00955 5.81947 10.1457 3.5 12 3.5C13.8543 3.5 14.9904 5.81946 17.2627 10.4584L18.8101 13.6174C20.5552 17.18 21.4277 18.9613 20.7934 19.8178C20.6228 20.0481 20.398 20.238 20.1366 20.3729C19.1643 20.8743 17.3794 19.8641 13.8096 17.8436C13.0178 17.3954 12.6219 17.1713 12.1889 17.1312C12.0633 17.1196 11.9367 17.1196 11.8111 17.1312C11.3781 17.1713 10.9822 17.3954 10.1904 17.8436C6.62059 19.8641 4.83571 20.8743 3.86337 20.3729C3.60196 20.238 3.37719 20.0481 3.20664 19.8178C2.57226 18.9613 3.44481 17.18 5.1899 13.6174L6.73726 10.4584Z" />
                </Svg>
              </View>
            </Mapbox.Image>
            <Mapbox.Image name="nav-arrow-hollow">
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Svg viewBox="0 0 24 24" width="40" height="40" fill="none">
                  <Path fill="transparent" stroke="#5a45ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M6.73726 10.4584C9.00955 5.81947 10.1457 3.5 12 3.5C13.8543 3.5 14.9904 5.81946 17.2627 10.4584L18.8101 13.6174C20.5552 17.18 21.4277 18.9613 20.7934 19.8178C20.6228 20.0481 20.398 20.238 20.1366 20.3729C19.1643 20.8743 17.3794 19.8641 13.8096 17.8436C13.0178 17.3954 12.6219 17.1713 12.1889 17.1312C12.0633 17.1196 11.9367 17.1196 11.8111 17.1312C11.3781 17.1713 10.9822 17.3954 10.1904 17.8436C6.62059 19.8641 4.83571 20.8743 3.86337 20.3729C3.60196 20.238 3.37719 20.0481 3.20664 19.8178C2.57226 18.9613 3.44481 17.18 5.1899 13.6174L6.73726 10.4584Z" />
                </Svg>
              </View>
            </Mapbox.Image>
          </Mapbox.Images>

          {/* 3D Navigation Puck or Custom Purple Dot */}
          {isNavigating ? (
            <Mapbox.LocationPuck
              puckBearingEnabled
              puckBearing="heading"
              topImage="nav-arrow"
              scale={0.8}
            />
          ) : location ? (
            <Mapbox.PointAnnotation id="user-location-custom" coordinate={[location.coords.longitude, location.coords.latitude]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(90, 69, 255, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#5a45ff' }} />
                </View>
              </View>
            </Mapbox.PointAnnotation>
          ) : null}


          {/* Render Origin Pin */}
          {customOrigin && !isNavigating && renderLocationPin("origin-pin", customOrigin.center, true)}

          {/* Render Future Swiped Turn Point Avatar */}
          {isNavigating && previewStepIndex !== currentStepIndex && route && route.legs[0].steps[previewStepIndex] && (
            <Mapbox.PointAnnotation
              id="preview-turn-marker"
              coordinate={route.legs[0].steps[previewStepIndex].maneuver.location}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={{ transform: [{ rotate: `${route.legs[0].steps[previewStepIndex].maneuver.bearing_after || 0}deg` }] }}>
                <Svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                  <Path fill="rgba(255,255,255,0.9)" stroke="#5a45ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M6.73726 10.4584C9.00955 5.81947 10.1457 3.5 12 3.5C13.8543 3.5 14.9904 5.81946 17.2627 10.4584L18.8101 13.6174C20.5552 17.18 21.4277 18.9613 20.7934 19.8178C20.6228 20.0481 20.398 20.238 20.1366 20.3729C19.1643 20.8743 17.3794 19.8641 13.8096 17.8436C13.0178 17.3954 12.6219 17.1713 12.1889 17.1312C12.0633 17.1196 11.9367 17.1196 11.8111 17.1312C11.3781 17.1713 10.9822 17.3954 10.1904 17.8436C6.62059 19.8641 4.83571 20.8743 3.86337 20.3729C3.60196 20.238 3.37719 20.0481 3.20664 19.8178C2.57226 18.9613 3.44481 17.18 5.1899 13.6174L6.73726 10.4584Z" />
                </Svg>
              </View>
            </Mapbox.PointAnnotation>
          )}

          {/* Render Waypoints */}
          {waypoints.map((wp, i) => renderLocationPin(`waypoint-${i}`, wp.center))}

          {/* Main Selected Route Rendering - Past (de-colored) */}
          {routeGeometries.past && (
            <Mapbox.ShapeSource key={`past-route-${isDarkMode ? 'dark' : 'light'}`} id="routeSourcePast" shape={routeGeometries.past}>
              <Mapbox.LineLayer
                id="routeFillPast"
                aboveLayerID="routeFill"
                style={{
                  lineColor: isDarkMode ? '#6b7280' : '#9ca3af',
                  lineWidth: 6,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.7,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Main Selected Route Rendering - Future (colored) */}
          {routeGeometries.future && (
            <Mapbox.ShapeSource key={`main-route-${isDarkMode ? 'dark' : 'light'}`} id="routeSourceMain" shape={routeGeometries.future} lineMetrics={true}>
              <Mapbox.LineLayer
                id="routeLineCasing"
                layerIndex={201}
                style={{
                  lineColor: isDarkMode ? '#0f172a' : '#e0e0e0',
                  lineWidth: 8,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="routeFill"
                layerIndex={202}
                style={{
                  lineColor: isDarkMode ? '#9789ffff' : '#5a45ff',
                  lineWidth: 6,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineEmissiveStrength: 1
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Alternative Routes Rendering */}
          {routes.map((rt, index) => {
            if (index === selectedRouteIndex) return null;
            return (
              <Mapbox.ShapeSource key={`route-${index}-${isDarkMode ? 'dark' : 'light'}`} id={`routeSource-${index}`} shape={rt.geometry} onPress={() => setSelectedRouteIndex(index)}>
                {/* Thicker invisible hitbox for easier tapping on mobile */}
                <Mapbox.LineLayer
                  id={`routeHitbox-${index}`}
                  style={{
                    lineColor: 'rgba(0,0,0,0)',
                    lineWidth: 25,
                  }}
                />
                <Mapbox.LineLayer
                  id={`routeLine-${index}`}
                  belowLayerID="routeLineCasing"
                  style={{
                    lineColor: isDarkMode ? '#4b5563' : '#9ca3af',
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </Mapbox.ShapeSource>
            );
          })}

          {/* Google Maps style Place Pin */}
          {selectedDestination && !isNavigating && renderLocationPin(
            "location-pin",
            selectedDestination.center
          )}

          {/* Pothole markers */}
          {potholeEvents.map((pe) => (
            <Mapbox.PointAnnotation
              key={pe.id}
              id={pe.id}
              coordinate={pe.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={{
                width: pe.severity >= 4 ? 28 : 22,
                height: pe.severity >= 4 ? 28 : 22,
                borderRadius: pe.severity >= 4 ? 14 : 11,
                backgroundColor: pe.severity >= 4 ? '#ef4444' : pe.severity >= 3 ? '#f59e0b' : '#fb923c',
                borderWidth: 2.5,
                borderColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ color: '#ffffff', fontSize: pe.severity >= 4 ? 14 : 11, fontFamily: 'GoogleSans-Bold' }}>!</Text>
              </View>
            </Mapbox.PointAnnotation>
          ))}
        </Mapbox.MapView>

        {isChoosingOnMap && (
          <View style={styles.crosshairContainer} pointerEvents="none">
            <View style={styles.crosshairVertical} />
            <View style={styles.crosshairHorizontal} />
          </View>
        )}

        {isChoosingOnMap && (
          <View style={[styles.chooseConfirmContainer, { paddingBottom: Math.max(insets.bottom, 20), zIndex: 100, elevation: 100 }]} pointerEvents="box-none">
            <TouchableOpacity style={[styles.placeActionButton, styles.placeActionPrimary]} onPress={async () => {
              const center = await mapRef.current?.getCenter();
              if (center) {
                setIsChoosingOnMap(false);
                let placeName = `Location: ${center[1].toFixed(4)}, ${center[0].toFixed(4)}`;
                let text = "Dropped Pin";
                try {
                  const results = await searchPlaces(`${center[0]},${center[1]}`);
                  if (results && results.length > 0) {
                    placeName = results[0].place_name;
                    text = results[0].text;
                  }
                } catch (e) { }

                if (isChoosingForIncident) {
                  setIsChoosingForIncident(false);
                  router.push(`/report?lat=${center[1]}&lng=${center[0]}`);
                  return;
                }

                handleSelectPlace({
                  center,
                  text,
                  place_name: placeName,
                  id: 'pin-' + Date.now()
                });
              }
            }}>
              <Text style={styles.placeActionPrimaryText}>Confirm Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating GPS Target Location Bottom Right */}
        <View style={[styles.gpsButtonContainer, { bottom: route && !isNavigating ? 360 : isNavigating ? 200 : isChoosingOnMap ? 120 : 140 }]}>
          <TouchableOpacity style={styles.gpsButton} onPress={centerOnUser}>
            <HugeiconsIcon icon={Target01Icon} size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Route Planner Overlay (Google Maps Style) */}
        {!isNavigating && isDirectionsPreview && (
          <View style={[styles.routePlannerContainer, { top: Math.max(insets.top, 10) }]} pointerEvents="box-none">
            <BlurView
              style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              blurType={isDarkMode ? "dark" : "light"}
              blurAmount={32}
              overlayColor={isDarkMode ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)"}
            />
            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>

                <View style={{ flex: 1 }}>
                  {/* Google Maps style timeline dashed border */}
                  {waypoints.length > 0 || selectedDestination ? (
                    <View style={{ position: 'absolute', left: 11, top: 24, bottom: 24, width: 2, borderLeftWidth: 2, borderStyle: 'dotted', borderColor: isDarkMode ? '#38383a' : '#cbd5e1', zIndex: -1 }} />
                  ) : null}

                  <TouchableOpacity style={styles.routePlannerInputWrapper} onPress={() => { setIsSettingOrigin(true); setIsSearchActive(true); }}>
                    <View style={styles.timelineIconContainer}>
                      <View style={styles.originDot} />
                    </View>
                    <View style={[styles.routePlannerInputBox, { borderBottomColor: isDarkMode ? '#38383a' : '#f3f4f6', borderBottomWidth: 1 }]}>
                      <Text style={[styles.routePlannerInputText, { color: isDarkMode ? '#ffffff' : '#000000' }]} numberOfLines={1}>{customOrigin ? customOrigin.text : "Your location"}</Text>
                    </View>
                    <HugeiconsIcon icon={Menu01Icon} size={20} color={isDarkMode ? "#9ca3af" : "#cbd5e1"} />
                  </TouchableOpacity>

                  {waypoints.map((wp, idx) => (
                    <View key={idx} style={styles.routePlannerInputWrapper}>
                      <View style={styles.timelineIconContainer}>
                        <View style={styles.waypointDot} />
                      </View>
                      <View style={[styles.routePlannerInputBox, { borderBottomColor: isDarkMode ? '#38383a' : '#f3f4f6', borderBottomWidth: 1 }]}>
                        <Text style={[styles.routePlannerInputText, { color: isDarkMode ? '#ffffff' : '#000000' }]} numberOfLines={1}>{wp.text}</Text>
                      </View>
                      <HugeiconsIcon icon={Menu01Icon} size={20} color={isDarkMode ? "#9ca3af" : "#cbd5e1"} />
                    </View>
                  ))}

                  <View style={styles.routePlannerInputWrapper}>
                    <View style={styles.timelineIconContainer}>
                      <HugeiconsIcon icon={Location01Icon} size={20} color="#ef4444" />
                    </View>
                    <View style={styles.routePlannerInputBox}>
                      <Text style={[styles.routePlannerInputText, { color: isDarkMode ? '#ffffff' : '#000000' }]} numberOfLines={1}>{selectedDestination?.text}</Text>
                    </View>
                    <HugeiconsIcon icon={Menu01Icon} size={20} color={isDarkMode ? "#9ca3af" : "#cbd5e1"} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Top Floating Search Bar (Hidden when navigating or actively searching) */}
        {!isNavigating && !isSearchActive && !isDirectionsPreview && !isChoosingOnMap && (
          <View style={[styles.searchContainer, { top: Math.max(insets.top, 20) }]} pointerEvents="box-none">
            <TouchableOpacity style={[styles.inputWrapper, isDarkMode && { backgroundColor: '#1c1c1e', shadowColor: '#000', borderColor: 'rgba(255,255,255,0.06)' }]} onPress={() => setIsSearchActive(true)} activeOpacity={0.9}>
              <BlurView
                style={StyleSheet.absoluteFill}
                blurType={isDarkMode ? "dark" : "light"}
                blurAmount={40}
                overlayColor={isDarkMode ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.18)"}
              />
              <View style={styles.inputContent}>
                <View style={{ marginRight: 10 }}><HugeiconsIcon icon={Search01Icon} size={20} color={isDarkMode ? '#8e8e93' : '#a1a1aa'} /></View>
                <View style={[styles.input, { justifyContent: 'center' }]}>
                  <Text style={{ color: isDarkMode ? '#8e8e93' : '#a1a1aa', fontFamily: 'GoogleSans-Medium', fontSize: 15 }}>
                    Where do you want to go?
                  </Text>
                </View>
                <View style={styles.actionCircleButton}>
                  <HugeiconsIcon icon={Mic01Icon} size={18} color="#ffffff" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Full Screen Active Search Overlay */}
        {isSearchActive && (
          <View style={[styles.fullScreenSearchContainer, { paddingTop: insets.top, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }]}>
            {/* Header Row */}
            <View style={[styles.fullScreenHeader, { borderColor: isDarkMode ? '#38383a' : '#f0f0f0' }]}>
              <TouchableOpacity onPress={closeSearch} style={{ padding: 8, marginRight: 8 }}>
                <HugeiconsIcon icon={ArrowLeft02Icon} size={24} color={isDarkMode ? '#ffffff' : '#000000'} />
              </TouchableOpacity>

              <TextInput
                style={[styles.fullScreenInput, { color: isDarkMode ? '#ffffff' : '#000000' }]}
                placeholder="Where do you want to go?"
                placeholderTextColor={isDarkMode ? '#8e8e93' : '#9ca3af'}
                autoFocus={true}
                value={searchQuery}
                onChangeText={handleSearch}
              />

              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 8 }}>
                  <HugeiconsIcon icon={Cancel01Icon} size={20} color={isDarkMode ? '#8e8e93' : '#6b7280'} />
                </TouchableOpacity>
              )}
            </View>

            {loading && <ActivityIndicator style={{ marginTop: 20 }} color="#5a45ff" />}

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 100 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.fullScreenResultItem, { borderBottomColor: isDarkMode ? '#38383a' : '#f0f0f0' }]}
                  onPress={() => { setIsSearchActive(false); handleSelectPlace(item); }}
                >
                  <View style={[styles.resultIconBackgroundCircle, { backgroundColor: isDarkMode ? '#1c1c1e' : '#f3f4f6' }]}>
                    <HugeiconsIcon icon={Location01Icon} size={20} color={isDarkMode ? '#8e8e93' : '#6b7280'} />
                  </View>

                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={[styles.resultTextPrimary, { color: isDarkMode ? '#ffffff' : '#000000' }]} numberOfLines={1}>{item.text}</Text>
                    {item.place_name.split(',').slice(1).join(',').trim() ? (
                      <Text style={[styles.resultTextSecondary, { color: isDarkMode ? '#8e8e93' : '#6b7280' }]} numberOfLines={1}>
                        {item.place_name.split(',').slice(1).join(',').trim()}
                      </Text>
                    ) : null}
                  </View>

                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={20} color={isDarkMode ? '#48484a' : '#9ca3af'} />
                </TouchableOpacity>
              )}
            />

            {/* Optional Choose On Map */}
            {!searchQuery && searchResults.length === 0 && (
              <TouchableOpacity style={[styles.chooseOnMapRow, { backgroundColor: isDarkMode ? '#1c1c1e' : undefined }]} onPress={() => { setIsChoosingOnMap(true); closeSearch(); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <HugeiconsIcon icon={MapsLocation01Icon} size={20} color={isDarkMode ? '#ffffff' : '#000000'} />
                  <Text style={[styles.chooseOnMapText, { color: isDarkMode ? '#ffffff' : undefined }]}>Choose on map</Text>
                </View>
                <View style={styles.chooseOnMapBadge}>
                  <Text style={styles.chooseOnMapBadgeText}>Map</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}


        {/* Navigation Mode: Turn-by-Turn Top Overlay */}
        {isNavigating && route && route.legs && route.legs[0].steps && (
          <View style={[styles.navOverlay, { top: Math.max(insets.top, 5), left: 0, right: 0 }]} pointerEvents="box-none">
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              ref={navScrollRef}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setPreviewStepIndex(index);
                const step = route.legs[0].steps[index];
                if (cameraRef.current) {
                  if (index === currentStepIndex && location) {
                    cameraRef.current.setCamera({
                      centerCoordinate: [location.coords.longitude, location.coords.latitude],
                      zoomLevel: 18,
                      pitch: 65,
                      animationDuration: 1000
                    });
                  } else if (step) {
                    cameraRef.current.setCamera({
                      centerCoordinate: step.maneuver.location,
                      zoomLevel: 18,
                      pitch: 45,
                      animationDuration: 1000
                    });
                  }
                }
              }}
              style={{ flexGrow: 0 }}
            >
              {route.legs[0].steps.map((step: any, idx: number) => {
                const ManeuverIcon = getManeuverIcon(step);
                return (
                  <View key={idx} style={{ width: screenWidth, paddingHorizontal: 12 }}>
                    <View style={{ backgroundColor: '#5a45ff', borderRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }}>
                      <View style={{ marginRight: 16 }}>
                        <ManeuverIcon size={42} color="#ffffff" strokeWidth={2.5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 24, color: '#ffffff', marginBottom: 4 }}>
                          {step.distance && step.distance > 0 ? `${step.distance.toFixed(0)} m` : `Next`}
                        </Text>
                        <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 18, color: '#e5e7eb' }} numberOfLines={2}>
                          {step.maneuver?.instruction}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Pothole Detection Toast */}
        {isNavigating && lastDetection && (
          <View style={{
            position: 'absolute',
            bottom: remoteDetection ? 210 : 140, // Move up if remote toast is also visible
            left: 20,
            right: 20,
            zIndex: 200,
          }}>
            <View style={{
              backgroundColor: lastDetection.severity >= 4 ? '#ef4444' : lastDetection.severity >= 3 ? '#f59e0b' : '#fb923c',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
                <Text style={{ color: '#ffffff', fontSize: 20, fontFamily: 'GoogleSans-Bold' }}>⚠</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 15, color: '#ffffff' }}>
                  {lastDetection.severity >= 4 ? 'Severe Bump' : lastDetection.severity >= 3 ? 'Pothole Detected' : 'Road Bump'}
                </Text>
                <Text style={{ fontFamily: 'GoogleSans-Regular', fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                  {lastDetection.peakAccel.toFixed(1)} m/s² • severity {lastDetection.severity}/5 • {potholeEvents.length} total
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Mesh Network Remote Detection Toast */}
        {isNavigating && remoteDetection && (
          <View style={{
            position: 'absolute',
            bottom: 140,
            left: 20,
            right: 20,
            zIndex: 199,
          }}>
            <View style={{
              backgroundColor: isDarkMode ? '#2c2c2e' : '#ffffff', // Clean sleek surface
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000000',
              shadowOpacity: 0.2,
              shadowRadius: 10,
              elevation: 8,
            }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: remoteDetection.type === 'incident' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
                <Text style={{ fontSize: 18, fontFamily: 'GoogleSans-Bold' }}>
                  {remoteDetection.type === 'incident' ? '🛑' : '🚧'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 15, color: isDarkMode ? '#ffffff' : '#111827' }}>
                  {remoteDetection.type === 'incident' ? 'Incident Reported' : 'Pothole Detected'}
                </Text>
                <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 12, color: isDarkMode ? '#9ca3af' : '#6b7280', marginTop: 2 }}>
                  {location ? `${Math.round(turf.distance(turf.point([location.coords.longitude, location.coords.latitude]), turf.point(remoteDetection.event.coordinate), { units: 'meters' }))} meters away` : 'Nearby'} • By community
                </Text>
              </View>
              <View style={{ backgroundColor: isDarkMode ? 'rgba(90,69,255,0.2)' : '#eef2ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 10, color: isDarkMode ? '#a5b4fc' : '#4f46e5' }}>MESH</Text>
              </View>
            </View>
          </View>
        )}

        {/* Navigation Bottom Sheet */}
        {isNavigating && route && (
          <View style={[styles.chooseConfirmContainer, { paddingBottom: Math.max(insets.bottom, 20), zIndex: 100, elevation: 100 }]} pointerEvents="box-none">
            <View style={{ backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={stopNavigation} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <HugeiconsIcon icon={Cancel01Icon} size={24} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 22, color: '#5a45ff' }}>
                  {getEstimatedTime(travelProfile)}
                </Text>
                <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 15, color: isDarkMode ? '#8e8e93' : '#4b5563' }}>
                  {((route.distance - (currentStepIndex * 50)) / 1000).toFixed(1)} km • {new Date(Date.now() + (route.duration * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <TouchableOpacity style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDarkMode ? '#2c2c2e' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <HugeiconsIcon icon={Share01Icon} size={24} color={isDarkMode ? '#8e8e93' : '#4b5563'} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* Google Maps Style Place Summary Sheet (Hide when looking at directions or choosing on map) */}
        {selectedDestination && !isDirectionsPreview && !isNavigating && !isSearchActive && !isChoosingOnMap && (
          <View style={[styles.placeSheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <BlurView style={StyleSheet.absoluteFill} blurType={isDarkMode ? "dark" : "light"} blurAmount={32} overlayColor={isDarkMode ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)"} />

            <View style={styles.placeSheetHeader}>
              <View style={{ flex: 1, paddingRight: 15 }}>
                <Text style={[styles.placeTitle, { color: isDarkMode ? '#ffffff' : '#000000' }]} numberOfLines={1}>{selectedDestination.text}</Text>
                <Text style={styles.placeSubtitle} numberOfLines={1}>
                  {selectedDestination.place_name.split(',').slice(1).join(',').trim() || selectedDestination.text}
                </Text>
              </View>
              <TouchableOpacity style={[styles.closePlaceButton, { backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]} onPress={() => setSelectedDestination(null)}>
                <HugeiconsIcon icon={Cancel01Icon} size={20} color={isDarkMode ? "#8e8e93" : "#4b5563"} />
              </TouchableOpacity>
            </View>

            {/* Action Row */}
            <View style={styles.placeActionRow}>
              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionPrimary]} onPress={getDirectionsForSelected}>
                <View style={{ marginRight: 6 }}>
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} color="#ffffff" />
                </View>
                <Text style={styles.placeActionPrimaryText}>Directions</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]} onPress={startNavigationDirect}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <HugeiconsIcon icon={Navigation03Icon} size={18} color={isDarkMode ? '#ffffff' : '#000000'} />
                </View>
                <Text style={[styles.placeActionSecondaryText, { color: isDarkMode ? '#ffffff' : '#000000' }]}>Start</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { width: 44, paddingHorizontal: 0, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]}>
                <HugeiconsIcon icon={Bookmark02Icon} size={20} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { width: 44, paddingHorizontal: 0, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]}>
                <HugeiconsIcon icon={Share01Icon} size={20} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Directions Preview Bottom Sheet */}
        {isDirectionsPreview && route && !isChoosingOnMap && (
          <View style={[styles.placeSheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <BlurView style={StyleSheet.absoluteFill} blurType={isDarkMode ? "dark" : "light"} blurAmount={32} overlayColor={isDarkMode ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)"} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
              {/* Pill Tab Selector for Modes */}
              <View style={{ flexDirection: 'row', backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6', borderRadius: 9999, padding: 3, flex: 1, marginRight: 16 }}>
                <TouchableOpacity onPress={() => { setTravelProfile('driving'); fetchRoutes('driving'); }} style={[styles.travelModeProfile, { flex: 1 }, travelProfile === 'driving' && { backgroundColor: isDarkMode ? '#3a3a3c' : '#ffffff' }]}>
                  <HugeiconsIcon icon={Car01Icon} size={18} color={travelProfile === 'driving' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93'} />
                  <Text style={{ fontSize: 10, fontFamily: 'GoogleSans-Medium', color: travelProfile === 'driving' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93' }}>{getEstimatedTime('driving')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setTravelProfile('cycling'); fetchRoutes('cycling'); }} style={[styles.travelModeProfile, { flex: 1 }, travelProfile === 'cycling' && { backgroundColor: isDarkMode ? '#3a3a3c' : '#ffffff' }]}>
                  <HugeiconsIcon icon={BicycleIcon} size={18} color={travelProfile === 'cycling' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93'} />
                  <Text style={{ fontSize: 10, fontFamily: 'GoogleSans-Medium', color: travelProfile === 'cycling' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93' }}>{getEstimatedTime('cycling')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setTravelProfile('walking'); fetchRoutes('walking'); }} style={[styles.travelModeProfile, { flex: 1 }, travelProfile === 'walking' && { backgroundColor: isDarkMode ? '#3a3a3c' : '#ffffff' }]}>
                  <HugeiconsIcon icon={WalkingIcon} size={18} color={travelProfile === 'walking' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93'} />
                  <Text style={{ fontSize: 10, fontFamily: 'GoogleSans-Medium', color: travelProfile === 'walking' ? (isDarkMode ? '#ff006aff' : '#5a45ff') : '#8e8e93' }}>{getEstimatedTime('walking')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.closePlaceButton, { backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]} onPress={() => { setIsDirectionsPreview(false); setRoutes([]); }}>
                <HugeiconsIcon icon={Cancel01Icon} size={20} color={isDarkMode ? "#8e8e93" : "#4b5563"} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.placeTitle, { color: isDarkMode ? '#ffffff' : '#000000' }]}>
                {Math.floor(route.duration / 60)} min <Text style={{ color: '#6b7280', fontSize: 16 }}>({(route.distance / 1000).toFixed(1)} km)</Text>
              </Text>
              <Text style={styles.placeSubtitle}>
                {waypoints.length > 0 ? `Via ${waypoints.length} stop${waypoints.length > 1 ? 's' : ''} • ` : ''}{routes.length > 1 ? `Via ${route.weight_name || 'alternative route'} • ${routes.length - 1} alternative${routes.length > 2 ? 's' : ''}` : `Fastest route now`}
              </Text>
              {/* Update route index if best route changes */}
              {(() => {
                const scored: ScoredRoute[] = scoreAndRankRoutes(routes, potholeEvents, isWomensMode);
                const bestRouteData = scored[0];
                const thisRoute = scored.find((s: ScoredRoute) => s.routeIndex === selectedRouteIndex);
                if (!thisRoute) return null;

                const bestRoute = scored[0];
                const isWorstPick = selectedRouteIndex !== recommendedRouteIndex;

                // Find AQI for this specific route from AI analysis
                const currentAqiScore = aiAnalysis?.routeScores?.find(s => s.route_index === selectedRouteIndex)?.pollution_penalty;
                const recAqiScore = aiAnalysis?.routeScores?.find(s => s.route_index === recommendedRouteIndex)?.pollution_penalty;
                const currentComplex = aiAnalysis?.routeScores?.find(s => s.route_index === selectedRouteIndex)?.complexity_penalty;
                const recComplex = aiAnalysis?.routeScores?.find(s => s.route_index === recommendedRouteIndex)?.complexity_penalty;

                const rawBase = thisRoute.baseDuration / 5000;
                const rawPenalty = thisRoute.totalPenalty / 5000;

                const baseIndex = Math.min(0.8, rawBase).toFixed(2);
                const penaltyIndex = Math.max(0, Math.min(0.99 - parseFloat(baseIndex), rawPenalty)).toFixed(2);
                const totalIndex = (parseFloat(baseIndex) + parseFloat(penaltyIndex)).toFixed(2);
                const indexLabel = 'Hazard Index';

                let warningMsg: string | null = null;
                if (thisRoute.potholeCount > 0) {
                  warningMsg = (thisRoute.potholeCount >= 3 ? 'Multiple hazards' : 'Incidents') + ' reported on this path.';
                  if (isWorstPick) {
                    warningMsg += ' We recommend a safer route.';
                  }

                  if (isAsthmaMode && aiAnalysis && isWorstPick) {
                    if (currentAqiScore && recAqiScore && currentAqiScore > recAqiScore) {
                      const diff = (currentAqiScore - recAqiScore).toFixed(1);
                      warningMsg = `Danger: Pollution levels here are higher (+${diff} PM2.5) than the AI recommended route!`;
                    } else {
                      warningMsg = 'The AI has identified a safer, more optimized route for your specific health profile.';
                    }
                  }
                }

                const isSmooth = parseFloat(penaltyIndex) === 0;

                return (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    {warningMsg && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#4c0519' : '#ffe4e6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, gap: 10 }}>
                        <HugeiconsIcon icon={Alert01Icon} size={24} color={isDarkMode ? '#fda4af' : '#e11d48'} />
                        <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 13, color: isDarkMode ? '#fda4af' : '#e11d48', flex: 1, lineHeight: 18 }}>
                          {warningMsg}
                        </Text>
                      </View>
                    )}

                    {isWorstPick && isAsthmaMode && currentAqiScore !== undefined && recAqiScore !== undefined && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#1c1c1e' : '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 8 }}>
                        <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'GoogleSans-Bold' }}>POOR AQI</Text>
                        </View>
                        <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 12, color: isDarkMode ? '#ff9999' : '#e11d48' }}>
                          Current: {currentAqiScore.toFixed(1)} PM2.5
                        </Text>
                        <Text style={{ color: isDarkMode ? '#4b5563' : '#9ca3af', fontSize: 12 }}>|</Text>
                        <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 12, color: isDarkMode ? '#34d399' : '#059669' }}>
                          Cleanest: {recAqiScore.toFixed(1)} PM2.5
                        </Text>
                      </View>
                    )}

                    {!isAsthmaMode && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <View style={{ backgroundColor: isSmooth ? '#10b981' : '#f59e0b', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 11, color: '#ffffff' }}>
                            {isSmooth ? 'Optimal Route' : 'Fair Condition'}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 13, color: isDarkMode ? '#e5e7eb' : '#374151' }}>
                          {indexLabel}: {totalIndex} / 1.0
                        </Text>
                        {thisRoute.potholeCount > 0 && (
                          <Text style={{ fontFamily: 'GoogleSans-Regular', fontSize: 12, color: isDarkMode ? '#8e8e93' : '#6b7280' }}>
                            • {thisRoute.potholeCount} alert{thisRoute.potholeCount > 1 ? 's' : ''}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* AQI AI Analysis Notice - ONLY SHOW ON RECOMMENDED ROUTE */}
              {isAsthmaMode && aiAnalysis && selectedRouteIndex === recommendedRouteIndex && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#064e3b' : '#dcfce7', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, gap: 10 }}>
                    <Wind color={isDarkMode ? '#34d399' : '#059669'} size={24} />
                    <Text style={{ fontFamily: 'GoogleSans-Medium', fontSize: 13, color: isDarkMode ? '#34d399' : '#047857', flex: 1, lineHeight: 18 }}>
                      {aiAnalysis.reasoning}
                    </Text>
                  </View>

                  {(() => {
                    const bestAqi = aiAnalysis?.routeScores?.find(s => s.route_index === recommendedRouteIndex)?.pollution_penalty;
                    return bestAqi !== undefined ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#064e3b' : '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6, alignSelf: 'flex-start', opacity: 0.8 }}>
                        <Text style={{ fontFamily: 'GoogleSans-Bold', fontSize: 11, color: isDarkMode ? '#34d399' : '#059669' }}>
                          SENSOR DATA: {bestAqi.toFixed(1)} PM2.5 (Cleanest Path)
                        </Text>
                      </View>
                    ) : null;
                  })()}
                </View>
              )}
            </View>

            <View style={[styles.placeActionRow, { marginBottom: 16 }]}>
              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionPrimary, { flex: 1.5 }]} onPress={startNavigationDirect}>
                <View style={{ marginRight: 6 }}>
                  <HugeiconsIcon icon={Navigation03Icon} size={18} color="#ffffff" />
                </View>
                <Text style={styles.placeActionPrimaryText}>Start</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { paddingHorizontal: 0, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]} onPress={() => { setIsAddingWaypoint(true); setIsSearchActive(true); }}>
                <HugeiconsIcon icon={Search01Icon} size={20} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { paddingHorizontal: 0, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]}>
                <HugeiconsIcon icon={Bookmark02Icon} size={20} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.placeActionButton, styles.placeActionSecondary, { paddingHorizontal: 0, backgroundColor: isDarkMode ? '#2c2c2e' : '#f3f4f6' }]}>
                <HugeiconsIcon icon={Share01Icon} size={20} color={isDarkMode ? "#ffffff" : "#000000"} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Custom Bottom Tab Navigation */}
        {!isNavigating && !selectedDestination && !isDirectionsPreview && !isChoosingOnMap && (
          <View style={[styles.tabBarContainer, { paddingBottom: Math.max(insets.bottom, 15), backgroundColor: isDarkMode ? '#000000' : '#ffffff', borderTopColor: isDarkMode ? '#38383a' : '#e5e5ea' }]}>
            <TouchableOpacity style={styles.tabItem}>
              <View style={styles.tabIconActive}>
                <HugeiconsIcon icon={Navigation03Icon} size={20} color="#ffffff" />
              </View>
              <Text style={styles.tabTextActive}>Explore</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/nearby')}>
              <View style={styles.tabIconInactive}>
                <HugeiconsIcon icon={MapsLocation01Icon} size={24} color={isDarkMode ? '#8e8e93' : '#9ca3af'} />
              </View>
              <Text style={[styles.tabTextInactive, isDarkMode && { color: '#8e8e93' }]}>Nearby</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/report')}>
              <View style={styles.tabIconInactive}>
                <HugeiconsIcon icon={NewsIcon} size={24} color={isDarkMode ? '#8e8e93' : '#9ca3af'} />
              </View>
              <Text style={[styles.tabTextInactive, isDarkMode && { color: '#8e8e93' }]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/settings')}>
              <View style={styles.tabIconInactive}>
                <HugeiconsIcon icon={Settings01Icon} size={24} color={isDarkMode ? '#8e8e93' : '#9ca3af'} />
              </View>
              <Text style={[styles.tabTextInactive, isDarkMode && { color: '#8e8e93' }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Emergency Ambulance Overlay — Full-screen pulsating alert */}
        {ambulanceNearby && !isAmbulanceMode && <EmergencyPulseOverlay />}
      </View>
    </SafeAreaProvider>
  );
}

// ─── Emergency Pulse Overlay Component ──────────────────────────────
function EmergencyPulseOverlay() {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    // Pulsating fade: visible → transparent → visible
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Icon breathe
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(iconScale, {
          toValue: 1.0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconScale, {
          toValue: 1.0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    breathe.start();

    return () => {
      pulse.stop();
      breathe.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.emergencyFullScreen,
        {
          opacity: pulseAnim,
        },
      ]}
    >
      {/* Top breathing icon */}
      <Animated.View style={{ transform: [{ scale: iconScale }], marginBottom: 28 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', padding: 24, borderRadius: 100 }}>
          <Svg width="56" height="56" fill="#ffffff" viewBox="0 0 24 24">
            <Path d="m12,2C6.49,2,2,6.49,2,12s4.49,10,10,10,10-4.49,10-10S17.51,2,12,2Zm0,2c3.71,0,6.82,2.54,7.73,5.97l-4.01-.5c-2.47-.31-4.97-.31-7.44,0l-4.01.5c.9-3.43,4.02-5.97,7.73-5.97Zm1.5,8c0,.83-.67,1.5-1.5,1.5s-1.5-.67-1.5-1.5.67-1.5,1.5-1.5,1.5.67,1.5,1.5Zm-9.5,0l1.67.28c2.58.43,4.58,2.48,4.95,5.07l.37,2.58c-3.93-.5-6.99-3.86-6.99-7.93Zm9.01,7.93l.37-2.58c.37-2.59,2.37-4.64,4.95-5.07l1.67-.28c0,4.07-3.05,7.43-6.99,7.93Z" />
          </Svg>
        </View>
      </Animated.View>

      {/* Title */}
      <Text style={styles.emergencyTitle}>PARK SIDE</Text>

      {/* Thin separator line */}
      <View style={{ width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1, marginVertical: 16 }} />

      {/* Subtitle */}
      <Text style={styles.emergencySubtitle}>
        Emergency vehicle approaching{"\n"}Move to the side of the road
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  emergencyFullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(180, 30, 30, 0.92)',
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emergencyTitle: {
    fontFamily: 'GoogleSans-Bold',
    fontSize: 28,
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 3,
  },
  emergencySubtitle: {
    fontFamily: 'GoogleSans-Medium',
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  map: {
    flex: 1,
  },
  searchContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    zIndex: 10,
  },
  inputWrapper: {
    borderRadius: 999, // Pill shape
    overflow: 'hidden',
    borderWidth: 0.005,
    borderColor: 'rgba(255, 255, 255, 0)',
    backgroundColor: 'rgba(255, 255, 255, 1)', // Ensures decent visibility even if blur fails
    shadowColor: '#5a45ff',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 10,
  },
  inputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5, // Sleek, not huge
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'GoogleSans-Medium',
    color: '#1f2937',
    marginLeft: 4,
  },
  actionCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5a45ff', // Brand purple from mockup
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5a45ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  resultsList: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },

  // FULL SCREEN SEARCH STYLES
  fullScreenSearchContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    zIndex: 100,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  fullScreenInput: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'GoogleSans-Regular',
    color: '#1f2937',
    paddingHorizontal: 8,
    height: 44,
  },
  fullScreenResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  resultIconBackgroundCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  resultTextPrimary: {
    fontSize: 16,
    fontFamily: 'GoogleSans-Medium',
    color: '#1f2937',
  },
  resultTextSecondary: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
    fontFamily: 'GoogleSans-Regular',
  },
  chooseOnMapRow: {
    position: 'absolute',
    bottom: 30, // Or placed right below list
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: '#f0f0f0',
    backgroundColor: '#ffffff',
  },
  chooseOnMapText: {
    marginLeft: 16,
    fontSize: 16,
    fontFamily: 'GoogleSans-Medium',
    color: '#1f2937',
  },
  chooseOnMapBadge: {
    backgroundColor: '#e0f2fe', // subtle Google-like blue
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chooseOnMapBadgeText: {
    color: '#0284c7',
    fontFamily: 'GoogleSans-Bold',
    fontSize: 13,
  },
  // GPS BUTTON Bottom Right
  gpsButtonContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  gpsButton: {
    backgroundColor: '#ffffff',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  // MARKER STYLES (MATCHING MOCKUP)
  markerWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 150,
    height: 100,
  },
  speechBubble: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 10,
  },
  speechText: {
    color: '#4b5563',
    fontFamily: 'GoogleSans-Medium',
    fontSize: 14,
  },
  ringsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 23, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 23, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#812ed9', // the purple marker dot inside
  },

  // THE CUSTOM BOTTOM SHEET
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    padding: 30,
    paddingBottom: Platform.OS === 'ios' ? 45 : 30,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 20,
    elevation: 20,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetHeaderIconWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sheetHeaderTextContainer: {
    flex: 1,
  },
  sheetHeaderTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSans-Medium',
    color: '#374151',
    lineHeight: 20,
  },
  sheetHeaderTime: {
    fontSize: 13,
    color: '#9ca3af',
    fontFamily: 'GoogleSans-Medium',
  },
  sheetMainQuestion: {
    fontSize: 22,
    fontFamily: 'GoogleSans-Regular',
    color: '#4b5563',
    lineHeight: 30,
    marginBottom: 30,
  },
  sheetButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  laterButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    color: '#4b5563',
    fontFamily: 'GoogleSans-Medium',
    fontSize: 16,
  },
  gradientGo: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
  },
  goText: {
    color: '#fff',
    fontFamily: 'GoogleSans-Bold',
    fontSize: 16,
  },

  // NAV OVERLAY
  navOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 20,
  },
  directionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  directionIcon: {
    marginRight: 20,
  },
  directionTextContainer: {
    flex: 1,
  },
  directionTitle: {
    color: '#6b7280',
    fontSize: 14,
    fontFamily: 'GoogleSans-Medium',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  directionText: {
    color: '#111827',
    fontSize: 20,
    fontFamily: 'GoogleSans-Bold',
    lineHeight: 28,
  },
  stopButton: {
    marginTop: 20,
    backgroundColor: '#fff',
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  stopButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontFamily: 'GoogleSans-Bold',
  },
  // Custom Bottom Tabs
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 20,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#5a45ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabIconInactive: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabTextActive: {
    fontFamily: 'GoogleSans-Bold',
    fontSize: 12,
    color: '#5a45ff',
  },
  tabTextInactive: {
    fontFamily: 'GoogleSans-Medium',
    fontSize: 12,
    color: '#9ca3af',
  },

  // PLACE SHEET
  placeSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 20,
    overflow: 'hidden',
  },
  placeSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  placeTitle: {
    fontFamily: 'GoogleSans-Bold',
    fontSize: 22,
    marginBottom: 4,
  },
  placeSubtitle: {
    fontFamily: 'GoogleSans-Regular',
    fontSize: 14,
    color: '#6b7280',
  },
  closePlaceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 29,
    paddingHorizontal: 16,
  },
  placeActionPrimary: {
    backgroundColor: '#5a45ff',
  },
  placeActionPrimaryText: {
    color: '#ffffff',
    fontFamily: 'GoogleSans-Regular',
    fontSize: 14,
  },
  placeActionSecondary: {
    flex: 1,
  },
  placeActionSecondaryText: {
    fontFamily: 'GoogleSans-Regular',
    fontSize: 14,
  },
  travelModeProfile: {
    height: 40,
    flex: 1,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairVertical: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: '#1f2937',
    borderRadius: 1,
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: '#1f2937',
    borderRadius: 1,
  },
  chooseConfirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'transparent',
  },
  routePlannerContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  routePlannerInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 35,
  },
  timelineIconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  routePlannerInputBox: {
    flex: 1,
    height: 33,
    justifyContent: 'center',
    paddingRight: 8,
  },
  routePlannerInputText: {
    fontFamily: 'GoogleSans-Regular',
    fontSize: 16,
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  waypointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
  },
});