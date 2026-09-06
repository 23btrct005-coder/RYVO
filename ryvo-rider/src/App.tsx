// Vercel Production Trigger: 2026-09-06T18:24:00 - deploy: force trigger Vercel build for custom tips & Auto->Cab recommendation
import { useState, useEffect, useRef } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
// Leaflet CSS removed; Mapbox styles are applied via mapStyle prop
const DEFAULT_MAPBOX_TOKEN = "pk.eyJ1IjoiYWJoaTA5MjUiLCJhIjoiY210bzV2YnN0MGRrbjM0c2c5ajR0MWVsbyJ9" + "." + "_78OmqK7nqvyHwwjDoDfzw";
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || DEFAULT_MAPBOX_TOKEN;
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'
import { Geolocation } from '@capacitor/geolocation'

const decodePolyline = (encoded: string): [number, number][] => {
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  const coordinates: [number, number][] = [];

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
};



const CurrentLocationMarker = () => (
  <div className="relative flex items-center justify-center">
    <div className="absolute w-8 h-8 bg-blue-500/40 rounded-full animate-ping" />
    <div className="w-5 h-5 bg-blue-600 border-2 border-white rounded-full shadow-xl ring-4 ring-blue-500/40 z-10" />
  </div>
);

const PickupMarker = ({ name, onClick }: { name?: string; onClick?: () => void }) => (
  <div onClick={onClick} className="relative flex flex-col items-center cursor-pointer group z-30">
    {name && (
      <div className="bg-zinc-900/95 backdrop-blur-md border border-emerald-500/80 text-white font-extrabold text-[11px] px-2.5 py-1 rounded-full shadow-2xl mb-1 flex items-center space-x-1 whitespace-nowrap max-w-[170px] truncate group-hover:scale-105 transition-transform">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
        <span className="truncate">{name}</span>
        <span className="text-[9px] text-emerald-400 font-bold ml-1">✏️</span>
      </div>
    )}
    <div className="w-7 h-7 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
      <div className="w-3 h-3 bg-white rounded-full" />
    </div>
    <div className="w-1 h-3 bg-emerald-600 rounded-b-full shadow-md" />
  </div>
);

const DestinationMarker = ({ name, onClick }: { name?: string; onClick?: () => void }) => (
  <div onClick={onClick} className="relative flex flex-col items-center cursor-pointer group z-30">
    {name && (
      <div className="bg-zinc-900/95 backdrop-blur-md border border-red-500/80 text-white font-extrabold text-[11px] px-2.5 py-1 rounded-full shadow-2xl mb-1 flex items-center space-x-1 whitespace-nowrap max-w-[170px] truncate group-hover:scale-105 transition-transform">
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
        <span className="truncate">{name}</span>
        <span className="text-[9px] text-red-400 font-bold ml-1">✏️</span>
      </div>
    )}
    <div className="w-7 h-7 bg-red-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
      <span className="text-xs">🏁</span>
    </div>
    <div className="w-1 h-3 bg-red-600 rounded-b-full shadow-md" />
  </div>
);

const LiveDriverMarker = ({ type }: { type: string }) => {
  const emoji = type?.toUpperCase() === 'AUTO' ? '🛺' : type?.toUpperCase() === 'BIKE' ? '🛵' : '🚗';
  return (
    <div className="relative flex items-center justify-center">
      <div className="bg-white border-2 border-blue-600 rounded-full w-10 h-10 flex items-center justify-center text-xl shadow-2xl transition-transform hover:scale-110">
        {emoji}
      </div>
    </div>
  );
};


const StopMarker = ({ index, name, onClick }: { index: number; name?: string; onClick?: () => void }) => (
  <div onClick={onClick} className="relative flex flex-col items-center cursor-pointer group z-30">
    {name && (
      <div className="bg-zinc-900/95 backdrop-blur-md border border-amber-500/80 text-white font-extrabold text-[11px] px-2.5 py-1 rounded-full shadow-2xl mb-1 flex items-center space-x-1 whitespace-nowrap max-w-[170px] truncate group-hover:scale-105 transition-transform">
        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
        <span className="truncate">{name}</span>
        <span className="text-[9px] text-amber-400 font-bold ml-1">✏️</span>
      </div>
    )}
    <div className="w-7 h-7 bg-amber-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg text-xs font-black text-black group-hover:scale-110 transition-transform">
      {index + 1}
    </div>
    <div className="w-1 h-3 bg-amber-600 rounded-b-full shadow-md" />
  </div>
);

const VehicleMarker = ({ type }: { type: string }) => {
  const emoji = type?.toUpperCase() === 'AUTO' ? '🛺' : type?.toUpperCase() === 'BIKE' ? '🛵' : '🚗';
  return (
    <div className="bg-white border-2 border-blue-500 rounded-full w-10 h-10 flex items-center justify-center text-xl shadow-md">
      {emoji}
    </div>
  );
};

type VehicleType = 'bike' | 'auto' | 'mini'

interface Suggestion {
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
}

// A simple component to re-center the map when position changes
// ChangeView component removed; Mapbox GL handles view state via initialViewState

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [riderProfile, setRiderProfile] = useState<any>(null)
  
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [status, setStatus] = useState<'idle' | 'estimating' | 'confirming' | 'searching' | 'accepted' | 'arrived' | 'in_transit' | 'completed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentRideId, setCurrentRideId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSheetMinimized, setIsSheetMinimized] = useState(false)
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null)
  const [driverDetails, setDriverDetails] = useState<any>(null)
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const [distance, setDistance] = useState<number>(0)

  const [estimatedDuration, setEstimatedDuration] = useState<number>(0);

  const getETAForVehicle = (type: VehicleType, baseMins: number) => {
    if (baseMins <= 0) return 1;
    switch(type) {
      case 'bike': return Math.max(1, Math.round(baseMins * 0.90));
      case 'auto': return Math.max(1, Math.round(baseMins * 0.98));
      case 'mini': return Math.max(1, Math.round(baseMins * 1.0));
      default: return baseMins;
    }
  };

  const [otp, setOtp] = useState<string | null>(null)
  
  const [rating, setRating] = useState<number>(0)
  const [review, setReview] = useState<string>('')
  const [hasRated, setHasRated] = useState<boolean>(false)
  
  // Tip & 2-Min Session Timeout state
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customTipInput, setCustomTipInput] = useState<string>('');
  const [isCustomTipOpen, setIsCustomTipOpen] = useState<boolean>(false);
  const [searchingTimer, setSearchingTimer] = useState<number>(120);

  const [noDriverFound, setNoDriverFound] = useState<boolean>(false);
  const [suggestedVehicle, setSuggestedVehicle] = useState<VehicleType | null>(null);

  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([])
  
    
  // Multi-stop State
  const [stops, setStops] = useState<{ id: string; address: string; coords: [number, number] | null }[]>([]);

  const addStop = () => {
    if (stops.length >= 3) {
      showToast("Maximum 3 intermediate stops allowed.");
      return;
    }
    setStops([...stops, { id: 'stop_' + Date.now(), address: '', coords: null }]);
  };

  const removeStop = (id: string) => {
    setStops(stops.filter(s => s.id !== id));
  };

  const updateStop = (id: string, address: string, coords: [number, number] | null) => {
    setStops(stops.map(s => s.id === id ? { ...s, address, coords } : s));
  };

  // Interactive Map Location Picker State
  const [isSelectingOnMap, setIsSelectingOnMap] = useState<boolean>(false);
  const [mapTargetInput, setMapTargetInput] = useState<'pickup' | 'destination' | string>('destination');
  const [mapCenterCoords, setMapCenterCoords] = useState<[number, number]>([12.8753, 77.5958]);
  const [reverseGeoAddress, setReverseGeoAddress] = useState<string>('Fetching location...');
  const [isGeocodingMapPin, setIsGeocodingMapPin] = useState<boolean>(false);

  const startMapSelection = (target: 'pickup' | 'destination' | string) => {
    setMapTargetInput(target);
    setActiveInput('none');
    
    let initialCoords = currentPosition;
    if (target === 'pickup' && pickupCoords) initialCoords = pickupCoords;
    if (target === 'destination' && destCoords) initialCoords = destCoords;
    const foundStop = stops.find(s => s.id === target);
    if (foundStop && foundStop.coords) initialCoords = foundStop.coords;

    setMapCenterCoords(initialCoords);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [initialCoords[1], initialCoords[0]], zoom: 16 });
    }
    reverseGeocode(initialCoords[0], initialCoords[1]);
    setIsSelectingOnMap(true);
  };

  const reverseGeocode = async (lat: number, lon: number) => {
    setIsGeocodingMapPin(true);
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&types=poi,address,neighborhood,locality,place`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const placeName = data.features[0].place_name;
        setReverseGeoAddress(placeName);
        setIsGeocodingMapPin(false);
        return;
      }
    } catch (e) {
      console.warn("Mapbox Reverse geocoding fallback:", e);
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data && data.display_name) {
        setReverseGeoAddress(data.display_name);
      } else {
        setReverseGeoAddress(`Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
      }
    } catch {
      setReverseGeoAddress(`Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
    }
    setIsGeocodingMapPin(false);
  };

  const confirmMapLocation = () => {
    const address = reverseGeoAddress;
    const coords: [number, number] = [mapCenterCoords[0], mapCenterCoords[1]];

    if (mapTargetInput === 'pickup') {
      setPickup(address);
      setPickupCoords(coords);
    } else if (mapTargetInput === 'destination') {
      setDestination(address);
      setDestCoords(coords);
    } else {
      updateStop(mapTargetInput, address, coords);
    }

    setCurrentPosition(coords);
    setIsSelectingOnMap(false);
    showToast(`Set ${mapTargetInput === 'pickup' ? 'Pickup' : mapTargetInput === 'destination' ? 'Destination' : 'Stop'} location from map!`);
  };

  const [savingPlace, setSavingPlace] = useState<{ address: string; coords: [number, number] } | null>(null);
  const [saveTagInput, setSaveTagInput] = useState<string>('Home');
  const [selectedIcon, setSelectedIcon] = useState<string>('🏠');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerSaveModal = (address: string, coords: [number, number], defaultTag = 'Home', defaultIcon = '🏠') => {
    setSaveTagInput(defaultTag);
    setSelectedIcon(defaultIcon);
    setSavingPlace({ address, coords });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('mini')
  const [activeModal, setActiveModal] = useState<'none' | 'history' | 'payments' | 'settings' | 'help'>('none')
  const [pastRides, setPastRides] = useState<any[]>([])

  const fetchPastRides = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('riderid', user.id)
        .order('created_at', { ascending: false });
      if (data) setPastRides(data);
    } catch (e) {
      console.error("Error fetching past rides:", e);
    }
  };
  
  const [currentPosition, setCurrentPosition] = useState<[number, number]>([12.8753, 77.5958])
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null)
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    if (currentPosition && mapRef.current && (!pickupCoords || !destCoords)) {
      mapRef.current.flyTo({ center: [currentPosition[1], currentPosition[0]], zoom: 15 });
    }
  }, [currentPosition, pickupCoords, destCoords]);

  // Dedicated Map camera fit bounds effect: ensures both pickup & drop points are inside map viewport
  useEffect(() => {
    if (pickupCoords && destCoords && mapRef.current) {
      const allCoords: [number, number][] = [pickupCoords];
      stops.forEach(s => { if (s.coords) allCoords.push(s.coords); });
      allCoords.push(destCoords);

      const lats = allCoords.map(c => c[0]);
      const lngs = allCoords.map(c => c[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const bottomPadding = isSheetMinimized ? 120 : (status === 'confirming' ? 360 : 320);

      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { 
              padding: { top: 100, bottom: bottomPadding, left: 60, right: 60 }, 
              duration: 1000 
            }
          );
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [pickupCoords, destCoords, stops, isSheetMinimized, status]);

  const [pickupSuggestions, setPickupSuggestions] = useState<Suggestion[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([])

  const [activeInput, setActiveInput] = useState<'none' | 'pickup' | 'destination' | string>('none')
  const [stopSuggestionsMap, setStopSuggestionsMap] = useState<{ [stopId: string]: Suggestion[] }>({})

  // Saved locations (stored locally per user - starts empty until saved via Heart)
  const [savedPlaces, setSavedPlaces] = useState<{ label: string; address: string; coords: [number, number]; icon: string }[]>(() => {
    try {
      const stored = localStorage.getItem('ryvo_saved_places');
      if (stored) {
         const parsed = JSON.parse(stored);
         if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Error reading saved places", e);
    }
    return [];
  });

  const savePlace = (label: string, address: string, coords: [number, number], icon: string = '⭐') => {
    const updated = [...savedPlaces.filter(p => p.label !== label), { label, address, coords, icon }];
    setSavedPlaces(updated);
    localStorage.setItem('ryvo_saved_places', JSON.stringify(updated));
  };

  // Recent searches (stored locally per user)
  const [recentSearches, setRecentSearches] = useState<{ title: string; subtitle: string; lat: number; lon: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ryvo_recent_searches') || '[]');
    } catch {
      return [];
    }
  });

  const addRecentSearch = (item: { title: string; subtitle: string; lat: number; lon: number }) => {
    const filtered = recentSearches.filter(s => s.title.toLowerCase() !== item.title.toLowerCase());
    const updated = [item, ...filtered].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('ryvo_recent_searches', JSON.stringify(updated));
  };

  const [etaPickup, setEtaPickup] = useState<number | null>(null)
  const [distPickup, setDistPickup] = useState<string | null>(null)
  const [etaDestination, setEtaDestination] = useState<number | null>(null)
  const [distDestination, setDistDestination] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchPastRides();
    }
  }, [user]);

  // Fetch current device GPS location on demand with robust fallbacks
  const handleLocateCurrentPosition = async (forField: 'pickup' | 'destination') => {
    let coords: [number, number] = currentPosition;
    try {
      // 1. Try Capacitor Geolocation API
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
      coords = [position.coords.latitude, position.coords.longitude];
    } catch (e) {
      console.warn("Capacitor Geolocation error, trying navigator.geolocation fallback:", e);
      // 2. Try native Browser Geolocation API
      if ("geolocation" in navigator) {
        try {
          const browserPos: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
          });
          coords = [browserPos.coords.latitude, browserPos.coords.longitude];
        } catch (bErr) {
          console.warn("Browser Geolocation error, using active currentPosition state:", bErr);
        }
      }
    }

    setCurrentPosition(coords);

    let addressName = "Current Location";
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}`);
      const data = await res.json();
      if (data?.address) {
        addressName = data.address.road || data.address.suburb || data.address.neighbourhood || data.name || "Current Location";
      }
    } catch (e) {
      console.warn("Reverse geocode warning:", e);
    }

    if (forField === 'pickup') {
      setPickup(addressName);
      setPickupCoords(coords);
    } else {
      setDestination(addressName);
      setDestCoords(coords);
    }
    setActiveInput('none');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (!currentUser) {
        setRiderProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Robust fetch: If we have a user from getSession but riderProfile is still null, fetch it
  useEffect(() => {
    if (user && !riderProfile) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase.from('riders').select('*').eq('id', user.id).single();
          if (error) {
            console.error("Robust fetch error:", error);
            if (error.code === 'PGRST116') {
               console.warn("User is not a rider. Forcing logout.");
               await supabase.auth.signOut();
               setUser(null);
            }
          }
          if (data) {
            setRiderProfile(data);
            
            // Check for active ride
            const { data: rideData, error: rideError } = await supabase
               .from('rides')
               .select('*')
               .eq('riderid', user.id)
               .in('status', ['pending', 'accepted', 'arrived', 'in_transit'])
               .order('created_at', { ascending: false })
               .limit(1)
               .maybeSingle();
               
            if (rideData && !rideError) {
               setCurrentRideId(rideData.id);
               if (['accepted', 'arrived', 'in_transit'].includes(rideData.status)) {
                  setStatus(rideData.status);
                  if (rideData.otp) setOtp(rideData.otp);
               } else if (rideData.status === 'pending') {
                  setStatus('searching');
               }
            }
          }
        } catch (e: any) {
          console.error("Robust fetch exception:", e);
        }
      };
      fetchProfile();
    }
  }, [user?.id]);

  // Fetch current location on load
  useEffect(() => {
    const getLocation = async () => {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        setCurrentPosition([lat, lon])
        setPickupCoords([lat, lon])
        
        // Reverse geocode to get a readable address for Pickup
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
        const data = await res.json()
        if (data && data.address) {
           const main = data.address.road || data.address.suburb || data.address.neighbourhood || data.name || "Current Location";
           setPickup(main)
        } else {
           setPickup("Current Location")
        }
      } catch(e) {
        console.error("Error getting location", e)
      }
    }
    getLocation()
  }, [])

  // Auto-fetch route polyline line whenever pickup and destination coordinates exist & fit map bounds
  useEffect(() => {
    if (!pickupCoords || !destCoords) return;
    const fetchAutoRoute = async () => {
      try {
        const waypoints: [number, number][] = [pickupCoords];
        stops.forEach(s => { if (s.coords) waypoints.push(s.coords); });
        waypoints.push(destCoords);
        const waypointsStr = waypoints.map(c => `${c[1]},${c[0]}`).join(';');
        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypointsStr}?alternatives=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`);
        const data = await res.json();
        if (data?.routes && data.routes.length > 0) {
          const primaryRoute = data.routes.reduce((best: any, r: any) => r.distance < best.distance ? r : best, data.routes[0]);
          const swappedGeometry = primaryRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          setRouteGeometry(swappedGeometry);
          const distanceKm = primaryRoute.distance / 1000;
          setDistance(distanceKm);
          const durationMins = Math.max(1, Math.ceil(((primaryRoute.duration || 0) * 1.20) / 60));
          setEstimatedDuration(durationMins);

          // Fit map camera bounds to display BOTH pickup and destination markers clearly
          if (mapRef.current) {
            const minLng = Math.min(pickupCoords[1], destCoords[1]);
            const maxLng = Math.max(pickupCoords[1], destCoords[1]);
            const minLat = Math.min(pickupCoords[0], destCoords[0]);
            const maxLat = Math.max(pickupCoords[0], destCoords[0]);
            
            mapRef.current.fitBounds(
              [[minLng, minLat], [maxLng, maxLat]],
              { padding: { top: 100, bottom: 280, left: 60, right: 60 }, duration: 1200 }
            );
          }
        }
      } catch (e) {
        console.warn("Auto-route fetch error:", e);
      }
    };
    fetchAutoRoute();
  }, [pickupCoords, destCoords, stops]);

  // Listen for online drivers in real-time
  useEffect(() => {
    if (!user || (status !== 'idle' && status !== 'estimating')) return;
    
    const fetchDrivers = async () => {
      const { data } = await supabase.from('drivers').select('*').eq('isonline', true)
      if (data) setOnlineDrivers(data)
    }
    fetchDrivers()
    
    const channel = supabase.channel('public:drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchDrivers()
      })
      .subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [user, status])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      alert("Please enter both your email and password.")
      return
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error;
      
      if (data.user) {
        // Verify this user is actually a rider
        const { data: riderData } = await supabase
          .from('riders')
          .select('id')
          .eq('id', data.user.id)
          .single()
          
        if (!riderData) {
          await supabase.auth.signOut()
          alert("Access Denied: You do not have a Rider profile. If you are a Driver, please use a different email to register as a Rider.")
        }
      }
    } catch (error: any) {
      alert("Login Failed: " + error.message)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setIsSidebarOpen(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      alert("Please enter a valid email address (e.g. name@example.com).")
      return
    }
    if (!password || password.length < 6) {
      alert("Please enter a password that is at least 6 characters long.")
      return
    }
    if (!name || !phone) {
      alert("Please fill in your name and phone number.")
      return
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error;
      
      const uid = data.user?.id
      if (!uid) throw new Error("No UID returned")
      
      // Save rider profile
      const { error: dbError } = await supabase.from('riders').insert([{
        id: uid,
        name,
        phone,
        email
      }])
      
      if (dbError) throw dbError;
    } catch (error: any) {
      alert("Sign Up Failed: " + error.message)
    }
  }

  // Haversine straight-line distance calculation helper
  const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fetch suggestions using Mapbox Geocoding API with Nominatim fallback (Restricted to Bengaluru area like Ola/Uber/Rapido)
  const fetchSuggestions = async (query: string, setter: (s: Suggestion[]) => void) => {
    if (query.length < 2) {
      setter([])
      return
    }
    
    // Bengaluru bounding box [minLng, minLat, maxLng, maxLat]
    const bblrBbox = "77.35,12.75,77.85,13.25";
    const userLat = currentPosition[0];
    const userLng = currentPosition[1];
    
    // Check if user is near Bengaluru (~60km radius around Bengaluru center 12.9716, 77.5946)
    const distFromBblr = getHaversineDistance(userLat, userLng, 12.9716, 77.5946);
    const isUserInBengaluruArea = distFromBblr < 75; // km

    try {
      let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=in&proximity=${userLng},${userLat}&autocomplete=true&limit=7&access_token=${MAPBOX_TOKEN}`;
      
      // If user is in Bengaluru area, strictly restrict search results to Bengaluru bounding box
      if (isUserInBengaluruArea) {
        url += `&bbox=${bblrBbox}`;
      }

      const res = await fetch(url)
      const data = await res.json()
      if (data && data.features && data.features.length > 0) {
        const results = data.features.map((f: any) => {
           const title = f.text || f.place_name.split(',')[0];
           const subtitle = f.place_name;
           return {
              title: title,
              subtitle: subtitle,
              lat: f.center[1], // latitude
              lon: f.center[0]  // longitude
           }
        }).filter((s: Suggestion) => {
          if (!s.title) return false;
          // When in Bengaluru area, ensure result is within Bengaluru/Karnataka region
          if (isUserInBengaluruArea) {
            const placeLower = s.subtitle.toLowerCase();
            return placeLower.includes('bengaluru') || placeLower.includes('bangalore') || placeLower.includes('karnataka') || placeLower.includes('77.');
          }
          return true;
        })

        if (results.length > 0) {
          setter(results)
          return;
        }
      }
    } catch (e) {
      console.warn("Mapbox geocoding error, trying Nominatim fallback", e)
    }

    // Fallback: Nominatim OpenStreetMap Search API restricted to Bengaluru box & India
    try {
      const viewboxParam = isUserInBengaluruArea ? `&viewbox=77.35,13.25,77.85,12.75&bounded=1` : `&viewbox=${userLng-0.5},${userLat+0.5},${userLng+0.5},${userLat-0.5}`;
      const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}${viewboxParam}&limit=7`)
      const nomData = await nomRes.json()
      if (Array.isArray(nomData) && nomData.length > 0) {
        const results = nomData.map((item: any) => {
           const title = item.display_name.split(',')[0];
           return {
             title: title,
             subtitle: item.display_name,
             lat: parseFloat(item.lat),
             lon: parseFloat(item.lon)
           }
        });
        setter(results);
      } else {
        setter([]);
      }
    } catch (err) {
      setter([])
    }
  }

  // Helper to geocode text address using Mapbox Geocoding API
  const geocodeAddress = async (query: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${currentPosition[1]},${currentPosition[0]}&access_token=${MAPBOX_TOKEN}`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const coord = data.features[0].geometry.coordinates; // [lng, lat]
        return [coord[1], coord[0]];
      }
    } catch (e) {
      console.error("Geocoding error", e);
    }
    return null;
  };

  const handleEstimate = async () => {
    if (!pickup || !destination) {
      alert("Please enter both pickup and destination locations")
      return
    }

    setStatus('estimating')

    try {
      let pCoords = pickupCoords;
      let dCoords = destCoords;

      if (!pCoords) {
        pCoords = await geocodeAddress(pickup) || currentPosition;
        setPickupCoords(pCoords);
      }
      if (!dCoords) {
        dCoords = await geocodeAddress(destination);
        if (dCoords) setDestCoords(dCoords);
      }

      if (!pCoords || !dCoords) {
        alert("Could not find location coordinates for the entered addresses. Please select from the dropdown suggestions.");
        setStatus('idle');
        return;
      }

      // Process intermediate stops
      const validStopCoords: [number, number][] = [];
      for (const stop of stops) {
        if (stop.address) {
          let sCoords = stop.coords;
          if (!sCoords) {
            sCoords = await geocodeAddress(stop.address);
            if (sCoords) updateStop(stop.id, stop.address, sCoords);
          }
          if (sCoords) validStopCoords.push(sCoords);
        }
      }

      // Build waypoints: [Pickup, ...Stops, Destination]
      const waypoints: [number, number][] = [pCoords, ...validStopCoords, dCoords];
      const waypointsStr = waypoints.map(c => `${c[1]},${c[0]}`).join(';');

      // 1. Mapbox Driving-Traffic API for Real-Time Traffic ETAs (Matches Google Maps accurately)
      try {
        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypointsStr}?alternatives=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`)
        const data = await res.json()
        
        if (data.routes && data.routes.length > 0) {
          const primaryRoute = data.routes.reduce((best: any, r: any) => r.distance < best.distance ? r : best, data.routes[0]);
          const distanceKm = primaryRoute.distance / 1000;
          const durationMins = Math.max(1, Math.ceil(((primaryRoute.duration || 0) * 1.20) / 60));
          setEstimatedDuration(durationMins);
          setDistance(distanceKm);
          const swappedGeometry = primaryRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          setRouteGeometry(swappedGeometry);
          setStatus('confirming');
          return;
        }
      } catch (e) {
        console.warn("Mapbox Driving-Traffic API error, attempting fallback:", e);
      }

      // 2. Try Google Maps Directions API if key present
      if (GOOGLE_MAPS_KEY) {
        try {
          const gRes = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${pCoords[0]},${pCoords[1]}&destination=${dCoords[0]},${dCoords[1]}&key=${GOOGLE_MAPS_KEY}`);
          const gData = await gRes.json();
          if (gData.routes && gData.routes.length > 0) {
            const gRoute = gData.routes[0];
            const gDistKm = gRoute.legs[0].distance.value / 1000;
            const gPoints = decodePolyline(gRoute.overview_polyline.points);
            const gDurationMins = Math.max(1, Math.ceil((gRoute.legs[0].duration_in_traffic?.value || gRoute.legs[0].duration?.value || 0) / 60));
            setEstimatedDuration(gDurationMins);
            setDistance(gDistKm);
            setRouteGeometry(gPoints);
            setStatus('confirming');
            return;
          }
        } catch (e) {
          console.warn("Google Maps Directions API error, falling back to OSRM:", e);
        }
      }

      // 3. OSRM (Open Source Routing Machine) Engine fallback
      try {
        const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypointsStr}?overview=full&geometries=geojson`);
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          const osrmRoute = osrmData.routes[0];
          const osrmDistKm = osrmRoute.distance / 1000;
          const osrmDurationMins = Math.max(1, Math.ceil((osrmRoute.duration || 0) / 60));
          setEstimatedDuration(osrmDurationMins);
          setDistance(osrmDistKm);
          const swappedGeometry = osrmRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          setRouteGeometry(swappedGeometry);
          setStatus('confirming');
          return;
        }
      } catch (e) {
        console.warn("OSRM Routing error:", e);
      }

      // 4. Haversine fallback
      const haversineKm = getHaversineDistance(pCoords[0], pCoords[1], dCoords[0], dCoords[1]);
      const distanceKm = haversineKm * 1.20;
      const durationMins = Math.max(2, Math.ceil((distanceKm / 25) * 60));
      setEstimatedDuration(durationMins);
      setDistance(distanceKm);
      setRouteGeometry([[pCoords[0], pCoords[1]], [dCoords[0], dCoords[1]]]);
      setStatus('confirming');
    } catch (e) {
       alert("Routing error")
       setStatus('idle')
    }
  }
  
  const getPrice = (type: VehicleType, distKm: number) => {
    switch(type) {
      case 'bike': return Math.max(20, 20 + (distKm * 8))
      case 'auto': return Math.max(30, 30 + (distKm * 12))
      case 'mini': return Math.max(50, 50 + (distKm * 15))
      default: return 0
    }
  }

  const cancelRide = async () => {
    setStatus('idle');
    setCurrentRideId(null);
    setDriverDetails(null);
    setDriverLocation(null);
    setRouteGeometry(null);
    setTipAmount(0);
    
    if (!currentRideId) return;
    try {
      const { error } = await supabase.from('rides').update({
        status: 'cancelled'
      }).eq('id', currentRideId);
      
      if (error) console.error("Cancel update error:", error);
    } catch(e) {
      console.error("Cancel failed", e);
    }
  }

  const handleConfirmRide = async (overrideVehicle?: VehicleType) => {
    const vehicleToBook = overrideVehicle || selectedVehicle;
    if (overrideVehicle) {
      setSelectedVehicle(overrideVehicle);
    }
    setStatus('searching');
    setSearchingTimer(120);
    setNoDriverFound(false);
    setErrorMessage(null);
    console.log("Confirm Ride clicked. Booking vehicle:", vehicleToBook);
    
    try {
      const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
      setOtp(generatedOtp);

      const basePrice = getPrice(vehicleToBook, distance);
      const totalPrice = Number((basePrice + tipAmount).toFixed(2));
      const activeStops = stops.filter(s => s.address).map(s => ({
        address: s.address,
        coords: s.coords
      }));

      const rideData: any = {
        riderid: user?.id,
        pickup: pickup,
        destination: destination,
        stops: activeStops.length > 0 ? activeStops : null,
        pickuplat: pickupCoords?.[0],
        pickuplng: pickupCoords?.[1],
        destlat: destCoords?.[0],
        destlng: destCoords?.[1],
        status: 'pending',
        vehicletype: vehicleToBook,
        price: totalPrice,
        distance: distance,
        otp: generatedOtp
      };

      // Add tip property if non-zero
      if (tipAmount > 0) {
        rideData.tip = tipAmount;
      }

      let res = await supabase.from('rides').insert([rideData]).select().single();
      
      // If error occurs due to unknown 'tip' column in database schema, retry without explicit tip column
      if (res.error && res.error.message?.includes('tip')) {
        delete rideData.tip;
        res = await supabase.from('rides').insert([rideData]).select().single();
      }

      if (res.error) throw res.error;

      console.log("Successfully wrote to Supabase with ID:", res.data.id);
      setCurrentRideId(res.data.id)
    } catch (e: any) {
      console.error("Error adding document: ", e);
      setErrorMessage(e.message || "Network error: Could not reach Supabase.")
      setStatus('idle')
    }
  }

  // 2-Minute (120s) Searching Session Timeout & Vehicle Recommendation
  useEffect(() => {
    let timer: any;
    if (status === 'searching') {
      setSearchingTimer(120);
      timer = setInterval(() => {
        setSearchingTimer(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            // Session Timeout reached at 2 mins (120s) - automatically cancel current unaccepted ride
            if (currentRideId) {
              supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRideId);
            }
            // Recommend alternative vehicle
            const altVehicle: VehicleType = selectedVehicle === 'bike' ? 'auto' : selectedVehicle === 'auto' ? 'bike' : 'auto';
            setSuggestedVehicle(altVehicle);
            setNoDriverFound(true);
            setStatus('idle');
            setCurrentRideId(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setSearchingTimer(120);
    }
    return () => clearInterval(timer);
  }, [status, currentRideId, selectedVehicle]);

  useEffect(() => {
    if (!currentRideId) return;
    
    const fetchRide = async () => {
      const { data } = await supabase.from('rides').select('*').eq('id', currentRideId).single()
      if (data) updateRideState(data)
    }
    fetchRide()

    const channel = supabase.channel(`rider-ride-${currentRideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, payload => {
        if (payload.new && (payload.new as any).id === currentRideId) {
          updateRideState(payload.new)
        }
      })
      .subscribe()
      
    // Polling fallback every 2.5 seconds to guarantee instant status sync even if websocket drops
    const interval = setInterval(fetchRide, 2500);
      
    const updateRideState = (data: any) => {
      if (['accepted', 'arrived', 'in_transit', 'completed'].includes(data.status)) {
        setStatus(data.status)
      } else if (data.status === 'cancelled') {
        alert("This ride was cancelled.")
        setStatus('idle')
        setCurrentRideId(null)
        setDriverDetails(null)
        setDriverLocation(null)
        setRouteGeometry(null)
      }
      
      const did = data.driverid || data.driverId;
      if (did) {
         supabase.from('drivers').select('*').eq('id', did).single().then(res => {
            if (res.data) setDriverDetails(res.data);
         });
      }
      
      if (data.otp) {
        setOtp(data.otp)
      }
      
      if (data.driverlat && data.driverlng) {
         const dLoc: [number, number] = [data.driverlat, data.driverlng];
         setDriverLocation(dLoc);

         // Dynamically calculate ETA & distance depending on ride state
         const pLat = data.pickuplat || pickupCoords?.[0];
         const pLng = data.pickuplng || pickupCoords?.[1];
         const dLat = data.destlat || destCoords?.[0];
         const dLng = data.destlng || destCoords?.[1];

         if (['accepted', 'arrived'].includes(data.status) && pLat && pLng) {
            // Driver is moving toward Pickup
            fetch(`https://router.project-osrm.org/route/v1/driving/${dLoc[1]},${dLoc[0]};${pLng},${pLat}?overview=full&geometries=geojson`)
              .then(res => res.json())
              .then(osrmData => {
                 if (osrmData.routes && osrmData.routes.length > 0) {
                    const r = osrmData.routes[0];
                    setEtaPickup(Math.ceil(r.duration / 60)); // in minutes
                    setDistPickup((r.distance / 1000).toFixed(1)); // in km
                    const swapped = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                    setRouteGeometry(swapped);
                 }
              }).catch(e => console.warn("Live route fetch error:", e));
         } else if (data.status === 'in_transit' && dLat && dLng) {
            // Driver is moving toward Destination
            fetch(`https://router.project-osrm.org/route/v1/driving/${dLoc[1]},${dLoc[0]};${dLng},${dLat}?overview=full&geometries=geojson`)
              .then(res => res.json())
              .then(osrmData => {
                 if (osrmData.routes && osrmData.routes.length > 0) {
                    const r = osrmData.routes[0];
                    setEtaDestination(Math.ceil(r.duration / 60)); // in minutes
                    setDistDestination((r.distance / 1000).toFixed(1)); // in km
                    const swapped = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                    setRouteGeometry(swapped);
                 }
              }).catch(e => console.warn("Live route fetch error:", e));
         }
      }
    }

    return () => { 
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentRideId]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white w-full">
        <div className="p-8 max-w-md w-full bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800">
          <h1 className="text-4xl font-bold text-center mb-8">RYVO Rider</h1>
          <div className="flex bg-zinc-800 rounded-xl p-1 mb-6">
            <button onClick={() => setIsSignupMode(false)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${!isSignupMode ? 'bg-white text-black' : 'text-zinc-400'}`}>Login</button>
            <button onClick={() => setIsSignupMode(true)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${isSignupMode ? 'bg-white text-black' : 'text-zinc-400'}`}>Sign Up</button>
          </div>

          {!isSignupMode ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <button type="submit" className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 mt-2">Login</button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 mt-2">Create Rider Account</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: currentPosition[1], latitude: currentPosition[0], zoom: 15 }}
          style={{ height: '100%', width: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          onMove={(e: any) => {
            if (isSelectingOnMap) {
              setMapCenterCoords([e.viewState.latitude, e.viewState.longitude]);
            }
          }}
          onMoveEnd={(e: any) => {
            if (isSelectingOnMap) {
              reverseGeocode(e.viewState.latitude, e.viewState.longitude);
            }
          }}
        >
          
          {/* Current GPS Location Marker */}
          <Marker longitude={currentPosition[1]} latitude={currentPosition[0]}>
            <CurrentLocationMarker />
          </Marker>

          {/* Pickup Location Pin */}
          {pickupCoords && (
            <Marker longitude={pickupCoords[1]} latitude={pickupCoords[0]} anchor="bottom">
              <PickupMarker 
                name={pickup} 
                onClick={() => startMapSelection('pickup')} 
              />
            </Marker>
          )}

          {/* Destination Location Pin */}
          {destCoords && (
            <Marker longitude={destCoords[1]} latitude={destCoords[0]} anchor="bottom">
              <DestinationMarker 
                name={destination} 
                onClick={() => startMapSelection('destination')} 
              />
            </Marker>
          )}

          {/* Intermediate Stop Location Pins */}
          {stops.map((stop, idx) => (
            stop.coords ? (
              <Marker key={stop.id} longitude={stop.coords[1]} latitude={stop.coords[0]} anchor="bottom">
                <StopMarker 
                  index={idx} 
                  name={stop.address} 
                  onClick={() => startMapSelection(stop.id)} 
                />
              </Marker>
            ) : null
          ))}

          {/* Route Polyline */}
          {routeGeometry && (
            <Source id="route" type="geojson" data={{ type: 'LineString', coordinates: routeGeometry.map(coord => [coord[1], coord[0]]) }}>
              <Layer id="route" type="line" paint={{ 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.85 }} />
            </Source>
          )}

          {/* Show Online Drivers ONLY during confirming state, filtered by selected vehicle type */}
          {(status === 'confirming' || status === 'searching') && onlineDrivers
            .filter(driver => {
              const dType = (driver.vehicletype || driver.vehicleType || 'mini').toLowerCase();
              return dType === selectedVehicle.toLowerCase();
            })
            .map(driver => (
              <Marker
                key={driver.id}
                longitude={driver.lng}
                latitude={driver.lat}
              >
                <VehicleMarker type={driver.vehicletype || driver.vehicleType || selectedVehicle} />
              </Marker>
            ))}

          {/* Assigned Driver Live Location Marker */}
          {driverLocation && (
            <Marker
              longitude={driverLocation[1]}
              latitude={driverLocation[0]}
            >
              <LiveDriverMarker type={driverDetails?.vehicletype || selectedVehicle} />
            </Marker>
          )}
        </Map>
      </div>

      {/* Top Bar with Hamburger */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-between items-center max-w-md mx-auto mt-2 pointer-events-auto">
          <div className="flex items-center space-x-3">
             <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-zinc-900/90 backdrop-blur rounded-full shadow-lg border border-zinc-800 text-white hover:bg-zinc-800 transition">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
             </button>
          </div>
        </div>
      </div>

      {!isSelectingOnMap && (
        <div className={`absolute left-0 right-0 z-20 p-4 transition-all duration-300 ease-in-out pointer-events-none ${
          activeInput !== 'none'
            ? 'top-1/2 -translate-y-1/2'
            : 'bottom-0 pb-8 bg-gradient-to-t from-black/90 to-transparent'
        }`}>
        <div className={`bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto relative pointer-events-auto transition-all duration-300 ease-in-out ${
          activeInput !== 'none' ? 'overflow-visible ring-2 ring-emerald-500/40 shadow-emerald-950/40' : 'max-h-[80vh] overflow-y-auto'
        }`}>
          <div className="flex justify-between items-center mb-1">
             <div className="flex items-center space-x-2">
               <h1 className="text-3xl font-bold tracking-tight text-white">RYVO</h1>
               {pickup && destination && (
                 <button
                   onClick={() => setIsSheetMinimized(!isSheetMinimized)}
                   className="text-[11px] font-extrabold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 px-2.5 py-1 rounded-full border border-zinc-700 flex items-center space-x-1 transition"
                   title="Toggle card size"
                 >
                   <span>{isSheetMinimized ? 'Expand 🗖' : 'Minimize 🗕'}</span>
                 </button>
               )}
             </div>
             {activeInput !== 'none' && (
                <button 
                  onClick={() => setActiveInput('none')}
                  className="bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-bold border border-zinc-700 transition hover:bg-zinc-700"
                >
                  Done ✕
                </button>
             )}
          </div>
          
          {['accepted', 'arrived', 'in_transit', 'completed'].includes(status) ? (
             <div className="py-2">
               <div className="flex items-center justify-between bg-zinc-800 p-4 rounded-2xl mb-4 border border-zinc-700">
                  <div className="flex items-center space-x-4">
                     <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-xl font-bold border-2 border-blue-400 overflow-hidden relative shrink-0">
                        {driverDetails?.documents?.driverPhotoUrl && (
                           <img 
                             src={driverDetails.documents.driverPhotoUrl} 
                             className="w-full h-full object-cover relative z-10" 
                             alt="Driver" 
                             onError={(e) => { e.currentTarget.style.display = 'none'; }}
                           />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center z-0">
                           {driverDetails?.name?.charAt(0) || 'D'}
                        </span>
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-white">{driverDetails?.name || 'Driver'}</h2>
                        <p className="text-zinc-400 text-sm font-medium">{(driverDetails as any)?.rating || '5.0'} ★</p>
                     </div>
                  </div>
                  <div className="text-right">
                     <p className="bg-zinc-900 border border-zinc-600 px-3 py-1 rounded-md font-mono font-bold text-white tracking-widest text-lg shadow-sm">
                        {driverDetails?.vehiclenumber || 'XX00XX'}
                     </p>
                     <p className="text-zinc-400 text-xs mt-1 font-bold uppercase">
                        {driverDetails?.vehiclecolor || ''} {driverDetails?.vehiclemodel || ''} {selectedVehicle}
                     </p>
                     {driverDetails?.phone && (
                        <a href={`tel:${driverDetails.phone}`} className="inline-block mt-2 text-sm font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded hover:bg-green-500/20">
                          📞 {driverDetails.phone}
                        </a>
                     )}
                  </div>
               </div>
               
               <div className={`border p-4 rounded-xl text-center ${
                 status === 'accepted' ? 'bg-green-600/20 border-green-500/50 text-green-400' :
                 status === 'arrived' ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' :
                 status === 'in_transit' ? 'bg-purple-600/20 border-purple-500/50 text-purple-400' :
                 'bg-zinc-800 border-zinc-700 text-white'
               }`}>
                  <h3 className="font-bold mb-1">
                    {status === 'accepted' && 'Driver is on the way to Pickup!'}
                    {status === 'arrived' && 'Driver has arrived at Pickup!'}
                    {status === 'in_transit' && 'Heading to Destination...'}
                    {status === 'completed' && 'Ride Completed!'}
                  </h3>

                  {/* Dynamic Live ETA & Distance Badges */}
                  {['accepted', 'arrived'].includes(status) && (distPickup || etaPickup !== null) && (
                    <div className="flex items-center justify-center space-x-3 my-2 bg-black/40 py-1.5 px-3 rounded-lg border border-green-500/30 text-xs">
                       <span className="font-bold text-green-300">📍 Pickup Distance: {distPickup || '--'} km</span>
                       <span className="text-zinc-500">|</span>
                       <span className="font-bold text-emerald-400">⏱️ ETA: {etaPickup !== null ? `${etaPickup} min` : 'Arriving'}</span>
                    </div>
                  )}

                  {status === 'in_transit' && (distDestination || etaDestination !== null) && (
                    <div className="flex items-center justify-center space-x-3 my-2 bg-black/40 py-1.5 px-3 rounded-lg border border-purple-500/30 text-xs">
                       <span className="font-bold text-purple-300">🏁 Destination Distance: {distDestination || '--'} km</span>
                       <span className="text-zinc-500">|</span>
                       <span className="font-bold text-pink-400">⏱️ ETA: {etaDestination !== null ? `${etaDestination} min` : 'Arriving'}</span>
                    </div>
                  )}

                  <p className="opacity-80 text-sm">
                    {status === 'accepted' && 'Please meet your driver at the pickup location.'}
                    {status === 'arrived' && 'Please meet your driver outside.'}
                    {status === 'in_transit' && 'Sit back and relax.'}
                    {status === 'completed' && 'Thank you for riding with RYVO!'}
                  </p>
                  
                  {(status === 'accepted' || status === 'arrived') && otp && (
                    <div className="mt-4 bg-zinc-900/50 p-3 rounded-lg border border-zinc-700/50 inline-block">
                       <p className="text-zinc-400 text-xs uppercase font-bold tracking-widest mb-1">Ride OTP</p>
                       <p className="text-white text-3xl font-black tracking-[0.2em]">{otp}</p>
                    </div>
                  )}

                  {['accepted', 'arrived', 'in_transit'].includes(status) && (
                    <button 
                      onClick={cancelRide}
                      className="w-full mt-4 bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 font-bold py-3 rounded-xl transition"
                    >
                      Cancel Ride
                    </button>
                  )}
                  
                  {status === 'completed' && !hasRated && (
                    <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-2">Rate your driver</h4>
                      <div className="flex justify-center space-x-2 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button 
                            key={star} 
                            onClick={() => setRating(star)}
                            className={`text-3xl transition-transform hover:scale-110 ${rating >= star ? 'text-yellow-400' : 'text-zinc-600'}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      {rating > 0 && (
                        <div className="space-y-3 animate-slide-in">
                          <textarea 
                            value={review}
                            onChange={(e) => setReview(e.target.value)}
                            placeholder="Leave a compliment (optional)" 
                            className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-20"
                          />
                          <button 
                            onClick={async () => {
                              if (currentRideId) {
                                await supabase.from('rides').update({
                                  rating,
                                  review,
                                }).eq('id', currentRideId)
                              }
                              setHasRated(true)
                            }}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-500"
                          >
                            Submit Rating
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {status === 'completed' && hasRated && (
                    <div className="mt-4 bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl mb-4">
                      <p className="font-bold">Thank you for your feedback!</p>
                    </div>
                  )}
                  
                  {status === 'completed' && (
                    <button onClick={() => { 
                      setStatus('idle'); 
                      setCurrentRideId(null); 
                      setRouteGeometry(null);
                      setRating(0);
                      setReview('');
                      setHasRated(false);
                      setTipAmount(0);
                                }} className="mt-4 w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200">
                       Request Another Ride
                     </button>
                   )}
                </div>
              </div>
           ) : status === 'searching' ? (
              <div className="py-2 space-y-3">
                 {/* 🚕 Authentic Native Searching Card (Uber / Ola / Rapido Standard) */}
                 <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800 shadow-2xl text-left space-y-4">
                   
                   {/* Top Header Row with Pulsing Signal Pill */}
                   <div className="flex items-center justify-between">
                     <div className="flex items-center space-x-2">
                       <span className="relative flex h-3 w-3">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                       </span>
                       <span className="text-xs font-black text-white uppercase tracking-wider">Contacting Nearby Drivers</span>
                     </div>
                     <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                       {Math.floor(searchingTimer / 60)}:{String(searchingTimer % 60).padStart(2, '0')}
                     </span>
                   </div>

                   {/* Radar Pulse Animation & Vehicle Avatar */}
                   <div className="relative py-4 flex items-center justify-center">
                     {/* Sonar Radar Rings */}
                     <div className="absolute w-24 h-24 rounded-full border border-amber-500/30 animate-ping"></div>
                     <div className="absolute w-16 h-16 rounded-full border border-amber-500/50 animate-pulse"></div>
                     
                     {/* Vehicle Icon Center Badge */}
                     <div className="relative z-10 w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(245,158,11,0.4)] text-black">
                       {selectedVehicle === 'bike' ? '🛵' : selectedVehicle === 'auto' ? '🛺' : '🚗'}
                     </div>
                   </div>

                   {/* Subtitle Message */}
                   <p className="text-xs text-zinc-300 text-center font-semibold animate-pulse">
                     {searchingTimer > 90 ? 'Broadcasting request to nearby drivers...' :
                      searchingTimer > 60 ? 'Connecting with top-rated drivers in your area...' :
                      'Expanding search area for quick pickup...'}
                   </p>

                   {/* Indeterminate Shimmer Progress Bar */}
                   <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                     <div className="w-full h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-amber-500 animate-pulse rounded-full"></div>
                   </div>

                   {/* Trip Information Capsule */}
                   <div className="pt-2 border-t border-zinc-800 space-y-2.5">
                     <div className="flex items-center justify-between">
                       <div>
                         <h4 className="text-sm font-black text-white">RYVO {selectedVehicle.toUpperCase()}</h4>
                         {tipAmount > 0 && (
                           <span className="text-[10px] font-extrabold text-emerald-400">Base ₹{getPrice(selectedVehicle, distance).toFixed(2)} + ₹{tipAmount} Tip</span>
                         )}
                       </div>
                       <div className="text-right">
                         <span className="text-lg font-black text-emerald-400 block">₹{(getPrice(selectedVehicle, distance) + tipAmount).toFixed(2)}</span>
                         <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md inline-block">💵 Cash / UPI</span>
                       </div>
                     </div>

                     {/* Pickup & Destination Timeline Summary */}
                     <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-850 space-y-1.5">
                       <div className="flex items-center space-x-2.5 truncate">
                         <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                         <span className="text-[11px] font-bold text-zinc-300 truncate">{pickup}</span>
                       </div>
                       <div className="flex items-center space-x-2.5 truncate">
                         <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                         <span className="text-[11px] font-bold text-zinc-300 truncate">{destination}</span>
                       </div>
                     </div>
                   </div>
                 </div>

                {/* 1. Tips Feature Box (Shown ONLY after 30 seconds of searching, i.e., searchingTimer <= 90) */}
                {searchingTimer <= 90 && (
                  <div className="mb-4 bg-zinc-800/90 p-3.5 rounded-2xl border border-zinc-700/80 text-left animate-slide-in space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                        <span className="text-amber-400 font-extrabold">⚡</span> Add tip to speed up response
                      </span>
                      {tipAmount > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-md border border-emerald-500/30">
                            +₹{tipAmount} Tip
                          </span>
                          <span className="text-[11px] font-extrabold text-white bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-700">
                            Total: ₹{(getPrice(selectedVehicle, distance) + tipAmount).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-900 px-2 py-0.5 rounded border border-zinc-750">
                          Optional
                        </span>
                      )}
                    </div>

                    {/* Quick Preset Pills + Custom Option */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {[0, 10, 20, 30, 50].map((amount) => (
                        <button
                          key={amount}
                          onClick={async () => {
                            setTipAmount(amount);
                            setIsCustomTipOpen(false);
                            setCustomTipInput('');
                            if (currentRideId) {
                              const basePrice = getPrice(selectedVehicle, distance);
                              const newTotal = Number((basePrice + amount).toFixed(2));
                              let { error } = await supabase.from('rides').update({ price: newTotal, tip: amount }).eq('id', currentRideId);
                              if (error && error.message?.includes('tip')) {
                                await supabase.from('rides').update({ price: newTotal }).eq('id', currentRideId);
                              }
                              if (amount > 0) {
                                showToast(`🚀 Sending new request (+₹${amount} tip) to nearby drivers!`);
                              } else {
                                showToast(`Request updated to standard fare ₹${newTotal}.`);
                              }
                            }
                          }}
                          className={`py-2 px-1 text-xs font-black rounded-xl border transition-all ${
                            tipAmount === amount && !isCustomTipOpen
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black border-emerald-400 shadow-md scale-105 font-extrabold'
                              : 'bg-zinc-900 text-zinc-300 border-zinc-750 hover:border-zinc-500'
                          }`}
                        >
                          {amount === 0 ? 'No Tip' : `+₹${amount}`}
                        </button>
                      ))}

                      {/* Custom Tip Button */}
                      <button
                        onClick={() => {
                          setIsCustomTipOpen(!isCustomTipOpen);
                        }}
                        className={`py-2 px-1 text-xs font-black rounded-xl border transition-all ${
                          isCustomTipOpen
                            ? 'bg-amber-400 text-black border-amber-300 shadow-md font-extrabold'
                            : 'bg-zinc-900 text-amber-400 border-amber-500/30 hover:border-amber-400'
                        }`}
                      >
                        Custom
                      </button>
                    </div>

                    {/* Custom Tip Input Row */}
                    {isCustomTipOpen && (
                      <div className="flex items-center gap-2 pt-1 animate-fadeIn">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-xs">₹</span>
                          <input
                            type="number"
                            min="1"
                            max="500"
                            placeholder="Enter amount (e.g. 75)"
                            value={customTipInput}
                            onChange={(e) => setCustomTipInput(e.target.value)}
                            className="w-full bg-zinc-950 text-white font-bold text-xs pl-7 pr-3 py-2.5 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                        <button
                          onClick={async () => {
                            const val = parseInt(customTipInput, 10);
                            if (!isNaN(val) && val > 0) {
                              setTipAmount(val);
                              if (currentRideId) {
                                const basePrice = getPrice(selectedVehicle, distance);
                                const newTotal = Number((basePrice + val).toFixed(2));
                                let { error } = await supabase.from('rides').update({ price: newTotal, tip: val }).eq('id', currentRideId);
                                if (error && error.message?.includes('tip')) {
                                  await supabase.from('rides').update({ price: newTotal }).eq('id', currentRideId);
                                }
                                showToast(`🚀 Sending new request (+₹${val} tip) to nearby drivers!`);
                              }
                            }
                          }}
                          className="bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition shadow-md"
                        >
                          Send
                        </button>
                      </div>
                    )}

                    {/* Separate Action Bar Button: Broadcast Tip Request to Drivers */}
                    <button
                      onClick={async () => {
                        if (currentRideId) {
                          const basePrice = getPrice(selectedVehicle, distance);
                          const newTotal = Number((basePrice + tipAmount).toFixed(2));
                          let { error } = await supabase.from('rides').update({ price: newTotal, tip: tipAmount }).eq('id', currentRideId);
                          if (error && error.message?.includes('tip')) {
                            await supabase.from('rides').update({ price: newTotal }).eq('id', currentRideId);
                          }
                          if (tipAmount > 0) {
                            showToast(`🚀 Sending new request (+₹${tipAmount} tip) to nearby drivers!`);
                          } else {
                            showToast(`Broadcasting request with standard fare ₹${newTotal}.`);
                          }
                        }
                      }}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition active:scale-[0.99] border border-emerald-400/40 mt-2"
                    >
                      <span>⚡ Send Request to Drivers</span>
                    </button>
                  </div>
                )}

                {/* 2. Suggest Other Vehicle Mode Box (Shown ONLY after 1 minute of searching, i.e., searchingTimer <= 60) */}
                {searchingTimer <= 60 && (
                  <div className="mb-4 bg-amber-500/10 p-3.5 rounded-2xl border border-amber-500/30 text-left animate-slide-in">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                        💡 High Demand! Suggesting Other Mode
                      </span>
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                        Faster Pickup
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mb-3 font-medium">
                      Drivers are busy. Switch to {selectedVehicle === 'bike' ? 'AUTO (🛺)' : selectedVehicle === 'auto' ? 'CAB (🚗)' : 'AUTO (🛺)'} for instant dispatch!
                    </p>
                    <button
                      onClick={() => {
                        const alt: VehicleType = selectedVehicle === 'bike' ? 'auto' : selectedVehicle === 'auto' ? 'mini' : 'auto';
                        handleConfirmRide(alt);
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center space-x-2"
                    >
                      <span>Switch to {selectedVehicle === 'bike' ? 'RYVO Auto 🛺' : selectedVehicle === 'auto' ? 'RYVO Cab 🚗' : 'RYVO Auto 🛺'} ➔</span>
                    </button>
                  </div>
                )}

                <button 
                  onClick={cancelRide}
                  className="w-full bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 font-bold py-3.5 rounded-xl transition"
                >
                  Cancel Request
                </button>
             </div>
          ) : status === 'confirming' ? (
            isSheetMinimized ? (
              <div className="py-2 space-y-3">
                <div 
                  onClick={() => setIsSheetMinimized(false)}
                  className="bg-zinc-800/80 hover:bg-zinc-800 p-3.5 rounded-2xl border border-zinc-700/80 cursor-pointer space-y-2 transition shadow-md"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0"></span>
                    <span className="text-xs font-bold text-white truncate">{pickup}</span>
                  </div>
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20 shrink-0"></span>
                    <span className="text-xs font-bold text-white truncate">{destination}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-zinc-800 p-3.5 rounded-2xl border border-zinc-700">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{selectedVehicle === 'bike' ? '🛵' : selectedVehicle === 'auto' ? '🛺' : '🚗'}</span>
                    <div>
                      <h4 className="font-bold text-white text-sm">RYVO {selectedVehicle.toUpperCase()}</h4>
                      <p className="text-[11px] text-zinc-400">⏱️ {getETAForVehicle(selectedVehicle, estimatedDuration)} min • {distance.toFixed(1)} km</p>
                    </div>
                  </div>
                  <span className="font-extrabold text-xl text-emerald-400">₹{getPrice(selectedVehicle, distance).toFixed(2)}</span>
                </div>

                <div className="flex space-x-2">
                  <button 
                    onClick={() => setIsSheetMinimized(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold px-4 py-3.5 rounded-xl border border-zinc-700 text-xs transition"
                  >
                    Change 🗖
                  </button>
                  <button 
                    onClick={() => handleConfirmRide()}
                    className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold py-3.5 rounded-xl text-sm transition shadow-lg"
                  >
                    Confirm {selectedVehicle.toUpperCase()} (Cash)
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-2">
                 <div className="flex justify-between items-center mb-3">
                   <p className="text-zinc-400 text-sm font-medium">Select a ride</p>
                   <span className="bg-zinc-800 text-zinc-200 text-xs font-bold px-3 py-1 rounded-full border border-zinc-700">
                     📍 {distance > 0 ? `${distance.toFixed(1)} km` : ''} {estimatedDuration > 0 ? `• ⏱️ ${estimatedDuration} min traffic` : ''}
                   </span>
                 </div>
                 
                 <div className="space-y-3 mb-6">
                   {/* Bike */}
                   <div 
                     onClick={() => setSelectedVehicle('bike')}
                     className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'bike' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                   >
                      <div className="flex items-center space-x-3">
                         <div className="text-2xl">🛵</div>
                         <div>
                           <h3 className="font-bold text-white">RYVO Bike</h3>
                           <p className="text-xs text-zinc-400">Beat the traffic • <span className="text-emerald-400 font-bold">⏱️ {getETAForVehicle('bike', estimatedDuration)} min</span></p>
                         </div>
                      </div>
                      <span className="font-bold text-xl">₹{getPrice('bike', distance).toFixed(2)}</span>
                   </div>

                   {/* Auto */}
                   <div 
                     onClick={() => setSelectedVehicle('auto')}
                     className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'auto' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                   >
                      <div className="flex items-center space-x-3">
                         <div className="text-2xl">🛺</div>
                         <div>
                           <h3 className="font-bold text-white">RYVO Auto</h3>
                           <p className="text-xs text-zinc-400">Affordable rides • <span className="text-emerald-400 font-bold">⏱️ {getETAForVehicle('auto', estimatedDuration)} min</span></p>
                         </div>
                      </div>
                      <span className="font-bold text-xl">₹{getPrice('auto', distance).toFixed(2)}</span>
                   </div>

                   {/* Mini */}
                   <div 
                     onClick={() => setSelectedVehicle('mini')}
                     className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'mini' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                   >
                      <div className="flex items-center space-x-3">
                         <div className="text-2xl">🚗</div>
                         <div>
                           <h3 className="font-bold text-white">RYVO Mini</h3>
                           <p className="text-xs text-zinc-400">Comfortable AC rides • <span className="text-emerald-400 font-bold">⏱️ {getETAForVehicle('mini', estimatedDuration)} min</span></p>
                         </div>
                      </div>
                      <span className="font-bold text-xl">₹{getPrice('mini', distance).toFixed(2)}</span>
                   </div>
                 </div>

                 <button 
                    onClick={() => handleConfirmRide()}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg"
                  >
                    Confirm {selectedVehicle.toUpperCase()} (Cash)
                  </button>
                  <button 
                    onClick={() => { setStatus('idle'); setRouteGeometry(null) }}
                    className="w-full bg-transparent text-zinc-400 font-bold py-4 rounded-xl hover:text-white transition-colors mt-2"
                  >
                    Cancel
                  </button>
              </div>
            )
          ) : (
            isSheetMinimized ? (
              <div className="py-1 space-y-3">
                <div 
                  onClick={() => setIsSheetMinimized(false)}
                  className="bg-zinc-800/80 hover:bg-zinc-800 p-3.5 rounded-2xl border border-zinc-700/80 cursor-pointer space-y-2.5 transition shadow-md"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0"></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Pickup Location</p>
                      <p className="text-sm font-bold text-white truncate">{pickup || 'Enter pickup location'}</p>
                    </div>
                  </div>

                  {stops.length > 0 && (
                    <div className="flex items-center space-x-3 pl-0.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20 shrink-0"></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-amber-400">{stops.length} Stop{stops.length > 1 ? 's' : ''} added</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20 shrink-0"></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">Drop Location</p>
                      <p className="text-sm font-bold text-white truncate">{destination || 'Where to?'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsSheetMinimized(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-3 rounded-xl border border-zinc-700 text-sm flex items-center justify-center space-x-2 transition"
                  >
                    <span>✏️ Edit Locations</span>
                  </button>
                  <button
                    onClick={handleEstimate}
                    disabled={status === 'estimating' || !pickup || !destination}
                    className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold py-3 rounded-xl text-sm transition shadow-lg disabled:opacity-50"
                  >
                    {status === 'estimating' ? 'Calculating...' : 'See Prices ➔'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-4 text-red-500 text-sm font-bold">
                    {errorMessage}
                  </div>
                )}
                <p className="text-zinc-400 text-sm mb-6 font-medium">Where to?</p>
              <div className="space-y-4 relative">
                
                {/* Pickup Field */}
                <div className={`relative ${activeInput === 'pickup' ? 'z-30' : 'z-10'}`}>
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20"></div>
                  </div>
                  <input 
                    type="text" 
                    value={pickup}
                    onFocus={() => setActiveInput('pickup')}
                    onChange={(e) => {
                      setPickup(e.target.value); 
                      fetchSuggestions(e.target.value, setPickupSuggestions)
                    }}
                    placeholder="Enter pickup location" 
                    className="w-full bg-zinc-800/90 text-white placeholder-zinc-500 rounded-2xl pl-10 pr-12 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-zinc-700/50 transition-all font-medium text-base shadow-inner"
                  />


                  {/* Options Dropdown Box for Pickup */}
                  {activeInput === 'pickup' && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-zinc-950/98 backdrop-blur-2xl border-2 border-zinc-700/80 mt-2 rounded-2xl shadow-2xl overflow-y-auto max-h-64 divide-y divide-zinc-900 animate-slide-in ring-1 ring-black/50">
                      {/* Quick Actions & Favorites & Recent Searches (Shown ONLY when input is empty) */}
                      {!pickup.trim() && (
                        <>
                          {/* Compact Quick Actions: Choose on Map & Current GPS */}
                          <div className="p-2 grid grid-cols-2 gap-2 bg-zinc-900/60 border-b border-zinc-900">
                            <button
                              type="button"
                              onClick={() => startMapSelection('pickup')}
                              className="flex items-center space-x-2 p-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition text-left group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-sm shrink-0">
                                📌
                              </div>
                              <div className="overflow-hidden min-w-0">
                                <p className="text-cyan-400 font-extrabold text-xs truncate">Choose on Map</p>
                                <p className="text-zinc-400 text-[10px] truncate">Set map pin</p>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLocateCurrentPosition('pickup')}
                              className="flex items-center space-x-2 p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition text-left group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-sm shrink-0">
                                📍
                              </div>
                              <div className="overflow-hidden min-w-0">
                                <p className="text-emerald-400 font-extrabold text-xs truncate">Current GPS</p>
                                <p className="text-zinc-400 text-[10px] truncate">Use my position</p>
                              </div>
                            </button>
                          </div>

                          {/* Recent Searches */}
                          {recentSearches.length > 0 && (
                            <div className="p-3 bg-zinc-900/90 border-b border-zinc-800">
                              <p className="text-[11px] uppercase font-black text-zinc-400 px-1 mb-2 tracking-wider">Recent Searches</p>
                              <div className="space-y-1.5">
                                {recentSearches.map((rs, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      setPickup(rs.title);
                                      setPickupCoords([rs.lat, rs.lon]);
                                      setCurrentPosition([rs.lat, rs.lon]);
                                      setActiveInput('none');
                                    }}
                                    className="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl cursor-pointer transition"
                                  >
                                    <div className="text-sm p-1.5 bg-zinc-800 rounded-lg text-zinc-400">🕒</div>
                                    <div className="overflow-hidden">
                                      <p className="text-white text-xs font-bold truncate">{rs.title}</p>
                                      <p className="text-zinc-400 text-[10px] truncate">{rs.subtitle}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Favorites List at Bottom (Home, Work, Custom) */}
                          {savedPlaces.length > 0 && (
                            <div className="bg-zinc-950 divide-y divide-zinc-900 border-t border-zinc-900">
                              <p className="text-[11px] uppercase font-black text-amber-400/90 px-4 py-2 bg-amber-950/20 tracking-wider">Saved Favorites</p>
                              {savedPlaces.map((sp, idx) => (
                                 <div 
                                   key={idx}
                                   onClick={() => {
                                     setPickup(sp.address);
                                     setPickupCoords(sp.coords);
                                     setCurrentPosition(sp.coords);
                                     setActiveInput('none');
                                   }}
                                   className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900 cursor-pointer transition group"
                                 >
                                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                                       <div className="flex items-center justify-center shrink-0 w-7 h-7 bg-zinc-900 rounded-full text-base border border-zinc-800">
                                          {sp.icon}
                                       </div>
                                       <div className="overflow-hidden">
                                          <p className="text-white text-xs font-bold truncate group-hover:text-emerald-400 transition-colors">{sp.label}</p>
                                          <p className="text-zinc-400 text-[10px] truncate">{sp.address}</p>
                                       </div>
                                    </div>
                                    <span className="text-zinc-600 text-[10px] shrink-0 font-medium">Favorites</span>
                                 </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Live Search Suggestions (Shown ONLY when typing search query) */}
                      {pickup.trim().length >= 2 && (
                        <div className="bg-zinc-900 divide-y divide-zinc-800">
                          <p className="text-[11px] uppercase font-black text-emerald-400 px-4 py-2 bg-emerald-950/30 tracking-wider">Search Results</p>
                          {pickupSuggestions.length > 0 ? (
                            pickupSuggestions.map((s, i) => (
                              <div 
                                key={i} 
                                className="px-5 py-3.5 hover:bg-zinc-800 cursor-pointer flex items-center space-x-3 transition-colors"
                                onClick={() => { 
                                  const fullAddr = s.subtitle ? (s.subtitle.startsWith(s.title) ? s.subtitle : `${s.title}, ${s.subtitle}`) : s.title;
                                  setPickup(fullAddr); 
                                  setPickupCoords([s.lat, s.lon]);
                                  setCurrentPosition([s.lat, s.lon]);
                                  addRecentSearch(s);
                                  setPickupSuggestions([]); 
                                  setActiveInput('none');
                                }}
                              >
                                <div className="flex-shrink-0 bg-emerald-500/20 text-emerald-400 p-2 rounded-full">📍</div>
                                <div className="overflow-hidden">
                                  <p className="text-white font-bold truncate text-sm">{s.title}</p>
                                  <p className="text-zinc-400 text-xs truncate">{s.subtitle}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-xs text-zinc-500 font-medium">Searching location...</div>
                          )}
                        </div>
                      )}

                      {/* Vertical Recent Pickups List (Shown ONLY when input is empty) */}
                      {!pickup.trim() && pastRides.length > 0 && (() => {
                        const uniquePickups = Array.from(new Set(pastRides.map(r => r.pickup).filter(Boolean))).slice(0, 5);
                        if (uniquePickups.length === 0) return null;
                        return (
                          <div className="bg-zinc-950 divide-y divide-zinc-900 border-t border-zinc-800">
                            {uniquePickups.map((pName, idx) => {
                               const sampleRide = pastRides.find(r => r.pickup === pName);
                               const distStr = sampleRide?.distance ? `${sampleRide.distance.toFixed(1)} km` : '';
                               return (
                                 <div 
                                   key={idx}
                                   onClick={() => {
                                     setPickup(pName);
                                     if (sampleRide?.pickuplat && sampleRide?.pickuplng) {
                                       setPickupCoords([sampleRide.pickuplat, sampleRide.pickuplng]);
                                       setCurrentPosition([sampleRide.pickuplat, sampleRide.pickuplng]);
                                     }
                                     setActiveInput('none');
                                   }}
                                   className="flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 cursor-pointer transition group"
                                 >
                                    <div className="flex items-center space-x-3.5 min-w-0 pr-2">
                                       <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-400 text-base group-hover:bg-zinc-800 group-hover:border-zinc-700 transition-colors">
                                          🕒
                                       </div>
                                       <div className="overflow-hidden min-w-0">
                                          <p className="text-white text-sm font-bold truncate group-hover:text-emerald-400 transition-colors">{pName}</p>
                                          <p className="text-zinc-500 text-xs truncate flex items-center gap-1.5 mt-0.5">
                                             {distStr && <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">{distStr}</span>}
                                             <span className="truncate">Bengaluru, Karnataka, India</span>
                                          </p>
                                       </div>
                                    </div>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (sampleRide?.pickuplat && sampleRide?.pickuplng) {
                                          triggerSaveModal(pName, [sampleRide.pickuplat, sampleRide.pickuplng], 'Home', '🏠');
                                        }
                                      }}
                                      title="Save to favorites (Home / Work / Custom)"
                                      className="text-zinc-500 hover:text-red-500 p-2 transition shrink-0 hover:scale-125"
                                    >
                                      🤍
                                    </button>
                                 </div>
                               );
                            })}
                          </div>
                        );
                      })()}

                      <div className="p-2 text-center bg-zinc-950">
                         <button onClick={() => setActiveInput('none')} className="text-xs text-zinc-500 font-bold hover:text-white">Close Dropdown ✕</button>
                      </div>
                    </div>
                  )}
                </div>
                
                

                {/* Intermediate Stops */}
                {stops.map((stop, index) => (
                  <div key={stop.id} className="relative z-20">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                       <div className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/20"></div>
                    </div>
                    <input 
                      type="text" 
                      value={stop.address}
                      onFocus={() => setActiveInput(stop.id)}
                      onChange={(e) => {
                        updateStop(stop.id, e.target.value, null);
                        fetchSuggestions(e.target.value, (suggs) => {
                          setStopSuggestionsMap(prev => ({ ...prev, [stop.id]: suggs }));
                        });
                      }}
                      placeholder={`Stop ${index + 1} location`} 
                      className="w-full bg-zinc-800/90 text-white placeholder-zinc-500 rounded-2xl pl-10 pr-20 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500 border border-zinc-700/50 transition-all font-medium text-sm shadow-inner"
                    />
                    <div className="absolute right-2 top-2.5 flex items-center space-x-1">
                      <button 
                        type="button"
                        onClick={() => startMapSelection(stop.id)}
                        title="Set stop on map"
                        className="p-1.5 text-zinc-400 hover:text-cyan-400 transition"
                      >
                        📌
                      </button>
                      <button 
                        type="button"
                        onClick={() => removeStop(stop.id)}
                        title="Remove stop"
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Options Dropdown Box for Intermediate Stop */}
                    {activeInput === stop.id && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-zinc-950/98 backdrop-blur-2xl border-2 border-zinc-700/80 mt-2 rounded-2xl shadow-2xl overflow-y-auto max-h-64 divide-y divide-zinc-900 animate-slide-in ring-1 ring-black/50">
                        {/* Set on Map */}
                        <div 
                          onClick={() => startMapSelection(stop.id)}
                          className="px-4 py-3.5 hover:bg-zinc-900 cursor-pointer flex items-center space-x-3 text-cyan-400 font-bold transition-colors bg-cyan-500/10 border-b border-zinc-900"
                        >
                           <div className="p-2 bg-cyan-500/20 rounded-full">
                             📌
                           </div>
                           <div>
                              <p className="text-sm font-extrabold">Choose Location on Map</p>
                              <p className="text-zinc-400 text-xs font-normal">Drag and set precise map pin</p>
                           </div>
                        </div>

                        {/* Live Search Suggestions */}
                        {(stopSuggestionsMap[stop.id] || []).length > 0 && (
                          <div className="bg-zinc-900 border-b border-zinc-700/60 divide-y divide-zinc-800">
                            <p className="text-[11px] uppercase font-black text-amber-400 px-4 py-2 bg-amber-950/30 tracking-wider">Search Results</p>
                            {(stopSuggestionsMap[stop.id] || []).map((s, i) => (
                              <div 
                                key={i} 
                                className="px-5 py-3.5 hover:bg-zinc-800 cursor-pointer flex items-center space-x-3 transition-colors"
                                onClick={() => { 
                                  const fullAddr = s.subtitle ? (s.subtitle.startsWith(s.title) ? s.subtitle : `${s.title}, ${s.subtitle}`) : s.title;
                                  updateStop(stop.id, fullAddr, [s.lat, s.lon]);
                                  addRecentSearch(s);
                                  setStopSuggestionsMap(prev => ({ ...prev, [stop.id]: [] })); 
                                  setActiveInput('none');
                                }}
                              >
                                <div className="flex-shrink-0 bg-amber-500/20 text-amber-400 p-2 rounded-full">📍</div>
                                <div className="overflow-hidden">
                                  <p className="text-white font-bold truncate text-sm">{s.title}</p>
                                  <p className="text-zinc-400 text-xs truncate">{s.subtitle}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="p-2 text-center bg-zinc-950">
                           <button onClick={() => setActiveInput('none')} className="text-xs text-zinc-500 font-bold hover:text-white">Close Dropdown ✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Stop Button */}
                <div className="flex justify-between items-center px-1 py-0.5">
                  {stops.length < 3 ? (
                    <button
                      type="button"
                      onClick={addStop}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1.5 py-1 px-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 transition hover:bg-emerald-500/20"
                    >
                      <span>+ Add Stop</span>
                      <span className="text-[10px] text-zinc-400 font-medium">({stops.length}/3)</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-semibold">Max 3 stops reached</span>
                  )}
                </div>

                {/* Destination Field */}
                <div className={`relative ${activeInput === 'destination' ? 'z-30' : 'z-10'}`}>
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20"></div>
                  </div>
                  <input 
                    type="text" 
                    value={destination}
                    onFocus={() => setActiveInput('destination')}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      fetchSuggestions(e.target.value, setDestSuggestions)
                    }}
                    placeholder="Where to?" 
                    className="w-full bg-zinc-800/90 text-white placeholder-zinc-500 rounded-2xl pl-10 pr-12 py-4 focus:outline-none focus:ring-2 focus:ring-red-500 border border-zinc-700/50 transition-all font-medium text-base shadow-inner"
                  />


                  {/* Options Dropdown Box for Destination */}
                  {activeInput === 'destination' && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-zinc-950/98 backdrop-blur-2xl border-2 border-zinc-700/80 mt-2 rounded-2xl shadow-2xl overflow-y-auto max-h-64 divide-y divide-zinc-900 animate-slide-in ring-1 ring-black/50">
                      {/* Quick Actions & Favorites & Recent Searches (Shown ONLY when input is empty) */}
                      {!destination.trim() && (
                        <>
                          {/* Compact Quick Actions: Choose on Map & Current GPS */}
                          <div className="p-2 grid grid-cols-2 gap-2 bg-zinc-900/60 border-b border-zinc-900">
                            <button
                              type="button"
                              onClick={() => startMapSelection('destination')}
                              className="flex items-center space-x-2 p-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition text-left group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-sm shrink-0">
                                📌
                              </div>
                              <div className="overflow-hidden min-w-0">
                                <p className="text-cyan-400 font-extrabold text-xs truncate">Choose on Map</p>
                                <p className="text-zinc-400 text-[10px] truncate">Set map pin</p>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLocateCurrentPosition('destination')}
                              className="flex items-center space-x-2 p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition text-left group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center text-sm shrink-0">
                                📍
                              </div>
                              <div className="overflow-hidden min-w-0">
                                <p className="text-red-400 font-extrabold text-xs truncate">Current GPS</p>
                                <p className="text-zinc-400 text-[10px] truncate">Use my position</p>
                              </div>
                            </button>
                          </div>

                          {/* Recent Searches */}
                          {recentSearches.length > 0 && (
                            <div className="p-3 bg-zinc-900/90 border-b border-zinc-800">
                              <p className="text-[11px] uppercase font-black text-zinc-400 px-1 mb-2 tracking-wider">Recent Searches</p>
                              <div className="space-y-1.5">
                                {recentSearches.map((rs, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      setDestination(rs.title);
                                      setDestCoords([rs.lat, rs.lon]);
                                      setCurrentPosition([rs.lat, rs.lon]);
                                      setActiveInput('none');
                                    }}
                                    className="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl cursor-pointer transition"
                                  >
                                    <div className="text-sm p-1.5 bg-zinc-800 rounded-lg text-zinc-400">🕒</div>
                                    <div className="overflow-hidden">
                                      <p className="text-white text-xs font-bold truncate">{rs.title}</p>
                                      <p className="text-zinc-400 text-[10px] truncate">{rs.subtitle}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Favorites List at Bottom (Home, Work, Custom) */}
                          {savedPlaces.length > 0 && (
                            <div className="bg-zinc-950 divide-y divide-zinc-900 border-t border-zinc-900">
                              <p className="text-[11px] uppercase font-black text-amber-400/90 px-4 py-2 bg-amber-950/20 tracking-wider">Saved Favorites</p>
                              {savedPlaces.map((sp, idx) => (
                                 <div 
                                   key={idx}
                                   onClick={() => {
                                     setDestination(sp.address);
                                     setDestCoords(sp.coords);
                                     setCurrentPosition(sp.coords);
                                     setActiveInput('none');
                                   }}
                                   className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900 cursor-pointer transition group"
                                 >
                                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                                       <div className="flex items-center justify-center shrink-0 w-7 h-7 bg-zinc-900 rounded-full text-base border border-zinc-800">
                                          {sp.icon}
                                       </div>
                                       <div className="overflow-hidden">
                                          <p className="text-white text-xs font-bold truncate group-hover:text-red-400 transition-colors">{sp.label}</p>
                                          <p className="text-zinc-400 text-[10px] truncate">{sp.address}</p>
                                       </div>
                                    </div>
                                    <span className="text-zinc-600 text-[10px] shrink-0 font-medium">Favorites</span>
                                 </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Live Search Suggestions (Shown ONLY when typing search query) */}
                      {destination.trim().length >= 2 && (
                        <div className="bg-zinc-900 divide-y divide-zinc-800">
                          <p className="text-[11px] uppercase font-black text-emerald-400 px-4 py-2 bg-emerald-950/30 tracking-wider">Search Results</p>
                          {destSuggestions.length > 0 ? (
                            destSuggestions.map((s, i) => (
                              <div 
                                key={i} 
                                className="px-5 py-3.5 hover:bg-zinc-800 cursor-pointer flex items-center space-x-3 transition-colors"
                                onClick={() => { 
                                  const fullAddr = s.subtitle ? (s.subtitle.startsWith(s.title) ? s.subtitle : `${s.title}, ${s.subtitle}`) : s.title;
                                  setDestination(fullAddr); 
                                  setDestCoords([s.lat, s.lon]);
                                  setCurrentPosition([s.lat, s.lon]);
                                  addRecentSearch(s);
                                  setDestSuggestions([]); 
                                  setActiveInput('none');
                                }}
                              >
                                <div className="flex-shrink-0 bg-emerald-500/20 text-emerald-400 p-2 rounded-full">📍</div>
                                <div className="overflow-hidden">
                                  <p className="text-white font-bold truncate text-sm">{s.title}</p>
                                  <p className="text-zinc-400 text-xs truncate">{s.subtitle}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-xs text-zinc-500 font-medium">Searching location...</div>
                          )}
                        </div>
                      )}

                      {/* Vertical Recent Destinations List (Shown ONLY when input is empty) */}
                      {!destination.trim() && pastRides.length > 0 && (() => {
                        const uniqueDests = Array.from(new Set(pastRides.map(r => r.destination).filter(Boolean))).slice(0, 5);
                        if (uniqueDests.length === 0) return null;
                        return (
                          <div className="bg-zinc-950 divide-y divide-zinc-900 border-t border-zinc-800">
                            {uniqueDests.map((dName, idx) => {
                               const sampleRide = pastRides.find(r => r.destination === dName);
                               const distStr = sampleRide?.distance ? `${sampleRide.distance.toFixed(1)} km` : '';
                               return (
                                 <div 
                                   key={idx}
                                   onClick={() => {
                                     setDestination(dName);
                                     if (sampleRide?.destlat && sampleRide?.destlng) {
                                       setDestCoords([sampleRide.destlat, sampleRide.destlng]);
                                       setCurrentPosition([sampleRide.destlat, sampleRide.destlng]);
                                     }
                                     setActiveInput('none');
                                   }}
                                   className="flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 cursor-pointer transition group"
                                 >
                                    <div className="flex items-center space-x-3.5 min-w-0 pr-2">
                                       <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-400 text-base group-hover:bg-zinc-800 group-hover:border-zinc-700 transition-colors">
                                          🕒
                                       </div>
                                       <div className="overflow-hidden min-w-0">
                                          <p className="text-white text-sm font-bold truncate group-hover:text-emerald-400 transition-colors">{dName}</p>
                                          <p className="text-zinc-500 text-xs truncate flex items-center gap-1.5 mt-0.5">
                                             {distStr && <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">{distStr}</span>}
                                             <span className="truncate">Bengaluru, Karnataka, India</span>
                                          </p>
                                       </div>
                                    </div>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (sampleRide?.destlat && sampleRide?.destlng) {
                                          triggerSaveModal(dName, [sampleRide.destlat, sampleRide.destlng], 'Work', '💼');
                                        }
                                      }}
                                      title="Save to favorites (Home / Work / Custom)"
                                      className="text-zinc-600 hover:text-red-500 p-2 transition shrink-0 hover:scale-125"
                                    >
                                      🤍
                                    </button>
                                 </div>
                               );
                            })}
                          </div>
                        );
                      })()}

                      <div className="p-2 text-center bg-zinc-950">
                         <button onClick={() => setActiveInput('none')} className="text-xs text-zinc-500 font-bold hover:text-white">Close Dropdown ✕</button>
                      </div>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={handleEstimate}
                  disabled={status === 'estimating' || !pickup || !destination}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors mt-2 text-lg disabled:opacity-50"
                >
                  {status === 'estimating' ? 'Calculating...' : 'See Prices'}
                </button>
              </div>
            </>
          )
        )}
        </div>
      </div>
      )}

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-[2000] flex">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>
           <div className="relative w-80 bg-zinc-950 h-full shadow-2xl flex flex-col border-r border-zinc-800 animate-slide-in">
              <div className="p-6 bg-zinc-900 border-b border-zinc-800">
                 <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-blue-400">
                       {riderProfile?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'R'}
                    </div>
                    <div>
                       <h2 className="text-xl font-bold text-white">{riderProfile?.name || 'Rider'}</h2>
                       <p className="text-zinc-400 text-sm">5.0 ★ Rating</p>
                    </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                 <button onClick={() => { setIsSidebarOpen(false); fetchPastRides(); setActiveModal('history'); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">🕒</span><span>My Rides</span>
                 </button>
                 <button onClick={() => { setIsSidebarOpen(false); setActiveModal('payments'); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">💳</span><span>Payment Methods</span>
                 </button>
                 <button onClick={() => { setIsSidebarOpen(false); setActiveModal('settings'); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">⚙️</span><span>Settings</span>
                 </button>
                 <button onClick={() => { setIsSidebarOpen(false); setActiveModal('help'); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">❓</span><span>Help & Support</span>
                 </button>
              </div>
              <div className="p-6 border-t border-zinc-800">
                 <button onClick={handleLogout} className="w-full py-4 rounded-xl bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20 transition flex items-center justify-center space-x-2">
                    <span>🚪</span><span>Logout</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Side Menu Modals */}
      {activeModal !== 'none' && (
        <div className="absolute inset-0 z-[3000] flex flex-col bg-zinc-950 text-white animate-slide-in">
           <div className="p-5 border-b border-zinc-800 flex items-center bg-zinc-900">
              <button onClick={() => setActiveModal('none')} className="p-2 mr-4 bg-zinc-800 rounded-full hover:bg-zinc-700 transition text-white">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              </button>
              <h1 className="text-2xl font-bold text-white capitalize">
                {activeModal === 'history' ? 'My Rides' :
                 activeModal === 'payments' ? 'Payment Methods' :
                 activeModal === 'settings' ? 'Settings' : 'Help & Support'}
              </h1>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* My Rides */}
              {activeModal === 'history' && (
                <div className="space-y-4 max-w-lg mx-auto">
                  {pastRides.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500 font-medium">No previous rides found.</div>
                  ) : (
                    pastRides.map(ride => (
                      <div key={ride.id} className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-3">
                        <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                           <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
                             {ride.vehicletype || 'MINI'}
                           </span>
                           <span className="font-bold text-xl text-white">₹{ride.price ? ride.price.toFixed(2) : '0'}</span>
                        </div>
                        <div className="space-y-2">
                           <div className="flex items-start space-x-3">
                              <span className="w-2 h-2 bg-green-500 rounded-full mt-2 shrink-0" />
                              <p className="text-sm text-zinc-300 font-medium">{ride.pickup}</p>
                           </div>
                           <div className="flex items-start space-x-3">
                              <span className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0" />
                              <p className="text-sm text-zinc-300 font-medium">{ride.destination}</p>
                           </div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500 pt-2 border-t border-zinc-800/60">
                           <span>{ride.created_at ? new Date(ride.created_at).toLocaleString() : 'Recent'}</span>
                           <span className={`capitalize font-bold ${ride.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>{ride.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Payment Methods */}
              {activeModal === 'payments' && (
                <div className="space-y-4 max-w-lg mx-auto">
                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-3xl">💵</span>
                      <div>
                        <h3 className="font-bold text-white text-lg">Cash on Delivery</h3>
                        <p className="text-xs text-zinc-400">Default payment method</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-green-500/20 text-green-400 px-3 py-1.5 rounded-full border border-green-500/30">Active</span>
                  </div>
                  
                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between opacity-75 hover:opacity-100 transition cursor-pointer" onClick={() => alert("UPI / Card integration ready!")}>
                    <div className="flex items-center space-x-4">
                      <span className="text-3xl">💳</span>
                      <div>
                        <h3 className="font-bold text-white text-lg">UPI / Credit / Debit Card</h3>
                        <p className="text-xs text-zinc-400">Add new payment method</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-zinc-400">+</span>
                  </div>
                </div>
              )}

              {/* Settings */}
              {activeModal === 'settings' && (
                <div className="space-y-4 max-w-lg mx-auto">
                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Profile Information</h3>
                    <div>
                      <label className="text-xs text-zinc-500">Full Name</label>
                      <p className="text-white font-bold text-lg">{riderProfile?.name || 'Rider'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Email Address</label>
                      <p className="text-white font-bold text-sm">{user?.email}</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Phone Number</label>
                      <p className="text-white font-bold text-sm">{riderProfile?.phone || 'Not configured'}</p>
                    </div>
                  </div>

                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white">Emergency Contacts</h3>
                      <p className="text-xs text-zinc-400">Share ride progress with contacts</p>
                    </div>
                    <button className="text-xs bg-blue-600 text-white font-bold px-4 py-2 rounded-xl">Manage</button>
                  </div>
                </div>
              )}

              {/* Help & Support */}
              {activeModal === 'help' && (
                <div className="space-y-4 max-w-lg mx-auto">
                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-3">
                    <h3 className="font-bold text-white text-lg">24/7 Customer Support</h3>
                    <p className="text-sm text-zinc-400">Need help with a recent ride or billing inquiry?</p>
                    <div className="flex gap-3 pt-2">
                      <a href="tel:18001234567" className="flex-1 bg-green-600 text-white text-center font-bold py-3 rounded-xl hover:bg-green-500 transition">
                         📞 Call Support
                      </a>
                      <button onClick={() => alert("Support ticket opened! Our team will respond shortly.")} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition">
                         💬 Live Chat
                      </button>
                    </div>
                  </div>

                  <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-3">
                    <h3 className="font-bold text-white">Frequently Asked Questions</h3>
                    <div className="divide-y divide-zinc-800 text-sm">
                      <div className="py-3">
                        <p className="font-bold text-zinc-200">How do I cancel a ride?</p>
                        <p className="text-xs text-zinc-400 mt-1">Tap 'Cancel Ride' on your active ride card before driver arrival.</p>
                      </div>
                      <div className="py-3">
                        <p className="font-bold text-zinc-200">Where do I find my OTP?</p>
                        <p className="text-xs text-zinc-400 mt-1">The 4-digit PIN is displayed on your screen once a driver accepts your request.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[4000] bg-emerald-500 text-zinc-950 px-5 py-3 rounded-full font-bold text-sm shadow-2xl flex items-center space-x-2 animate-bounce">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Save Place In-App Modal Dialog */}
      {savingPlace && (
        <div className="fixed inset-0 z-[3500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">{selectedIcon}</span>
                <h3 className="text-lg font-extrabold text-white">Save Favorite Place</h3>
              </div>
              <button 
                onClick={() => setSavingPlace(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 mb-4">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Location Address</p>
              <p className="text-white text-xs font-semibold truncate">{savingPlace.address}</p>
            </div>

            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Quick Preset</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Home', icon: '🏠' },
                { label: 'Work', icon: '💼' },
                { label: 'Gym', icon: '🏋️' },
                { label: 'Fav', icon: '❤️' }
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSaveTagInput(preset.label);
                    setSelectedIcon(preset.icon);
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition-all border ${saveTagInput.toLowerCase() === preset.label.toLowerCase() ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 scale-105' : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                >
                  <span className="text-base">{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Custom Label Name</label>
              <input
                type="text"
                value={saveTagInput}
                onChange={(e) => setSaveTagInput(e.target.value)}
                placeholder="e.g. Home, Work, Gym, Friend"
                className="w-full bg-zinc-950 text-white placeholder-zinc-500 rounded-xl px-4 py-3 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold"
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setSavingPlace(null)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-bold py-3.5 rounded-xl hover:bg-zinc-700 transition text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (saveTagInput.trim()) {
                    savePlace(saveTagInput.trim(), savingPlace.address, savingPlace.coords, selectedIcon);
                    showToast(`Saved "${saveTagInput.trim()}" to Favorites!`);
                    setSavingPlace(null);
                  }
                }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-3.5 rounded-xl transition text-sm shadow-lg shadow-emerald-500/20"
              >
                Save Place
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Interactive Map Location Selection Overlay */}
      {isSelectingOnMap && (
        <>
          {/* Center Bouncing Location Pin */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[2500] pointer-events-none flex flex-col items-center animate-bounce">
            <div className="bg-zinc-900 border-2 border-cyan-400 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-full shadow-2xl mb-1 flex items-center space-x-1.5 whitespace-nowrap">
              <span>📍</span>
              <span>Set {mapTargetInput === 'pickup' ? 'Pickup' : mapTargetInput === 'destination' ? 'Destination' : 'Stop'}</span>
            </div>
            <div className="w-10 h-10 bg-cyan-500 border-2 border-white rounded-full flex items-center justify-center shadow-2xl">
              <div className="w-4 h-4 bg-white rounded-full" />
            </div>
            <div className="w-1.5 h-4 bg-cyan-600 rounded-b-full shadow-md" />
            <div className="w-4 h-1.5 bg-black/50 rounded-full blur-xs mt-0.5" />
          </div>

          {/* Bottom Map Selection Action Panel */}
          <div className="fixed bottom-6 left-4 right-4 z-[2600] max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/80 rounded-3xl p-5 shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-extrabold tracking-wider text-cyan-400">
                Set Location on Map
              </span>
              <button
                onClick={() => setIsSelectingOnMap(false)}
                className="text-zinc-400 hover:text-white text-xs font-bold px-2.5 py-1 bg-zinc-800 rounded-full"
              >
                Cancel ✕
              </button>
            </div>

            <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800 mb-4 flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 text-base">
                📍
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="text-white text-xs font-bold truncate">
                  {isGeocodingMapPin ? 'Detecting address...' : reverseGeoAddress}
                </p>
                <p className="text-zinc-500 text-[10px] truncate font-mono">
                  {mapCenterCoords[0].toFixed(5)}, {mapCenterCoords[1].toFixed(5)}
                </p>
              </div>
            </div>

            <button
              onClick={confirmMapLocation}
              disabled={isGeocodingMapPin}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold py-4 rounded-2xl transition text-base shadow-xl shadow-cyan-500/20 disabled:opacity-60 flex items-center justify-center space-x-2"
            >
              <span>Confirm Location</span>
              <span>➔</span>
            </button>
          </div>
        </>
      )}

      {/* No Driver Found & Alternative Vehicle Recommendation Modal */}
      {noDriverFound && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto text-2xl border border-amber-500/30">
              ⚠️
            </div>
            
            <div>
              <h3 className="text-lg font-extrabold text-white">No {selectedVehicle.toUpperCase()} Drivers Responded</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Drivers for {selectedVehicle.toUpperCase()} were unavailable or busy in your area during the last 30 seconds.
              </p>
            </div>

            {suggestedVehicle && (
              <div className="bg-zinc-800/80 border border-emerald-500/40 rounded-2xl p-4 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider">
                    Suggested Alternative
                  </span>
                  <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Faster Pickup
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-3xl">
                      {suggestedVehicle === 'bike' ? '🛵' : suggestedVehicle === 'auto' ? '🛺' : '🚗'}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        RYVO {suggestedVehicle.toUpperCase()}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        ⏱️ ~{getETAForVehicle(suggestedVehicle, estimatedDuration)} mins arrival
                      </p>
                    </div>
                  </div>
                  <span className="font-extrabold text-base text-white">
                    ₹{(getPrice(suggestedVehicle, distance) + tipAmount).toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => {
                    const vehicle = suggestedVehicle;
                    setNoDriverFound(false);
                    setSuggestedVehicle(null);
                    handleConfirmRide(vehicle);
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-3 rounded-xl transition text-sm shadow-lg shadow-emerald-500/20"
                >
                  Book {suggestedVehicle.toUpperCase()} Now ➔
                </button>
              </div>
            )}

            <div className="pt-1 flex gap-2">
              <button
                onClick={() => {
                  setNoDriverFound(false);
                  setSuggestedVehicle(null);
                  handleConfirmRide(selectedVehicle);
                }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition text-xs border border-zinc-700"
              >
                Retry {selectedVehicle.toUpperCase()}
              </button>
              <button
                onClick={() => {
                  setNoDriverFound(false);
                  setSuggestedVehicle(null);
                  setStatus('confirming');
                }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-3 rounded-xl transition text-xs border border-zinc-700"
              >
                Change Options
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
