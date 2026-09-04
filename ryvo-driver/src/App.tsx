import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
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
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [isOnline, setIsOnline] = useState(false)
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null)
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  
  const [driverPosition, setDriverPosition] = useState<[number, number]>([40.7128, -74.0060])
  const watchIdRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    return () => unsub()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error: any) {
      alert("Login Failed: " + error.message)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (error: any) {
      alert("Sign Up Failed: " + error.message)
    }
  }

  // Start watching GPS position when online
  useEffect(() => {
    const startWatch = async () => {
      if (isOnline) {
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
    if (!isOnline) {
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
      if (!foundRequest) {
        setIncomingRequest(null);
      }
    });

    return () => unsub();
  }, [isOnline, currentRide]);

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
    } catch(e) {
      console.error("Error accepting ride", e)
    }
  }

  const handleFinish = async () => {
    if (!currentRide) return;
    try {
      await updateDoc(doc(db, "rides", currentRide.id), {
        status: 'completed'
      });
      setCurrentRide(null)
    } catch(e) {
      console.error("Error finishing ride", e)
    }
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
              <button onClick={handleLogin} type="button" className="flex-1 bg-white text-black font-bold py-4 rounded-xl">Login</button>
              <button onClick={handleSignUp} type="button" className="flex-1 bg-zinc-700 text-white font-bold py-4 rounded-xl">Sign Up</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      <div className="absolute inset-0 z-0">
        <MapContainer center={driverPosition} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={driverPosition}>
            <Popup>You are here.</Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">RYVO Driver</h1>
          </div>
          
          {!currentRide && (
            <button 
              onClick={() => setIsOnline(!isOnline)}
              className={`px-6 py-2 rounded-full font-bold transition-colors shadow-lg ${
                isOnline ? 'bg-green-500 text-black' : 'bg-zinc-700 text-white'
              }`}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </button>
          )}
        </div>
      </div>

      {currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-green-600 border border-green-500 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
             <h2 className="text-xl font-bold text-white mb-2">Ride in Progress</h2>
             <p className="text-green-100 text-sm mb-1"><strong>Pickup:</strong> {currentRide.pickup}</p>
             <p className="text-green-100 text-sm mb-4"><strong>Dropoff:</strong> {currentRide.destination}</p>
             
             <div className="bg-green-700 p-4 rounded-xl mb-6 text-center border border-green-500">
               <p className="text-green-100 text-sm mb-1">Collect Cash Amount:</p>
               <p className="font-bold text-white text-3xl">₹{currentRide.price?.toFixed(2) || '0.00'}</p>
             </div>
             
             <button onClick={handleFinish} className="w-full bg-white text-green-700 font-bold py-3 rounded-xl hover:bg-zinc-100 transition-colors">
               Finish Ride & Collect Cash
             </button>
          </div>
        </div>
      )}

      {isOnline && incomingRequest && !currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto animate-bounce">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1">New Request • {incomingRequest.vehicleType || 'MINI'}</p>
                 <h2 className="text-xl font-bold text-white mb-1">{incomingRequest.pickup}</h2>
                 <p className="text-zinc-400 text-sm">to {incomingRequest.destination}</p>
               </div>
               <div className="text-right flex flex-col items-end">
                 <p className="text-white text-xl font-bold mb-1">₹{incomingRequest.price?.toFixed(2) || '---'}</p>
                 <span className="bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">CASH</span>
               </div>
             </div>
             
             <div className="flex space-x-3 mt-6">
                <button onClick={() => setIncomingRequest(null)} className="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition-colors">
                  Decline
                </button>
                <button onClick={handleAccept} className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors">
                  Accept
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
