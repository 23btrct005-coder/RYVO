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

const PickupMarker = () => (
  <div className="relative flex flex-col items-center">
    <div className="w-7 h-7 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg">
      <div className="w-3 h-3 bg-white rounded-full" />
    </div>
    <div className="w-1 h-3 bg-emerald-600 rounded-b-full shadow-md" />
  </div>
);

const DestinationMarker = () => (
  <div className="relative flex flex-col items-center">
    <div className="w-7 h-7 bg-red-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg">
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
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null)
  const [driverDetails, setDriverDetails] = useState<any>(null)
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const [distance, setDistance] = useState<number>(0)
  const [otp, setOtp] = useState<string | null>(null)
  
  const [rating, setRating] = useState<number>(0)
  const [review, setReview] = useState<string>('')
  const [hasRated, setHasRated] = useState<boolean>(false)
  
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([])
  
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
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    if (currentPosition && mapRef.current) {
      mapRef.current.flyTo({ center: [currentPosition[1], currentPosition[0]], zoom: 15 });
    }
  }, [currentPosition]);

  const [pickupSuggestions, setPickupSuggestions] = useState<Suggestion[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([])

  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null)

  const [etaPickup, setEtaPickup] = useState<number | null>(null)
  const [distPickup, setDistPickup] = useState<string | null>(null)
  const [etaDestination, setEtaDestination] = useState<number | null>(null)
  const [distDestination, setDistDestination] = useState<string | null>(null)

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

  // Fetch suggestions using Mapbox Geocoding API (100% accurate, local proximity)
  const fetchSuggestions = async (query: string, setter: (s: Suggestion[]) => void) => {
    if (query.length < 2) {
      setter([])
      return
    }
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${currentPosition[1]},${currentPosition[0]}&autocomplete=true&limit=5&access_token=${MAPBOX_TOKEN}`)
      const data = await res.json()
      if (data && data.features) {
        const results = data.features.map((f: any) => {
           const title = f.text || f.place_name.split(',')[0];
           const subtitle = f.place_name;
           return {
              title: title,
              subtitle: subtitle,
              lat: f.center[1], // latitude
              lon: f.center[0]  // longitude
           }
        }).filter((s: Suggestion) => s.title)
        setter(results)
      }
    } catch (e) {
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

      // 1. Try Google Maps Directions & Distance Matrix API if key is present
      if (GOOGLE_MAPS_KEY) {
        try {
          const gRes = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${pCoords[0]},${pCoords[1]}&destination=${dCoords[0]},${dCoords[1]}&key=${GOOGLE_MAPS_KEY}`);
          const gData = await gRes.json();
          if (gData.routes && gData.routes.length > 0) {
            const gRoute = gData.routes[0];
            const gDistKm = gRoute.legs[0].distance.value / 1000;
            const gPoints = decodePolyline(gRoute.overview_polyline.points);
            setDistance(gDistKm);
            setRouteGeometry(gPoints);
            setStatus('confirming');
            return;
          }
        } catch (e) {
          console.warn("Google Maps Directions API error, falling back to OSRM:", e);
        }
      }

      // 2. OSRM (Open Source Routing Machine) Engine calculation (100% accurate, local road paths)
      try {
        const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${pCoords[1]},${pCoords[0]};${dCoords[1]},${dCoords[0]}?overview=full&geometries=geojson`);
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          const osrmRoute = osrmData.routes[0];
          const osrmDistKm = osrmRoute.distance / 1000;
          setDistance(osrmDistKm);
          const swappedGeometry = osrmRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          setRouteGeometry(swappedGeometry);
          setStatus('confirming');
          return;
        }
      } catch (e) {
        console.warn("OSRM Routing error, falling back to Mapbox:", e);
      }

      // 3. Mapbox Directions API fallback
      const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pCoords[1]},${pCoords[0]};${dCoords[1]},${dCoords[0]}?alternatives=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`)
      const data = await res.json()
      
      if (data.routes && data.routes.length > 0) {
        const shortestRoute = data.routes.reduce((min: any, r: any) => r.distance < min.distance ? r : min, data.routes[0]);
        const distanceKm = shortestRoute.distance / 1000;
        setDistance(distanceKm);
        const swappedGeometry = shortestRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        setRouteGeometry(swappedGeometry);
        setStatus('confirming');
      } else {
        const haversineKm = getHaversineDistance(pCoords[0], pCoords[1], dCoords[0], dCoords[1]);
        const distanceKm = haversineKm * 1.20;
        setDistance(distanceKm);
        setRouteGeometry([[pCoords[0], pCoords[1]], [dCoords[0], dCoords[1]]]);
        setStatus('confirming');
      }
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

  const handleConfirmRide = async () => {
    setStatus('searching')
    setErrorMessage(null)
    console.log("Confirm Ride clicked. Attempting to insert into 'rides' table...");
    
    try {
      const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
      setOtp(generatedOtp);

      const rideData = {
        riderid: user?.id,
        pickup: pickup,
        destination: destination,
        pickuplat: pickupCoords?.[0],
        pickuplng: pickupCoords?.[1],
        destlat: destCoords?.[0],
        destlng: destCoords?.[1],
        status: 'pending',
        vehicletype: selectedVehicle,
        price: getPrice(selectedVehicle, distance),
        distance: distance,
        otp: generatedOtp
      };

      const { data, error } = await supabase.from('rides').insert([rideData]).select().single();
      
      if (error) throw error;

      console.log("Successfully wrote to Supabase with ID:", data.id);
      setCurrentRideId(data.id)
    } catch (e: any) {
      console.error("Error adding document: ", e);
      setErrorMessage("Network error: Could not reach Supabase.")
      setStatus('idle')
    }
  }

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
        >
          
          {/* Current GPS Location Marker */}
          <Marker longitude={currentPosition[1]} latitude={currentPosition[0]}>
            <CurrentLocationMarker />
          </Marker>

          {/* Pickup Location Pin */}
          {pickupCoords && (
            <Marker longitude={pickupCoords[1]} latitude={pickupCoords[0]} anchor="bottom">
              <PickupMarker />
            </Marker>
          )}

          {/* Destination Location Pin */}
          {destCoords && (
            <Marker longitude={destCoords[1]} latitude={destCoords[0]} anchor="bottom">
              <DestinationMarker />
            </Marker>
          )}

          {/* Route Polyline */}
          {routeGeometry && (
            <Source id="route" type="geojson" data={{ type: 'LineString', coordinates: routeGeometry.map(coord => [coord[1], coord[0]]) }}>
              <Layer id="route" type="line" paint={{ 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.85 }} />
            </Source>
          )}

          {/* Show Online Drivers when idling or estimating */}
          {(status === 'idle' || status === 'estimating') && onlineDrivers.map(driver => (
            <Marker
              key={driver.id}
              longitude={driver.lng}
              latitude={driver.lat}
            >
              <VehicleMarker type={driver.vehicleType || 'mini'} />
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

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8 bg-gradient-to-t from-black/90 to-transparent">
        <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto relative">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">RYVO</h1>
          
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
                      setDriverDetails(null);
                      setDriverLocation(null);
                    }} className="mt-4 w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200">
                      Request Another Ride
                    </button>
                  )}
               </div>
             </div>
          ) : status === 'searching' ? (
            <div className="text-center py-8">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
               <p className="text-zinc-300 font-medium animate-pulse mb-6">Finding a nearby driver...</p>
               <button 
                 onClick={cancelRide}
                 className="w-full bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 font-bold py-3 rounded-xl transition"
               >
                 Cancel Request
               </button>
            </div>
          ) : status === 'confirming' ? (
            <div className="py-2">
               <div className="flex justify-between items-center mb-3">
                 <p className="text-zinc-400 text-sm font-medium">Select a ride</p>
                 <span className="bg-zinc-800 text-zinc-200 text-xs font-bold px-3 py-1 rounded-full border border-zinc-700">
                   📍 {distance > 0 ? `${distance.toFixed(1)} km` : ''}
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
                         <p className="text-xs text-zinc-400">Beat the traffic</p>
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
                         <p className="text-xs text-zinc-400">Affordable rides</p>
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
                         <p className="text-xs text-zinc-400">Comfortable AC rides</p>
                       </div>
                    </div>
                    <span className="font-bold text-xl">₹{getPrice('mini', distance).toFixed(2)}</span>
                 </div>
               </div>

               <button 
                  onClick={handleConfirmRide}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors"
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
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                  <input 
                    type="text" 
                    value={pickup}
                    onChange={(e) => {
                      setPickup(e.target.value); 
                      fetchSuggestions(e.target.value, setPickupSuggestions)
                    }}
                    onBlur={() => setTimeout(() => setPickupSuggestions([]), 200)}
                    placeholder="Enter pickup location" 
                    className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-white transition-all font-medium"
                  />
                  {pickupSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 mt-2 rounded-2xl shadow-2xl overflow-hidden divide-y divide-zinc-800">
                      {pickupSuggestions.map((s, i) => (
                        <div 
                          key={i} 
                          className="px-5 py-4 hover:bg-zinc-800 cursor-pointer flex items-center space-x-4 transition-colors"
                          onClick={() => { 
                            setPickup(s.title); 
                            setPickupCoords([s.lat, s.lon]);
                            setCurrentPosition([s.lat, s.lon]);
                            setPickupSuggestions([]); 
                          }}
                        >
                          <div className="flex-shrink-0 bg-zinc-800 p-2 rounded-full">
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-white font-bold truncate text-base">{s.title}</p>
                            <p className="text-zinc-400 text-sm truncate">{s.subtitle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Destination Field */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2 h-2 bg-white"></div>
                  </div>
                  <input 
                    type="text" 
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      fetchSuggestions(e.target.value, setDestSuggestions)
                    }}
                    onBlur={() => setTimeout(() => setDestSuggestions([]), 200)}
                    placeholder="Where to?" 
                    className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-white transition-all font-medium"
                  />
                  {destSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 mt-2 rounded-2xl shadow-2xl overflow-hidden divide-y divide-zinc-800">
                      {destSuggestions.map((s, i) => (
                        <div 
                          key={i} 
                          className="px-5 py-4 hover:bg-zinc-800 cursor-pointer flex items-center space-x-4 transition-colors"
                          onClick={() => { 
                            setDestination(s.title); 
                            setDestCoords([s.lat, s.lon]);
                            setCurrentPosition([s.lat, s.lon]);
                            setDestSuggestions([]); 
                          }}
                        >
                          <div className="flex-shrink-0 bg-zinc-800 p-2 rounded-full">
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-white font-bold truncate text-base">{s.title}</p>
                            <p className="text-zinc-400 text-sm truncate">{s.subtitle}</p>
                          </div>
                        </div>
                      ))}
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
          )}
        </div>
      </div>

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
    </div>
  )
}

export default App
