import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { db, auth } from './firebase'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth'
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
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [isOnline, setIsOnline] = useState(false)
  const [appState, setAppState] = useState<'idle' | 'online' | 'incoming' | 'accepted' | 'arrived' | 'in_transit' | 'completed'>('idle')
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null)
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  
  const [driverPosition, setDriverPosition] = useState<[number, number]>([40.7128, -74.0060])
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  
  const watchIdRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    return () => unsub()
  }, [])

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
    try {
      await createUserWithEmailAndPassword(auth, email, password)
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
        if (!foundRequest && !currentRide) {
          setIncomingRequest({ id: doc.id, ...doc.data() } as RideRequest);
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
        driverLng: driverPosition[1]
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
          <form className="space-y-4">
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
            <div className="flex space-x-3">
              <button onClick={handleLogin} type="button" className="flex-1 bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200">Login</button>
              <button onClick={handleSignUp} type="button" className="flex-1 bg-zinc-700 text-white font-bold py-4 rounded-xl hover:bg-zinc-600">Sign Up</button>
            </div>
          </form>
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
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
          <div className="bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-zinc-800">
             <h1 className="text-xl font-bold tracking-tight text-white">RYVO</h1>
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
             <button onClick={handleArrived} className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors text-lg">
               I've Arrived
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
               <h2 className="text-2xl font-bold text-black">Waiting for Rider</h2>
               <p className="text-zinc-500 text-sm mt-1">Please confirm when the rider is in your vehicle.</p>
             </div>
             <button onClick={handleStartRide} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg shadow-blue-900/30">
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
             <button onClick={handleCompleteRide} className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors text-lg shadow-lg shadow-green-900/30">
               Complete Ride
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

    </div>
  )
}

export default App
