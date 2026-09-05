import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'
import { Geolocation } from '@capacitor/geolocation'

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

interface RideRequest {
  id: string;
  pickup: string;
  destination: string;
  status: string;
  paymentMethod: string;
  price?: number;
  vehicleType?: string;
  pickupCoords?: [number, number];
  destCoords?: [number, number];
  timestamp?: any;
  otp?: string;
  riderPhone?: string;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

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
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [declinedRides, setDeclinedRides] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('declinedRides') || '[]');
    } catch {
      return [];
    }
  })
  const declinedRidesRef = useRef(declinedRides)
  
  useEffect(() => {
    declinedRidesRef.current = declinedRides
    sessionStorage.setItem('declinedRides', JSON.stringify(declinedRides))
  }, [declinedRides])

  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  const [otpInput, setOtpInput] = useState('')
  
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
  
  const [driverPosition, setDriverPosition] = useState<[number, number]>([40.7128, -74.0060])
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  
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
            setFetchError(`Robust fetch Error: ${error.message} (Code: ${error.code})`);
            if (error.code === 'PGRST116') {
               console.warn("Robust fetch: User is not a driver. Forcing logout.");
               await supabase.auth.signOut();
               setUser(null);
            }
          }
          if (data) {
            setDriverProfile(data);
            setAppState(data.isonline ? 'online' : 'idle');
            setIsOnline(data.isonline);
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
                  driverLat: position.coords.latitude,
                  driverLng: position.coords.longitude
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
      .subscribe()
      
    const checkRequests = (requests: any[]) => {
      let foundRequest = false;
      requests.forEach((data) => {
        // Map postgres flat columns to the expected React state interface
        const mappedData = {
          ...data,
          pickupCoords: (data.pickuplat && data.pickuplng) ? [data.pickuplat, data.pickuplng] : undefined,
          destCoords: (data.destlat && data.destlng) ? [data.destlat, data.destlng] : undefined,
          price: typeof data.price === 'string' ? parseFloat(data.price) : data.price
        };
        
        // 1. Vehicle Type Match
        const driverType = (driverProfileRef.current?.vehicletype || 'mini').toLowerCase();
        const requestType = (mappedData.vehicletype || 'mini').toLowerCase();
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
        
        if (!foundRequest && !currentRide && isTypeMatch && isNear && isNotDeclined) {
          setIncomingRequest(mappedData);
          foundRequest = true;
        }
      });
      if (foundRequest) {
        setAppState('incoming')
      } else {
        setAppState('online')
        setIncomingRequest(null);
      }
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOnline, currentRide]);

  // Listen for current ride status changes (like rider cancellation)
  useEffect(() => {
    if (!currentRide) return;
    const channel = supabase.channel(`public:rides:id=eq.${currentRide.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${currentRide.id}` }, payload => {
        const data = payload.new;
        if (data && data.status === 'cancelled') {
          alert("The rider has cancelled the ride request.");
          setCurrentRide(null);
          setAppState('online');
          setRouteGeometry(null);
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`)
      const data = await res.json()
      if (data.code === 'Ok' && data.routes.length > 0) {
        const swappedGeometry = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]])
        setRouteGeometry(swappedGeometry)
      }
    } catch (e) {
      console.error("Routing error", e)
    }
  }

  const handleAccept = async () => {
    if (!incomingRequest) return;
    try {
      await supabase.from('rides').update({
        status: 'accepted',
        driverId: user?.id,
        driverLat: driverPosition[0],
        driverLng: driverPosition[1],
        driverName: driverProfileRef.current?.name || 'Your Driver',
        driverVehicleColor: driverProfileRef.current?.vehiclecolor || 'White',
        driverVehicleNumber: driverProfileRef.current?.vehiclenumber || 'XX-00-0000',
        driverVehicleType: driverProfileRef.current?.vehicletype || 'MINI',
        driverPhone: driverProfileRef.current?.phone || '',
        driverEmail: user?.email || email || '',
        driverRating: avgRating
      }).eq('id', incomingRequest.id);
      
      setCurrentRide(incomingRequest)
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
      alert("Invalid OTP! Please ask the rider for the correct 4-digit code.");
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
                    <input type="text" placeholder="Color (e.g. White)" value={vehicleColor} onChange={e => setVehicleColor(e.target.value)} className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-3" />
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
        <MapContainer center={driverPosition} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <ChangeView center={driverPosition} />
          
          {fetchError && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[3000] bg-red-600 text-white p-4 rounded-xl shadow-2xl font-bold max-w-md w-full">
              🚨 DEBUG ERROR: {fetchError}
            </div>
          )}

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={driverPosition}>
            <Popup>You</Popup>
          </Marker>
          
          {routeGeometry && (
             <Polyline positions={routeGeometry} color="#3b82f6" weight={6} opacity={0.8} />
          )}
          
          {/* Pickup Marker */}
          {(appState === 'accepted' || appState === 'arrived') && currentRide?.pickupCoords && (
            <Marker position={currentRide.pickupCoords}><Popup>Pickup Location</Popup></Marker>
          )}
          
          {/* Destination Marker */}
          {appState === 'in_transit' && currentRide?.destCoords && (
            <Marker position={currentRide.destCoords}><Popup>Dropoff Location</Popup></Marker>
          )}
        </MapContainer>
      </div>

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

      {/* Incoming Request */}
      {appState === 'incoming' && incomingRequest && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-3xl shadow-2xl max-w-md mx-auto animate-bounce shadow-blue-900/50">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping mr-2"></span>
                    New Ride Request
                 </p>
                 <h2 className="text-2xl font-bold text-white mb-1 truncate">{incomingRequest.pickup}</h2>
                 <p className="text-zinc-400 text-sm">Dropoff: {incomingRequest.destination}</p>
               </div>
                 <div className="text-right flex flex-col items-end shrink-0 ml-4">
                 <p className="text-white text-2xl font-black mb-1">₹{incomingRequest.price?.toFixed(0)}</p>
                 <span className="bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-bold px-2 py-1 rounded">CASH</span>
               </div>
             </div>
             
             {incomingRequest.pickupCoords && incomingRequest.destCoords && (
               <div className="flex items-center space-x-4 mb-6 bg-zinc-800/50 p-3 rounded-xl border border-zinc-700">
                  <div className="flex-1 text-center">
                    <p className="text-zinc-400 text-xs uppercase font-bold tracking-wider mb-1">To Pickup</p>
                    <p className="text-white font-bold">{calculateDistance(driverPosition[0], driverPosition[1], incomingRequest.pickupCoords[0], incomingRequest.pickupCoords[1]).toFixed(1)} km</p>
                  </div>
                  <div className="w-px h-8 bg-zinc-700"></div>
                  <div className="flex-1 text-center">
                    <p className="text-zinc-400 text-xs uppercase font-bold tracking-wider mb-1">Trip Dist</p>
                    <p className="text-white font-bold">{calculateDistance(incomingRequest.pickupCoords[0], incomingRequest.pickupCoords[1], incomingRequest.destCoords[0], incomingRequest.destCoords[1]).toFixed(1)} km</p>
                  </div>
               </div>
             )}
             
             <div className="flex space-x-3">
                <button onClick={() => {
                  if (incomingRequest) {
                    setDeclinedRides(prev => [...prev, incomingRequest.id])
                  }
                  setIncomingRequest(null)
                }} className="flex-1 bg-zinc-800 text-white font-bold py-4 rounded-xl hover:bg-zinc-700 transition-colors">
                  Decline
                </button>
                <button onClick={handleAccept} className="flex-[2] bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 transition-colors text-lg shadow-lg shadow-blue-900/50">
                  Accept Ride
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Accepted (Navigating to Pickup) */}
      {appState === 'accepted' && currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
             <div className="mb-6">
               <p className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">Navigating to Pickup</p>
               <h2 className="text-2xl font-bold text-black truncate">{currentRide.pickup}</h2>
               {currentRide.riderPhone && (
                 <a href={`tel:${currentRide.riderPhone}`} className="inline-block mt-2 text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                   📞 Call Rider: {currentRide.riderPhone}
                 </a>
               )}
             </div>
             <button 
               onClick={handleArrived} 
               disabled={!currentRide.pickupCoords || calculateDistance(driverPosition[0], driverPosition[1], currentRide.pickupCoords[0], currentRide.pickupCoords[1]) > 0.1}
               className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed">
               {(!currentRide.pickupCoords || calculateDistance(driverPosition[0], driverPosition[1], currentRide.pickupCoords[0], currentRide.pickupCoords[1]) > 0.1) ? 'Move closer to Pickup' : "I've Arrived"}
             </button>
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
                   📞 Call Rider: {currentRide.riderPhone}
                 </a>
               )}
               
               <input 
                 type="text" 
                 value={otpInput} 
                 onChange={(e) => setOtpInput(e.target.value)} 
                 maxLength={4}
                 placeholder="0000"
                 className="w-full text-center mt-4 text-4xl font-bold tracking-[0.3em] py-4 bg-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
               />
             </div>
             <button onClick={handleStartRide} disabled={otpInput.length !== 4} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg shadow-blue-900/30 disabled:opacity-50">
               Start Ride
             </button>
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
                   📞 Call Rider: {currentRide.riderPhone}
                 </a>
               )}
             </div>
             <button 
               onClick={handleCompleteRide} 
               disabled={!currentRide.destCoords || calculateDistance(driverPosition[0], driverPosition[1], currentRide.destCoords[0], currentRide.destCoords[1]) > 0.1}
               className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors text-lg shadow-lg shadow-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed">
               {(!currentRide.destCoords || calculateDistance(driverPosition[0], driverPosition[1], currentRide.destCoords[0], currentRide.destCoords[1]) > 0.1) ? 'Move closer to Dropoff' : "Complete Ride"}
             </button>
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
