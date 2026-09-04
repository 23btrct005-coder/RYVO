import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { db, auth } from './firebase'
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
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

  const [isOnline, setIsOnline] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [appState, setAppState] = useState<'idle' | 'online' | 'incoming' | 'accepted' | 'arrived' | 'in_transit' | 'completed'>('idle')
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null)
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  const [otpInput, setOtpInput] = useState('')
  
  const [activeModal, setActiveModal] = useState<'none' | 'history' | 'earnings' | 'settings' | 'help'>('none')
  const [completedRides, setCompletedRides] = useState<any[]>([])
  
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
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        const docSnap = await getDoc(doc(db, "drivers", currentUser.uid))
        if (docSnap.exists()) {
          setDriverProfile(docSnap.data())
        }
      } else {
        setDriverProfile(null)
      }
    })
    return () => unsub()
  }, [])
  
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, "rides"),
      where("driverId", "==", user.uid),
      where("status", "==", "completed")
    )
    const unsub = onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      // Sort descending by timestamp manually to avoid requiring a composite index immediately
      rides.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
      setCompletedRides(rides)
    }, (error) => {
      console.error("Error fetching completed rides:", error)
    })
    return () => unsub()
  }, [user])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      alert("Please enter both your email and password.")
      return
    }
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error: any) {
      alert("Login Failed: " + error.message)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
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
    if (!name || !phone || !vehicleColor || !vehicleNumber) {
      alert("Please fill in all details.")
      return
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      
      const profileData = {
        name,
        phone,
        email,
        vehicleType,
        vehicleColor,
        vehicleNumber,
        createdAt: new Date()
      }
      await setDoc(doc(db, "drivers", userCredential.user.uid), profileData)
      setDriverProfile(profileData)
    } catch (error: any) {
      alert("Sign Up Failed: " + error.message)
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
                updateDoc(doc(db, "rides", currentRide.id), {
                  driverLat: position.coords.latitude,
                  driverLng: position.coords.longitude
                })
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

    const q = query(collection(db, "rides"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (querySnapshot) => {
      let foundRequest = false;
      querySnapshot.forEach((doc) => {
        const data = doc.data() as RideRequest;
        
        // 1. Vehicle Type Match
        const driverType = (driverProfileRef.current?.vehicleType || 'mini').toLowerCase();
        const requestType = (data.vehicleType || 'mini').toLowerCase();
        const isTypeMatch = driverType === requestType;

        // 2. Distance check (<= 5km)
        let isNear = false;
        if (data.pickupCoords) {
           const dist = calculateDistance(
             driverPositionRef.current[0], 
             driverPositionRef.current[1], 
             data.pickupCoords[0], 
             data.pickupCoords[1]
           );
           if (dist <= 5.0) {
             isNear = true;
           }
        }
        
        if (!foundRequest && !currentRide && isTypeMatch && isNear) {
          setIncomingRequest({ ...data, id: doc.id });
          foundRequest = true;
        }
      });
      if (foundRequest) {
        setAppState('incoming')
      } else {
        setAppState('online')
        setIncomingRequest(null);
      }
    });

    return () => unsub();
  }, [isOnline, currentRide]);

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
      await updateDoc(doc(db, "rides", incomingRequest.id), {
        status: 'accepted',
        driverId: user?.uid,
        driverLat: driverPosition[0],
        driverLng: driverPosition[1],
        driverName: driverProfileRef.current?.name || 'Your Driver',
        driverVehicleColor: driverProfileRef.current?.vehicleColor || 'White',
        driverVehicleNumber: driverProfileRef.current?.vehicleNumber || 'XX-00-0000',
        driverPhone: driverProfileRef.current?.phone || '',
        driverEmail: user?.email || email || ''
      });
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
      await updateDoc(doc(db, "rides", currentRide.id), { status: 'arrived' });
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
      await updateDoc(doc(db, "rides", currentRide.id), { status: 'in_transit' });
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
      await updateDoc(doc(db, "rides", currentRide.id), { status: 'completed' });
      setAppState('completed')
      setRouteGeometry(null)
    } catch(e) {}
  }
  
  const resetToOnline = () => {
    setCurrentRide(null)
    setAppState('online')
  }

  const toggleOnline = () => {
    const newState = !isOnline
    setIsOnline(newState)
    setAppState(newState ? 'online' : 'idle')
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
            <form onSubmit={handleSignUp} className="space-y-4">
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
              
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 mt-2">Create Driver Account</button>
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
                <button onClick={() => setIncomingRequest(null)} className="flex-1 bg-zinc-800 text-white font-bold py-4 rounded-xl hover:bg-zinc-700 transition-colors">
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
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-blue-400">
                       {driverProfile?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'D'}
                    </div>
                    <div>
                       <h2 className="text-xl font-bold text-white">{driverProfile?.name || 'Driver'}</h2>
                       <p className="text-zinc-400 text-sm">4.9 ★ Rating</p>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center">
                      <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Total Trips</p>
                      <p className="text-2xl font-bold text-white">{completedRides.length}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center">
                      <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Avg Rating</p>
                      <p className="text-2xl font-bold text-white">4.9 ★</p>
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
