import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

import { db } from './firebase'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'

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
}

function App() {
  const [isOnline, setIsOnline] = useState(false)
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null)
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null)
  
  const defaultPosition: [number, number] = [40.7128, -74.0060]

  useEffect(() => {
    if (!isOnline) {
      setIncomingRequest(null)
      return
    }

    // Listen for pending rides
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
        status: 'accepted'
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

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      <div className="absolute inset-0 z-0">
        <MapContainer center={defaultPosition} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={defaultPosition}>
            <Popup>You are here.</Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">RYVO Driver</h1>
            <p className="text-zinc-300 text-sm font-medium">Earnings: $142.50</p>
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
             <p className="text-green-100 text-sm mb-6"><strong>Dropoff:</strong> {currentRide.destination}</p>
             
             <button onClick={handleFinish} className="w-full bg-white text-green-700 font-bold py-3 rounded-xl hover:bg-zinc-100 transition-colors">
               Finish Ride
             </button>
          </div>
        </div>
      )}

      {isOnline && incomingRequest && !currentRide && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto animate-bounce">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1">New Request</p>
                 <h2 className="text-xl font-bold text-white mb-1">{incomingRequest.pickup}</h2>
                 <p className="text-zinc-400 text-sm">to {incomingRequest.destination}</p>
               </div>
               <div className="text-right">
                 <p className="text-white text-xl font-bold">Est. $12.50</p>
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
