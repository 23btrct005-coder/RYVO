// Vercel Production Trigger: 2026-09-06T19:42:00 - force rebuild to bypass browser cache
import { useState, useEffect, useRef } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'
import { Geolocation } from '@capacitor/geolocation'
const DEFAULT_MAPBOX_TOKEN = "pk.eyJ1IjoiYWJoaTA5MjUiLCJhIjoiY210bzV2YnN0MGRrbjM0c2c5ajR0MWVsbyJ9" + "." + "_78OmqK7nqvyHwwjDoDfzw";
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || DEFAULT_MAPBOX_TOKEN;

interface RideRequest {
  id: string;
  pickup: string;
  destination: string;
  status: string;
  paymentMethod: string;
  price?: number;
  tip?: number;
  distance?: number;
  vehicleType?: string;
  pickupCoords?: [number, number];
  destCoords?: [number, number];
  stops?: any[];
  timestamp?: any;
  otp?: string;
  riderPhone?: string;
  riderName?: string;
  riderid?: string;
}

const DriverLocationMarker = ({ vehicleType }: { vehicleType: string }) => {
  const emoji = vehicleType?.toUpperCase() === 'AUTO' ? '🛺' : vehicleType?.toUpperCase() === 'BIKE' ? '🛵' : '🚗';
  return (
    <div className="relative flex flex-col items-center">
      <div className="bg-black/90 text-blue-400 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-blue-500/50 mb-1 whitespace-nowrap tracking-wider">
         YOUR LIVE LOCATION
      </div>
      <div className="bg-white border-2 border-blue-600 rounded-full w-11 h-11 flex items-center justify-center text-2xl shadow-2xl">
        {emoji}
      </div>
    </div>
  );
};

const RiderPickupMarker = () => (
  <div className="relative flex flex-col items-center">
    <div className="w-7 h-7 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg">
      <div className="w-3 h-3 bg-white rounded-full" />
    </div>
    <div className="w-1 h-3 bg-emerald-600 rounded-b-full shadow-md" />
  </div>
);

const RiderDropoffMarker = () => (
  <div className="relative flex flex-col items-center">
    <div className="w-7 h-7 bg-red-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg">
      <span className="text-xs">🏁</span>
    </div>
    <div className="w-1 h-3 bg-red-600 rounded-b-full shadow-md" />
  </div>
);

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [driverProfile, setDriverProfile] = useState<any>(null)
  
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleType, setVehicleType] = useState('MINI')
  const [vehicleColor, setVehicleColor] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  
  // Document State
  const [signupStep, setSignupStep] = useState(1)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [driverPhoto, setDriverPhoto] = useState<File | null>(null)
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null)
  const [vehicleFront, setVehicleFront] = useState<File | null>(null)
  const [vehicleBack, setVehicleBack] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const [isOnline, setIsOnline] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [appState, setAppState] = useState<'idle' | 'online' | 'incoming' | 'accepted' | 'arrived' | 'in_transit' | 'completed'>('idle')
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null)
  const [availableRequests, setAvailableRequests] = useState<RideRequest[]>([])
  const [requestCountdown, setRequestCountdown] = useState<number>(15)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [declinedRides, setDeclinedRides] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('declinedRides') || '[]');
    } catch {
      return [];
    }
  })
  const declinedRidesRef = useRef(declinedRides)

  // Floating Toast Notification State & Helper
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };
  const incomingRequestRef = useRef(incomingRequest)
  
  useEffect(() => {
    let timer: any;
    if (appState === 'incoming') {
      setRequestCountdown(15);
      timer = setInterval(() => {
        setRequestCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [appState, incomingRequest?.id]);
  
  useEffect(() => {
    declinedRidesRef.current = declinedRides
    incomingRequestRef.current = incomingRequest
    sessionStorage.setItem('declinedRides', JSON.stringify(declinedRides))
  }, [declinedRides, incomingRequest])

  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  
  const [activeModal, setActiveModal] = useState<'none' | 'history' | 'earnings' | 'settings' | 'help'>('none')
  const [completedRides, setCompletedRides] = useState<any[]>([])
  
  // Calculate average rating dynamically
  const ratedRides = completedRides.filter(r => r.rating && typeof r.rating === 'number');
  const avgRating = ratedRides.length > 0 
    ? (ratedRides.reduce((acc, r) => acc + r.rating, 0) / ratedRides.length).toFixed(1)
    : '5.0';
  
  // Distance helper function
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  const [driverPosition, setDriverPosition] = useState<[number, number]>([12.8753, 77.5958])
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    if (driverPosition && mapRef.current) {
      mapRef.current.flyTo({ center: [driverPosition[1], driverPosition[0]], zoom: 16 });
    }
  }, [driverPosition])
  
  const watchIdRef = useRef<string | null>(null)
  const driverPositionRef = useRef(driverPosition)
  const driverProfileRef = useRef(driverProfile)
  
  useEffect(() => {
    driverPositionRef.current = driverPosition
  }, [driverPosition])
  
  useEffect(() => {
    driverProfileRef.current = driverProfile
  }, [driverProfile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (!currentUser) {
        setDriverProfile(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Robust fetch: If we have a user from getSession but driverProfile is still null, fetch it
  useEffect(() => {
    if (user && !driverProfile) {
      const fetchProfile = async () => {
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
          const queryPromise = supabase.from('drivers').select('*').eq('id', user.id).single();
          
          const result: any = await Promise.race([queryPromise, timeoutPromise]);
          const { data, error } = result;
          
          if (error) {
            console.error("Robust fetch error:", error);
            if (error.code === 'PGRST116') {
               console.warn("Robust fetch: User is not a driver. Forcing logout.");
               await supabase.auth.signOut();
               setUser(null);
            } else {
               setFetchError(`Robust fetch Error: ${error.message} (Code: ${error.code})`);
            }
          }
          if (data) {
            setDriverProfile(data);
            setAppState(data.isonline ? 'online' : 'idle');
            setIsOnline(data.isonline);
            
            // Check for active ride
            const { data: rideData, error: rideError } = await supabase
               .from('rides')
               .select('*')
               .eq('driverid', user.id)
               .in('status', ['accepted', 'arrived', 'in_transit'])
               .order('created_at', { ascending: false })
               .limit(1)
               .maybeSingle();
               
            if (rideData && !rideError) {
               setCurrentRide({
                  ...rideData,
                  stops: Array.isArray(rideData.stops) ? rideData.stops : (typeof rideData.stops === 'string' ? JSON.parse(rideData.stops) : undefined),
                  pickupCoords: (rideData.pickuplat && rideData.pickuplng) ? [rideData.pickuplat, rideData.pickuplng] : undefined,
                  destCoords: (rideData.destlat && rideData.destlng) ? [rideData.destlat, rideData.destlng] : undefined,
                  price: typeof rideData.price === 'string' ? parseFloat(rideData.price) : rideData.price
               });
               setAppState(rideData.status);
            }
          } else if (!error) {
             setFetchError('Robust fetch: Data is null and Error is null');
          }
        } catch (e: any) {
          console.error("Robust fetch exception:", e);
          setFetchError(`Robust fetch Exception: ${e.message || String(e)}`);
          
          // Raw fetch fallback
          try {
             const sessionResponse = await supabase.auth.getSession();
             const token = sessionResponse.data.session?.access_token;
             if (token) {
                 const rawRes = await fetch(`https://ljnybrfrbcjskauolnyu.supabase.co/rest/v1/drivers?id=eq.${user.id}`, {
                     headers: {
                         apikey: 'sb_publishable_ZT9bmCMNLh-ushHtvNtX8A_IjxDNXCJ',
                         Authorization: `Bearer ${token}`
                     }
                 });
                 const rawData = await rawRes.json();
                 if (Array.isArray(rawData) && rawData.length > 0) {
                     setDriverProfile(rawData[0]);
                 } else {
                     setFetchError(`Raw fetch returned empty/error: ${JSON.stringify(rawData)}`);
                 }
             }
          } catch(rawErr: any) {
              setFetchError(prev => prev + ` | Raw fetch also failed: ${rawErr.message}`);
          }
        }
      };
      fetchProfile();
    }
  }, [user?.id]);
  
  useEffect(() => {
    if (!user) return
    const fetchCompletedRides = async () => {
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('driverId', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
      
      if (data) setCompletedRides(data)
    }
    fetchCompletedRides()
  }, [user])

  useEffect(() => {
    if (user && avgRating !== '5.0') {
      supabase.from('drivers').update({
        rating: avgRating,
        totalReviews: ratedRides.length
      }).eq('id', user.id).then()
    }
  }, [avgRating, user]);

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
        // Verify this user is actually a driver
        const { data: driverData } = await supabase
          .from('drivers')
          .select('id')
          .eq('id', data.user.id)
          .single()
          
        if (!driverData) {
          await supabase.auth.signOut()
          alert("Access Denied: You do not have a Driver profile. If you are a Rider, please use a different email to register as a Driver.")
        }
      }
    } catch (error: any) {
      alert("Login Failed: " + error.message)
    }
  }

  const handleLogout = async () => {
    // Show immediate feedback
    document.body.style.opacity = '0.5';
    
    // Attempt network signout but don't await it so we don't block the UI
    supabase.auth.signOut().catch(e => console.error("Sign out exception:", e));
    
    // Immediately clear local storage to prevent ghost sessions
    localStorage.clear();
    sessionStorage.clear();
    setIsSidebarOpen(false);
    setUser(null);
    setDriverProfile(null);
    
    // Reload quickly to show login screen
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  const uploadImage = async (file: File | null, path: string) => {
    if (!file) return null;
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true })
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(path)
      
    return publicUrl;
  }

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      alert("Please enter a valid email address.")
      return
    }
    if (!password || password.length < 6) {
      alert("Please enter a password that is at least 6 characters long.")
      return
    }
    if (!name || !phone || !vehicleColor || !vehicleNumber) {
      alert("Please fill in all basic details.")
      return
    }
    setSignupStep(2)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licenseNumber || !driverPhoto || !licensePhoto || !vehicleFront || !vehicleBack) {
      alert("Please provide all required documents and photos.")
      return
    }
    
    setIsUploading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) throw authError;
      
      const uid = authData.user?.id
      if (!uid) throw new Error("No UID returned")
      
      const safeUpload = async (file: File | null, path: string) => {
        try {
          // Add a 10-second timeout to prevent infinite hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Upload timed out")), 10000)
          })
          return await Promise.race([
            uploadImage(file, path),
            timeoutPromise
          ]) as string | null
        } catch (e) {
          console.warn(`Failed or timed out uploading ${path}, proceeding without image:`, e)
          return ''
        }
      }
      
      const [driverPhotoUrl, licensePhotoUrl, vehicleFrontUrl, vehicleBackUrl] = await Promise.all([
        safeUpload(driverPhoto, `drivers/${uid}/driver_photo`),
        safeUpload(licensePhoto, `drivers/${uid}/license_photo`),
        safeUpload(vehicleFront, `drivers/${uid}/vehicle_front`),
        safeUpload(vehicleBack, `drivers/${uid}/vehicle_back`)
      ])

      const profileData = {
        id: uid,
        name,
        phone,
        email,
        vehicletype: vehicleType,
        vehiclemodel: vehicleModel,
        vehiclecolor: vehicleColor,
        vehiclenumber: vehicleNumber,
        licensenumber: licenseNumber,
        documents: {
          driverPhotoUrl,
          licensePhotoUrl,
          vehicleFrontUrl,
          vehicleBackUrl
        },
        isonline: false
      }
      
      const { error: dbError } = await supabase.from('drivers').insert([profileData])
      if (dbError) throw dbError;
      
      setDriverProfile(profileData)
    } catch (error: any) {
      alert("Sign Up Failed: " + error.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Get initial location on mount
  useEffect(() => {
    const getInitialLocation = async () => {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
        setDriverPosition([position.coords.latitude, position.coords.longitude])
      } catch (e) {
        console.error("Error getting initial location", e)
      }
    }
    getInitialLocation()
  }, [])

  // Start watching GPS position when online or on a ride
  useEffect(() => {
    const startWatch = async () => {
      if (isOnline || currentRide) {
        try {
          const id = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
            if (err) console.error("Geolocation watch error:", err);
            if (position) {
              const newPos: [number, number] = [position.coords.latitude, position.coords.longitude]
              setDriverPosition(newPos)
              
              if (currentRide) {
                supabase.from('rides').update({
                  driverlat: position.coords.latitude,
                  driverlng: position.coords.longitude
                }).eq('id', currentRide.id).then()
              } else if (isOnline && user) {
                supabase.from('drivers').update({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
                }).eq('id', user.id).then()
              }
            }
          });
          watchIdRef.current = id;
        } catch (e) {
          console.error("GPS Error:", e)
        }
      } else {
        if (watchIdRef.current) {
          Geolocation.clearWatch({ id: watchIdRef.current })
          watchIdRef.current = null
        }
      }
    }
    startWatch()
    
    return () => {
      if (watchIdRef.current) {
         Geolocation.clearWatch({ id: watchIdRef.current })
      }
    }
  }, [isOnline, currentRide])

  // Listen for incoming ride requests
  useEffect(() => {
    if (!isOnline || currentRide) {
      setIncomingRequest(null)
      return
    }
    
    // First, check if there are any existing pending requests from the last 15 minutes
    const fetchPending = async () => {
      // Reduced from 15 mins to 3 mins to avoid showing old stale requests
      const threeMinsAgo = new Date(Date.now() - 3 * 60000).toISOString();
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('status', 'pending')
        .gte('created_at', threeMinsAgo);
      if (data && data.length > 0) {
        checkRequests(data)
      }
    }
    fetchPending()

    const channel = supabase.channel('public:rides')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.pending' }, payload => {
        checkRequests([payload.new])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, payload => {
        const updated = payload.new as any;
        if (updated && (updated.status === 'cancelled' || updated.status === 'accepted')) {
          setAvailableRequests(prev => prev.filter(r => r.id !== updated.id));
          if (incomingRequestRef.current?.id === updated.id) {
            setAvailableRequests(prev => {
              const remaining = prev.filter(r => r.id !== updated.id);
              if (remaining.length > 0) {
                setIncomingRequest(remaining[0]);
              } else {
                setIncomingRequest(null);
                setAppState('online');
              }
              return remaining;
            });
          }
        } else if (updated && updated.status === 'pending') {
          // Real-time fare/tip update sync
          const updatedPrice = typeof updated.price === 'string' ? parseFloat(updated.price) : updated.price;
          const updatedTip = typeof updated.tip === 'string' ? parseFloat(updated.tip) : (updated.tip || 0);
          setAvailableRequests(prev => prev.map(r => r.id === updated.id ? { ...r, price: updatedPrice, tip: updatedTip } : r));
          if (incomingRequestRef.current?.id === updated.id) {
            setIncomingRequest(prev => prev ? { ...prev, price: updatedPrice, tip: updatedTip } : null);
          }
        }
      })
      .subscribe()
      
    const checkRequests = (requests: any[]) => {
      const validRequests: RideRequest[] = [];
      requests.forEach((data) => {
        // Map postgres flat columns to the expected React state interface
        const mappedData: RideRequest = {
          ...data,
          vehicleType: data.vehicletype || data.vehicleType,
          stops: Array.isArray(data.stops) ? data.stops : (typeof data.stops === 'string' ? JSON.parse(data.stops) : undefined),
          pickupCoords: (data.pickuplat && data.pickuplng) ? [data.pickuplat, data.pickuplng] : undefined,
          destCoords: (data.destlat && data.destlng) ? [data.destlat, data.destlng] : undefined,
          price: typeof data.price === 'string' ? parseFloat(data.price) : data.price,
          tip: typeof data.tip === 'string' ? parseFloat(data.tip) : (data.tip || 0)
        };
        
        // 1. Vehicle Type Match
        const driverType = (driverProfileRef.current?.vehicletype || 'mini').toLowerCase();
        const requestType = ((data.vehicleType || data.vehicletype || 'mini') as string).toLowerCase();
        const isTypeMatch = driverType === requestType;

        // 2. Distance check (<= 5km)
        let isNear = false;
        if (mappedData.pickupCoords) {
           const dist = calculateDistance(
             driverPositionRef.current[0], 
             driverPositionRef.current[1], 
             mappedData.pickupCoords[0], 
             mappedData.pickupCoords[1]
           );
           if (dist <= 5.0) {
             isNear = true;
           }
        }
        const isNotDeclined = !declinedRidesRef.current.includes(mappedData.id);
        
        if (!currentRide && isTypeMatch && isNear && isNotDeclined) {
          validRequests.push(mappedData);
        }
      });
      
      if (validRequests.length > 0) {
        setAvailableRequests(prev => {
          const merged = [...prev];
          validRequests.forEach(req => {
            if (!merged.some(r => r.id === req.id)) {
              merged.push(req);
            }
          });
          return merged;
        });

        if (!incomingRequestRef.current) {
          setIncomingRequest(validRequests[0]);
          setAppState('incoming');
        }
      }
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOnline, currentRide]);

  // Listen for current ride status changes (like rider cancellation)
  useEffect(() => {
    if (!currentRide) return;
    
    const checkRide = async () => {
      const { data } = await supabase.from('rides').select('*').eq('id', currentRide.id).single();
      if (data && data.status === 'cancelled') {
        showToast("⚠️ The rider has cancelled the ride request.");
        setCurrentRide(null);
        setAppState('online');
        setRouteGeometry(null);
      }
    };
    
    const channel = supabase.channel(`driver-ride-${currentRide.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, payload => {
        if (payload.new && (payload.new as any).id === currentRide.id && (payload.new as any).status === 'cancelled') {
          showToast("⚠️ The rider has cancelled the ride request.");
          setCurrentRide(null);
          setAppState('online');
          setRouteGeometry(null);
        }
      })
      .subscribe()

    const interval = setInterval(checkRide, 2500);

    return () => { 
      supabase.removeChannel(channel);
      clearInterval(interval);
    }
  }, [currentRide]);

  const playNotificationSound = () => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200, 100, 400]);
      }
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // Play a quick double beep
      const playBeep = (time: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.3);
      }
      
      const now = ctx.currentTime;
      playBeep(now, 880);       // A5
      playBeep(now + 0.4, 1108.73); // C#6
      playBeep(now + 0.8, 1318.51); // E6
      
    } catch(e) {
      console.error("Audio error", e)
    }
  }

  useEffect(() => {
    if (incomingRequest && appState === 'incoming') {
      playNotificationSound();
    }
  }, [incomingRequest?.id, appState]);

  // Route drawing function
  const fetchRoute = async (start: [number, number], end: [number, number]) => {
    try {
      const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`)
      const data = await res.json()
      if (data.routes && data.routes.length > 0) {
        const shortestRoute = data.routes.reduce((min: any, r: any) => r.distance < min.distance ? r : min, data.routes[0]);
        const swappedGeometry = shortestRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]])
        setRouteGeometry(swappedGeometry)
      } else {
        console.error('Could not fetch route')
      }
    } catch (e) {
      console.error("Routing error", e)
    }
  }

  const handleAccept = async () => {
    if (!incomingRequest) return;
    try {
      const { error: updateError } = await supabase.from('rides').update({
        status: 'accepted',
        driverid: user?.id,
        driverlat: driverPosition[0],
        driverlng: driverPosition[1]
      }).eq('id', incomingRequest.id);
      
      if (updateError) {
        showToast(`Failed to accept ride: ${updateError.message}`);
        return;
      }
      
      // Fetch rider phone and name for display
      let fetchedPhone = '';
      let fetchedName = '';
      try {
        const { data: riderData } = await supabase.from('riders').select('name, phone').eq('id', incomingRequest.riderid).single();
        if (riderData) {
          fetchedPhone = riderData.phone;
          fetchedName = riderData.name;
        }
      } catch (err) {
        console.error("Failed to fetch rider details", err);
      }
      
      setCurrentRide({
        ...incomingRequest,
        riderPhone: fetchedPhone || 'Unknown',
        riderName: fetchedName || 'Rider'
      });
      setIncomingRequest(null)
      setAppState('accepted')
      
      // Draw route to pickup
      if (incomingRequest.pickupCoords) {
        fetchRoute(driverPosition, incomingRequest.pickupCoords)
      }
    } catch(e) {
      console.error("Error accepting ride", e)
    }
  }

  const handleArrived = async () => {
    if (!currentRide) return;
    try {
      await supabase.from('rides').update({ status: 'arrived' }).eq('id', currentRide.id);
      setAppState('arrived')
      setRouteGeometry(null) // Clear route to pickup
    } catch(e) {}
  }

  const handleStartRide = async () => {
    if (!currentRide) return;
    if (otpInput !== currentRide.otp) {
      setOtpError("Invalid OTP! Please ask the rider for the correct 4-digit code.");
      return;
    }
    
    try {
      await supabase.from('rides').update({ status: 'in_transit' }).eq('id', currentRide.id);
      setAppState('in_transit')
      
      // Draw route to destination
      if (currentRide.destCoords) {
        fetchRoute(driverPosition, currentRide.destCoords)
      }
    } catch(e) {}
  }

  const handleCompleteRide = async () => {
    if (!currentRide) return;
    try {
      await supabase.from('rides').update({ status: 'completed' }).eq('id', currentRide.id);
      setAppState('completed')
      setRouteGeometry(null)
    } catch(e) {}
  }

  const cancelRide = async () => {
    if (!currentRide) return;
    if (!window.confirm("Are you sure you want to cancel this ride?")) return;
    try {
      await supabase.from('rides').update({ status: 'cancelled' }).eq('id', currentRide.id);
      setCurrentRide(null);
      setAppState('online');
      setRouteGeometry(null);
    } catch(e) {
      console.error("Error cancelling ride:", e);
    }
  }
  
  const resetToOnline = () => {
    setCurrentRide(null)
    setAppState('online')
  }

  const toggleOnline = async () => {
    let currentProfile = driverProfile;
    
    // Resiliency: If profile is missing but user is logged in, try to fetch it again
    if (!currentProfile && user) {
      try {
        const { data } = await supabase.from('drivers').select('*').eq('id', user.id).single();
        if (data) {
          setDriverProfile(data);
          currentProfile = data;
        }
      } catch (e) {
        console.error("Failed to fetch profile during toggle:", e);
      }
    }

    if (!user) {
      alert("Error: User not found. Please log out and log in again.");
      return;
    }
    const newState = !isOnline
    setIsOnline(newState)
    setAppState(newState ? 'online' : 'idle')
    
    // Update online status in Firestore
    try {
      await supabase.from('drivers').update({
        isonline: newState,
        // Also update initial location if going online
        ...(newState && driverPosition ? {
          lat: driverPosition[0],
          lng: driverPosition[1]
        } : {})
      }).eq('id', user.id)
    } catch (e) {
      console.error("Error updating online status:", e)
    }
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white w-full">
        <div className="p-8 max-w-md w-full bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800">
          <h1 className="text-4xl font-bold text-center mb-8">RYVO Driver</h1>
          
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
            <form onSubmit={signupStep === 1 ? handleNextStep : handleSignUp} className="space-y-4">
              {signupStep === 1 ? (
                <>
                  <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
                  <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
                  <input type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
                  
                  <div className="flex space-x-2">
                    <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-3">
                      <option value="MINI">Mini (Car)</option>
                      <option value="AUTO">Auto</option>
                      <option value="BIKE">Bike</option>
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <input type="text" placeholder="Vehicle Model (e.g. Pulsar)" value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} className="w-1/2 bg-zinc-800 text-white rounded-xl px-4 py-3" />
                    <input type="text" placeholder="Vehicle Color" value={vehicleColor} onChange={e => setVehicleColor(e.target.value)} className="w-1/2 bg-zinc-800 text-white rounded-xl px-4 py-3" />
                  </div>
                  <input type="text" placeholder="License Plate (e.g. KA-01-AB-1234)" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 uppercase" />
                  
                  <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 mt-2 transition">Continue to Documents ➔</button>
                </>
              ) : (
                <div className="space-y-4 animate-slide-in">
                  <div className="flex items-center space-x-2 mb-2">
                     <button type="button" onClick={() => setSignupStep(1)} className="text-zinc-400 hover:text-white">← Back</button>
                     <span className="text-white font-bold">Document Verification</span>
                  </div>
                  
                  <input type="text" placeholder="Driving License Number" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 uppercase" />
                  
                  <div className="space-y-3">
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Your Profile Photo</label>
                        <input type="file" accept="image/*" onChange={e => setDriverPhoto(e.target.files?.[0] || null)} className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Driving License Photo</label>
                        <input type="file" accept="image/*" onChange={e => setLicensePhoto(e.target.files?.[0] || null)} className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Vehicle Photo (Front)</label>
                        <input type="file" accept="image/*" onChange={e => setVehicleFront(e.target.files?.[0] || null)} className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Vehicle Photo (Back)</label>
                        <input type="file" accept="image/*" onChange={e => setVehicleBack(e.target.files?.[0] || null)} className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
                     </div>
                  </div>
                  
                  <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 mt-4 disabled:opacity-50 flex justify-center items-center">
                    {isUploading ? (
                      <span className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Uploading Documents...</span>
                      </span>
                    ) : 'Complete Signup'}
                  </button>
                </div>
              )}
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
          initialViewState={{ longitude: driverPosition[1], latitude: driverPosition[0], zoom: 16 }}
          style={{ height: '100%', width: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {/* Driver Live Location Marker */}
          <Marker longitude={driverPosition[1]} latitude={driverPosition[0]}>
            <DriverLocationMarker vehicleType={driverProfile?.vehicletype || vehicleType} />
          </Marker>

          {/* Route Line */}
          {routeGeometry && (
            <Source id="driverRoute" type="geojson" data={{ type: 'LineString', coordinates: routeGeometry.map(coord => [coord[1], coord[0]]) }}>
              <Layer id="driverRouteLine" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.85 }} />
            </Source>
          )}

          {/* Rider Pickup Marker */}
          {(appState === 'accepted' || appState === 'arrived') && currentRide?.pickupCoords && (
            <Marker longitude={currentRide.pickupCoords[1]} latitude={currentRide.pickupCoords[0]} anchor="bottom">
              <RiderPickupMarker />
            </Marker>
          )}

          {/* Rider Dropoff Destination Marker */}
          {appState === 'in_transit' && currentRide?.destCoords && (
            <Marker longitude={currentRide.destCoords[1]} latitude={currentRide.destCoords[0]} anchor="bottom">
              <RiderDropoffMarker />
            </Marker>
          )}
        </Map>
      </div>

      {/* Debug Error Overlay */}
      {fetchError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[3000] bg-red-600 text-white p-4 rounded-xl shadow-2xl font-bold max-w-md w-full">
          🚨 DEBUG ERROR: {fetchError}
        </div>
      )}

      {/* Real-time Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-zinc-900/95 backdrop-blur-md text-white font-bold px-5 py-3.5 rounded-2xl border border-zinc-700/80 shadow-2xl animate-bounce text-sm flex items-center gap-3 max-w-sm w-[90%] justify-center">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center max-w-md mx-auto mt-2">
          <div className="flex items-center space-x-3 pointer-events-auto">
             <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-zinc-900/90 backdrop-blur rounded-full shadow-lg border border-zinc-800 text-white hover:bg-zinc-800 transition">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
             </button>
             <div className="bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-zinc-800">
                <h1 className="text-xl font-bold tracking-tight text-white">RYVO</h1>
             </div>
          </div>
          
          {appState === 'idle' || appState === 'online' ? (
            <button 
              onClick={toggleOnline}
              className={`px-6 py-3 rounded-full font-bold transition-all shadow-xl text-sm ${
                isOnline ? 'bg-black text-white border border-green-500' : 'bg-white text-black'
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span>{isOnline ? 'ONLINE' : 'GO ONLINE'}</span>
              </div>
            </button>
          ) : (
            <div className="bg-black/90 backdrop-blur px-6 py-3 rounded-full shadow-xl border border-blue-500">
               <span className="font-bold text-white text-sm uppercase">{appState.replace('_', ' ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sheets */}
      
      {/* Offline State */}
      {appState === 'idle' && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
           <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-md mx-auto text-center transform translate-y-0 transition-transform">
              <h2 className="text-2xl font-bold text-black mb-2">You're Offline</h2>
              <p className="text-zinc-500 mb-6 font-medium">Go online to start receiving ride requests.</p>
              <button onClick={toggleOnline} className="w-full bg-black text-white font-bold py-4 rounded-xl text-lg hover:bg-zinc-800 transition-colors">
                 Go Online
              </button>
           </div>
        </div>
      )}

      {/* Incoming Request Overlay matching Namma Yatri / Rapido redesign screenshot */}
      {appState === 'incoming' && (availableRequests.length > 0 || incomingRequest) && (() => {
        const activeReq = incomingRequest || availableRequests[0];
        if (!activeReq) return null;
        
        const pickupDist = activeReq.pickupCoords 
          ? calculateDistance(driverPosition[0], driverPosition[1], activeReq.pickupCoords[0], activeReq.pickupCoords[1]).toFixed(1)
          : '1.8';
        const dropDist = activeReq.distance 
          ? Number(activeReq.distance).toFixed(1)
          : (activeReq.pickupCoords && activeReq.destCoords 
              ? calculateDistance(activeReq.pickupCoords[0], activeReq.pickupCoords[1], activeReq.destCoords[0], activeReq.destCoords[1]).toFixed(1)
              : '9.6');

        const totalFareFormatted = activeReq.price ? activeReq.price.toFixed(0) : '399';
        const activeVehicleType = ((activeReq as any).vehicletype || activeReq.vehicleType || driverProfile?.vehicletype || 'mini').toLowerCase();
        const activeEmoji = activeVehicleType === 'auto' ? '🛺' : activeVehicleType === 'bike' ? '🛵' : '🚗';
        
        // Exact fare matching formula from Rider App getPrice
        const tripDistance = activeReq.distance || Number(dropDist) || 0;
        const calculatedBase = activeVehicleType === 'bike' ? Math.max(20, 20 + (tripDistance * 8))
          : activeVehicleType === 'auto' ? Math.max(30, 30 + (tripDistance * 12))
          : Math.max(50, 50 + (tripDistance * 15));
          
        const currentPriceNum = activeReq.price ? Number(activeReq.price) : 0;
        const calculatedTip = activeReq.tip !== undefined && activeReq.tip !== null
          ? Number(activeReq.tip)
          : (currentPriceNum > 0 && calculatedBase > 0 && currentPriceNum > calculatedBase + 2
              ? Math.round(currentPriceNum - calculatedBase)
              : 0);

        return (
          <div className="absolute inset-x-0 bottom-0 z-20 p-2 sm:p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-auto">
            <div className="max-w-md mx-auto flex gap-2 items-end">
              {/* Left Order Selection Queue Strip (if multiple orders exist) */}
              {availableRequests.length > 1 && (
                <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1 select-none">
                  {availableRequests.map((req) => {
                    const isSelected = req.id === activeReq.id;
                    const reqVehicleType = (driverProfile?.vehicletype || req.vehicleType || 'mini').toUpperCase();
                    const reqEmoji = reqVehicleType === 'AUTO' ? '🛺' : reqVehicleType === 'BIKE' ? '🛵' : '🚗';
                    return (
                      <div
                        key={req.id}
                        onClick={() => {
                          setIncomingRequest(req);
                          if (req.pickupCoords) {
                            fetchRoute(driverPosition, req.pickupCoords);
                          }
                        }}
                        className={`cursor-pointer rounded-2xl p-2.5 flex flex-col items-center justify-center min-w-[70px] transition-all border ${
                          isSelected
                            ? 'bg-white text-black border-emerald-500 shadow-xl ring-2 ring-emerald-500'
                            : 'bg-white/95 text-zinc-800 border-zinc-200 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="relative mb-1">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-sm shadow-inner">
                            {reqEmoji}
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-emerald-600 absolute -right-1 -bottom-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                          )}
                        </div>
                        <span className="font-extrabold text-sm text-black tracking-tight">₹{req.price?.toFixed(0) || '210'}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Main Order Card */}
              <div className="flex-1 bg-zinc-900 text-white rounded-3xl p-5 shadow-2xl border border-zinc-800 transition-all transform animate-in slide-in-from-bottom duration-300">
                {/* Header: Driver Vehicle Icon + Total Fare + Tip & Stops Badges */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-2xl text-black shadow-md border border-emerald-400">
                      {activeEmoji}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-emerald-400 tracking-tight">₹{totalFareFormatted}</span>
                      {calculatedTip > 0 && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-xs font-extrabold px-2.5 py-1 rounded-full border border-emerald-500/30 shadow-sm animate-pulse">
                          +₹{calculatedTip} Tip
                        </span>
                      )}
                    </div>
                  </div>
                  {activeReq.stops && Array.isArray(activeReq.stops) && activeReq.stops.length > 0 && (
                    <span className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-xs font-black px-3 py-1 rounded-full">
                      📍 {activeReq.stops.length} STOP{activeReq.stops.length > 1 ? 'S' : ''}
                    </span>
                  )}
                </div>

                {/* Vertical Timeline Addresses (Pickup -> Intermediate Stops -> Dropoff) */}
                <div className="relative pl-6 space-y-4 mb-5">
                  {/* Vertical Connecting Line */}
                  <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] bg-zinc-750 rounded-full" />

                  {/* Pickup Location */}
                  <div className="relative flex flex-col">
                    <div className="absolute -left-[24px] top-1 w-3.5 h-3.5 rounded-full border-2 border-emerald-400 bg-zinc-900 flex items-center justify-center shadow-sm">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    </div>
                    <h3 className="font-bold text-zinc-100 text-base leading-tight truncate">
                      {activeReq.pickup.split(',')[0]}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate mt-0.5 font-normal">
                      {activeReq.pickup.split(',').slice(1).join(',').trim() || activeReq.pickup}
                    </p>
                  </div>

                  {/* Intermediate Stops */}
                  {activeReq.stops && Array.isArray(activeReq.stops) && activeReq.stops.map((stop: any, idx: number) => {
                    const addressStr = typeof stop === 'string' ? stop : stop.address;
                    if (!addressStr) return null;
                    return (
                      <div key={idx} className="relative flex flex-col pt-1">
                        <div className="absolute -left-[24px] top-2 w-3.5 h-3.5 rounded-full border-2 border-cyan-400 bg-zinc-900 flex items-center justify-center shadow-sm">
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[9px] font-black uppercase text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/30">
                            Stop {idx + 1}
                          </span>
                          <h3 className="font-bold text-zinc-200 text-sm leading-tight truncate">
                            {addressStr.split(',')[0]}
                          </h3>
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5 font-normal">
                          {addressStr.split(',').slice(1).join(',').trim() || addressStr}
                        </p>
                      </div>
                    );
                  })}

                  {/* Dropoff Location */}
                  <div className="relative flex flex-col pt-1">
                    <div className="absolute -left-[24px] top-2 w-3.5 h-3.5 rounded-full border-2 border-rose-500 bg-zinc-900 flex items-center justify-center shadow-sm">
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                    </div>
                    <h3 className="font-bold text-zinc-100 text-base leading-tight truncate">
                      {activeReq.destination.split(',')[0]}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate mt-0.5 font-normal">
                      {activeReq.destination.split(',').slice(1).join(',').trim() || activeReq.destination}
                    </p>
                  </div>
                </div>

                {/* Metrics Bar (Pickup Distance & Drop Distance) */}
                <div className="grid grid-cols-2 gap-4 py-3 px-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 mb-5">
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 block mb-0.5">Pickup</span>
                    <span className="text-base font-extrabold text-emerald-400">{pickupDist} Km</span>
                  </div>
                  <div className="border-l border-zinc-800 pl-4">
                    <span className="text-xs font-semibold text-zinc-400 block mb-0.5">Drop</span>
                    <span className="text-base font-extrabold text-white">{dropDist} Km</span>
                  </div>
                </div>

                {/* Action Buttons: Decline (X) & Emerald Green Accept with Countdown Circle */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (activeReq) {
                        setDeclinedRides(prev => [...prev, activeReq.id]);
                        setAvailableRequests(prev => prev.filter(r => r.id !== activeReq.id));
                        if (incomingRequest?.id === activeReq.id) {
                          const remaining = availableRequests.filter(r => r.id !== activeReq.id);
                          if (remaining.length > 0) {
                            setIncomingRequest(remaining[0]);
                          } else {
                            setIncomingRequest(null);
                            setAppState('online');
                          }
                        }
                      }
                    }}
                    className="w-14 h-14 rounded-2xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors shadow-md shrink-0"
                    title="Decline Request"
                  >
                    <svg className="w-6 h-6 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <button
                    onClick={() => {
                      setIncomingRequest(activeReq);
                      handleAccept();
                    }}
                    className="flex-1 h-14 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xl rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.99]"
                  >
                    <span>Accept</span>
                    <div className="w-9 h-9 rounded-full bg-black/90 text-emerald-400 font-black text-sm flex items-center justify-center shadow-md border border-emerald-500/40">
                      {requestCountdown}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Accepted (Navigating to Pickup) */}
      {appState === 'accepted' && currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
             <div className="mb-6">
               <p className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">Navigating to Pickup</p>
               <h2 className="text-2xl font-bold text-black truncate">{currentRide.pickup}</h2>
               {currentRide.riderPhone && (
                 <a href={`tel:${currentRide.riderPhone}`} className="inline-block mt-2 text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                   📞 Call {currentRide.riderName || 'Rider'}: {currentRide.riderPhone}
                 </a>
               )}
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={cancelRide} 
                  className="w-1/3 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold py-4 rounded-xl transition text-sm">
                  Cancel
                </button>
               <button 
                 onClick={handleArrived} 
                 className="flex-1 bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors text-lg shadow-lg">
                 I've Arrived
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Arrived (Waiting for Rider) */}
      {appState === 'arrived' && currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
             <div className="mb-6 text-center">
               <div className="inline-block p-3 bg-blue-100 rounded-full mb-3">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
               </div>
               <h2 className="text-2xl font-bold text-black">Enter OTP</h2>
               <p className="text-zinc-500 text-sm mt-1">Ask the rider for their 4-digit PIN.</p>
               {currentRide.riderPhone && (
                 <a href={`tel:${currentRide.riderPhone}`} className="inline-block mt-2 text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                   📞 Call {currentRide.riderName || 'Rider'}: {currentRide.riderPhone}
                 </a>
               )}
               
               {otpError && <p className="text-red-600 font-bold text-sm mt-3 animate-pulse">{otpError}</p>}
               
               <input 
                 type="text" 
                 value={otpInput} 
                 onChange={(e) => {
                   setOtpInput(e.target.value);
                   setOtpError('');
                 }} 
                 maxLength={4}
                 placeholder="0000"
                 className="w-full text-center mt-4 text-black text-4xl font-bold tracking-[0.3em] py-4 bg-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
               />
             </div>
             <div className="flex gap-2">
               <button 
                 onClick={cancelRide} 
                 className="w-1/3 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold py-4 rounded-xl transition text-sm">
                 Cancel
               </button>
               <button onClick={handleStartRide} disabled={otpInput.length !== 4} className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg shadow-blue-900/30 disabled:opacity-50">
                 Start Ride
               </button>
             </div>
          </div>
        </div>
      )}

      {/* In Transit (Navigating to Dropoff) */}
      {appState === 'in_transit' && currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
             <div className="mb-6">
               <p className="text-green-600 text-xs font-bold uppercase tracking-wider mb-1">Navigating to Dropoff</p>
               <h2 className="text-2xl font-bold text-black truncate">{currentRide.destination}</h2>
               {currentRide.riderPhone && (
                 <a href={`tel:${currentRide.riderPhone}`} className="inline-block mt-2 text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                   📞 Call {currentRide.riderName || 'Rider'}: {currentRide.riderPhone}
                 </a>
               )}
             </div>
             <div className="flex gap-2">
               <button 
                 onClick={cancelRide} 
                 className="w-1/3 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold py-4 rounded-xl transition text-sm">
                 Cancel
               </button>
               <button 
                 onClick={handleCompleteRide} 
                 className="flex-1 bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors text-lg shadow-lg shadow-green-900/30">
                 Complete Ride
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Completed (Summary & Cash) */}
      {appState === 'completed' && currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto text-center">
             <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
                <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
             </div>
             <h2 className="text-2xl font-bold text-white mb-1">Ride Completed!</h2>
             <p className="text-zinc-400 text-sm mb-6">Please collect cash from the rider.</p>
             
             <div className="bg-black border border-zinc-800 p-6 rounded-2xl mb-6">
               <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Total Fare (Cash)</p>
               <p className="text-5xl font-black text-white">₹{currentRide.price?.toFixed(0)}</p>
             </div>
             
             <button onClick={resetToOnline} className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors text-lg">
               Done
             </button>
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
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-blue-400 overflow-hidden">
                       {(() => {
                         let photoUrl = '';
                         if (driverProfile?.documents) {
                           if (typeof driverProfile.documents === 'string') {
                             try { photoUrl = JSON.parse(driverProfile.documents).driverPhotoUrl; } catch(e){}
                           } else {
                             photoUrl = driverProfile.documents.driverPhotoUrl;
                           }
                         }
                         if (photoUrl) {
                           return <img src={photoUrl.replace('/object/public/', '/render/image/public/') + '?width=200&height=200&format=webp'} alt="Profile" className="w-full h-full object-cover" />;
                         }
                         return driverProfile?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'D';
                       })()}
                    </div>
                     <div>
                        <h2 className="text-xl font-bold text-white">{driverProfile?.name || 'Driver'}</h2>
                        <p className="text-zinc-400 text-sm flex items-center mt-1">{avgRating} ★ Rating ({ratedRides.length} reviews)</p>
                     </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                 <button onClick={() => { setActiveModal('history'); setIsSidebarOpen(false); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">🕒</span><span>Ride History</span>
                 </button>
                 <button onClick={() => { setActiveModal('earnings'); setIsSidebarOpen(false); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">💰</span><span>Earnings</span>
                 </button>
                 <button onClick={() => { setActiveModal('settings'); setIsSidebarOpen(false); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">⚙️</span><span>Settings</span>
                 </button>
                 <button onClick={() => { setActiveModal('help'); setIsSidebarOpen(false); }} className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
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
      
      {/* Modals */}
      {activeModal !== 'none' && (
        <div className="absolute inset-0 z-[3000] flex flex-col bg-zinc-950 animate-slide-in">
           <div className="p-4 border-b border-zinc-800 flex items-center">
              <button onClick={() => setActiveModal('none')} className="p-2 mr-4 bg-zinc-900 rounded-full hover:bg-zinc-800 transition">
                 <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              </button>
              <h1 className="text-2xl font-bold text-white capitalize">
                {activeModal === 'help' ? 'Help & Support' : activeModal}
              </h1>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4">
              {activeModal === 'history' && (
                <div className="space-y-4">
                  {completedRides.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500">No completed rides yet.</div>
                  ) : (
                    completedRides.map(ride => (
                      <div key={ride.id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                        <div className="flex justify-between items-start mb-2">
                           <div className="text-zinc-400 text-sm">
                              {ride.timestamp ? new Date(ride.timestamp.seconds * 1000).toLocaleDateString() : 'Unknown Date'}
                           </div>
                           <div className="font-bold text-green-500">₹{ride.price?.toFixed(0)}</div>
                        </div>
                        <div className="text-white text-sm">
                           <div className="mb-1"><span className="text-zinc-500">From:</span> {ride.pickup}</div>
                           <div><span className="text-zinc-500">To:</span> {ride.destination}</div>
                        </div>
                        {ride.rating && (
                          <div className="mt-3 pt-3 border-t border-zinc-800">
                            <div className="text-yellow-400 font-bold mb-1">
                              {'★'.repeat(ride.rating)}{'☆'.repeat(5 - ride.rating)}
                            </div>
                            {ride.review && <p className="text-zinc-400 text-sm italic">"{ride.review}"</p>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
              
              {activeModal === 'earnings' && (
                <div className="space-y-6">
                  <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl text-center">
                    <p className="text-zinc-500 uppercase text-xs font-bold tracking-wider mb-2">Total Lifetime Earnings</p>
                    <h2 className="text-5xl font-black text-green-500">
                      ₹{completedRides.reduce((acc, ride) => acc + (ride.price || 0), 0).toFixed(0)}
                    </h2>
                  </div>
                  <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex justify-between items-center mt-4">
                     <div>
                         <h3 className="font-bold text-white text-xs break-all max-w-[200px] whitespace-normal">
                           {driverProfile ? `DEBUG: ${JSON.stringify(driverProfile)}` : '🚨 DRIVER PROFILE IS NULL'}
                         </h3>
                         <p className="text-zinc-400 text-sm flex items-center mt-1">
                            {driverProfile?.rating?.toFixed(1) || '5.0'} <span className="text-yellow-500 mx-1">★</span> Rating ({driverProfile?.totalreviews || 0} reviews)
                         </p>
                      </div>
                     <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center">
                        <span className="text-2xl text-yellow-500">★</span>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center">
                      <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Total Trips</p>
                      <p className="text-2xl font-bold text-white">{completedRides.length}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center">
                      <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Avg Rating</p>
                      <p className="text-2xl font-bold text-white">{avgRating} ★</p>
                    </div>
                  </div>
                </div>
              )}
              
              {activeModal === 'settings' && (
                <div className="space-y-4">
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <h3 className="text-white font-bold mb-4">Vehicle Details</h3>
                    <div className="space-y-2 text-sm">
                      <p className="text-zinc-400">Type: <span className="text-white uppercase">{driverProfile?.vehicleType}</span></p>
                      <p className="text-zinc-400">Number: <span className="text-white">{driverProfile?.vehicleNumber}</span></p>
                      <p className="text-zinc-400">Color: <span className="text-white">{driverProfile?.vehicleColor}</span></p>
                    </div>
                  </div>
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <h3 className="text-white font-bold mb-4">Account</h3>
                    <button className="w-full py-3 bg-zinc-800 text-white rounded-lg font-medium hover:bg-zinc-700 transition">Change Password</button>
                  </div>
                </div>
              )}
              
              {activeModal === 'help' && (
                <div className="space-y-4">
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                     <h3 className="text-white font-bold mb-2">Safety Toolkit</h3>
                     <p className="text-zinc-400 text-sm mb-4">Access emergency services and share your ride details.</p>
                     <button className="w-full py-3 bg-red-500/10 text-red-500 font-bold rounded-lg hover:bg-red-500/20 transition">Emergency SOS</button>
                  </div>
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                     <h3 className="text-white font-bold mb-2">Support Tickets</h3>
                     <p className="text-zinc-400 text-sm mb-4">You have no active support tickets.</p>
                     <button className="w-full py-3 bg-zinc-800 text-white rounded-lg font-medium hover:bg-zinc-700 transition">Contact Support</button>
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
