import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { db, auth } from './firebase'
import { collection, addDoc, onSnapshot, doc } from 'firebase/firestore'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth'

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [status, setStatus] = useState<'idle' | 'estimating' | 'confirming' | 'searching' | 'accepted'>('idle')
  const [currentRideId, setCurrentRideId] = useState<string | null>(null)
  
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)

  const defaultPosition: [number, number] = [40.7128, -74.0060] // Needs to be dynamic ideally

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
    } catch (error) {
      try {
        await createUserWithEmailAndPassword(auth, email, password)
      } catch (err: any) {
        alert(err.message)
      }
    }
  }

  const geocode = async (query: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      }
      return null
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const handleEstimate = async () => {
    if (!pickup || !destination) {
      alert("Please enter pickup and destination")
      return
    }

    setStatus('estimating')

    // 1. Geocode
    const pickupCoords = await geocode(pickup)
    const destCoords = await geocode(destination)

    if (!pickupCoords || !destCoords) {
      alert("Could not find locations. Try being more specific.")
      setStatus('idle')
      return
    }

    // 2. Get Route from OSRM
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson`)
      const data = await res.json()
      
      if (data.code === 'Ok' && data.routes.length > 0) {
        const route = data.routes[0]
        const distanceKm = route.distance / 1000
        
        // 3. Calculate Price (₹50 base + ₹15/km)
        const price = Math.max(50.00, 50.00 + (distanceKm * 15.00))
        setEstimatedPrice(price)
        
        // OSRM returns [lon, lat], Leaflet wants [lat, lon]
        const swappedGeometry = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]])
        setRouteGeometry(swappedGeometry)
        
        setStatus('confirming')
      } else {
        alert("Could not calculate route.")
        setStatus('idle')
      }
    } catch (e) {
       alert("Routing error")
       setStatus('idle')
    }
  }

  const handleConfirmRide = async () => {
    setStatus('searching')
    try {
      const docRef = await addDoc(collection(db, "rides"), {
        riderId: user?.uid,
        pickup: pickup,
        destination: destination,
        status: 'pending',
        timestamp: new Date(),
        paymentMethod: 'CASH',
        price: estimatedPrice
      });
      setCurrentRideId(docRef.id)
    } catch (e) {
      console.error("Error adding document: ", e);
      setStatus('idle')
    }
  }

  // Listen for driver acceptance and driver location
  useEffect(() => {
    if (!currentRideId) return;

    const unsub = onSnapshot(doc(db, "rides", currentRideId), (docSnap) => {
      const data = docSnap.data();
      if (data && data.status === 'accepted') {
        setStatus('accepted')
        if (data.driverLat && data.driverLng) {
           setDriverLocation([data.driverLat, data.driverLng])
        }
      }
    });

    return () => unsub();
  }, [currentRideId]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white w-full">
        <div className="p-8 max-w-md w-full bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800">
          <h1 className="text-4xl font-bold text-center mb-8">RYVO Rider</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
            <button type="submit" className="w-full bg-white text-black font-bold py-4 rounded-xl">Login / Sign Up</button>
          </form>
          <button onClick={() => alert("Phone Auth requires Firebase Console Setup. Use email for now.")} className="w-full mt-4 bg-zinc-800 text-white font-bold py-4 rounded-xl">Login with Phone</button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      <div className="absolute inset-0 z-0">
        <MapContainer center={defaultPosition} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={defaultPosition}>
            <Popup>You are here.</Popup>
          </Marker>
          
          {routeGeometry && (
             <Polyline positions={routeGeometry} color="black" weight={6} opacity={0.8} />
          )}

          {driverLocation && (
            <Marker position={driverLocation}>
              <Popup>Driver is here</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8 bg-gradient-to-t from-black/90 to-transparent">
        <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">RYVO</h1>
          
          {status === 'accepted' ? (
             <div className="text-center py-4">
               <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
                  <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
               </div>
               <h2 className="text-2xl font-bold text-white mb-2">Driver is on the way!</h2>
               <p className="text-zinc-400">Payment: Cash after drop</p>
             </div>
          ) : status === 'searching' ? (
            <div className="text-center py-8">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
               <p className="text-zinc-300 font-medium animate-pulse">Finding a nearby driver...</p>
            </div>
          ) : status === 'confirming' ? (
            <div className="text-center py-4">
               <h2 className="text-3xl font-bold text-white mb-2">₹{estimatedPrice?.toFixed(2)}</h2>
               <p className="text-zinc-400 mb-6">Estimated fare (Cash)</p>
               <button 
                  onClick={handleConfirmRide}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Confirm Ride
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
              <p className="text-zinc-400 text-sm mb-6 font-medium">Where to?</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup location (e.g., Brooklyn, NY)" 
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                />
                <input 
                  type="text" 
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Enter destination (e.g., Queens, NY)" 
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                />
                
                <button 
                  onClick={handleEstimate}
                  disabled={status === 'estimating'}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors mt-2 text-lg disabled:opacity-50"
                >
                  {status === 'estimating' ? 'Calculating...' : 'See Prices'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
