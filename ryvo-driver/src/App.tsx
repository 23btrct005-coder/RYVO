import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

function App() {
  const [isOnline, setIsOnline] = useState(false)
  
  // Default to a central location
  const defaultPosition: [number, number] = [40.7128, -74.0060]

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={defaultPosition} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={defaultPosition}>
            <Popup>
              You are here.
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Top Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">RYVO Driver</h1>
            <p className="text-zinc-300 text-sm font-medium">Earnings: $142.50</p>
          </div>
          
          <button 
            onClick={() => setIsOnline(!isOnline)}
            className={`px-6 py-2 rounded-full font-bold transition-colors ${
              isOnline ? 'bg-green-500 text-black' : 'bg-zinc-700 text-white'
            }`}
          >
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </div>

      {/* Incoming Request Mockup (Only shows when online for demo) */}
      {isOnline && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto animate-bounce">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1">New Request</p>
                 <h2 className="text-xl font-bold text-white">3 mins away</h2>
               </div>
               <div className="text-right">
                 <p className="text-green-400 text-xl font-bold">Est. $12.50</p>
               </div>
             </div>
             
             <div className="flex space-x-3 mt-6">
                <button className="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition-colors">
                  Decline
                </button>
                <button className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors">
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
