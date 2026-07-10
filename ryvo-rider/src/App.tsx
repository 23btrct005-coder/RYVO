import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { db } from './firebase'
import { collection, addDoc, onSnapshot, doc } from 'firebase/firestore'

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

function App() {
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [status, setStatus] = useState<'idle' | 'searching' | 'accepted'>('idle')
  const [currentRideId, setCurrentRideId] = useState<string | null>(null)
  
  const defaultPosition: [number, number] = [40.7128, -74.0060]

  const handleRequestRide = async () => {
    if (!pickup || !destination) {
      alert("Please enter pickup and destination")
      return
    }

    setStatus('searching')

    try {
      // Create ride request in Firestore
      const docRef = await addDoc(collection(db, "rides"), {
        pickup: pickup,
        destination: destination,
        status: 'pending',
        timestamp: new Date()
      });
      setCurrentRideId(docRef.id)
    } catch (e) {
      console.error("Error adding document: ", e);
      setStatus('idle')
    }
  }

  // Listen for driver acceptance
  useEffect(() => {
    if (!currentRideId) return;

    const unsub = onSnapshot(doc(db, "rides", currentRideId), (doc) => {
      const data = doc.data();
      if (data && data.status === 'accepted') {
        setStatus('accepted')
      }
    });

    return () => unsub();
  }, [currentRideId]);

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      <div className="absolute inset-0 z-0">
        <MapContainer center={defaultPosition} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={defaultPosition}>
            <Popup>You are here.</Popup>
          </Marker>
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
               <p className="text-zinc-400">Please wait at the pickup location.</p>
               <button onClick={() => { setStatus('idle'); setPickup(''); setDestination(''); setCurrentRideId(null) }} className="w-full bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition-colors mt-6">
                 Start New Ride
               </button>
             </div>
          ) : status === 'searching' ? (
            <div className="text-center py-8">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
               <p className="text-zinc-300 font-medium animate-pulse">Finding a nearby driver...</p>
            </div>
          ) : (
            <>
              <p className="text-zinc-400 text-sm mb-6 font-medium">Where to?</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup location" 
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                />
                <input 
                  type="text" 
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Enter destination" 
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                />
                
                <button 
                  onClick={handleRequestRide}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors mt-2 text-lg"
                >
                  Request Ride
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
