import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in react-leaflet
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
  const [isRequesting, setIsRequesting] = useState(false)
  
  // Default to a central location (e.g., New York, or can be dynamic based on geolocation)
  const defaultPosition: [number, number] = [40.7128, -74.0060]

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white">
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={defaultPosition} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
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

      {/* UI Overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8 bg-gradient-to-t from-black/90 to-transparent">
        <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">RYVO</h1>
          <p className="text-zinc-400 text-sm mb-6 font-medium">Where to?</p>
          
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Enter pickup location" 
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
            />
            <input 
              type="text" 
              placeholder="Enter destination" 
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white transition-all"
            />
            
            <button 
              onClick={() => setIsRequesting(!isRequesting)}
              className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors mt-2 text-lg"
            >
              {isRequesting ? 'Finding a Driver...' : 'Request Ride'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
