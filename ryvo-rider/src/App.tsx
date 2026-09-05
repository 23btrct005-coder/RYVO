import { useState, useEffect } from 'react'
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

const createVehicleIcon = (type: string) => {
  let emoji = '🚗'; // default MINI
  if (type.toUpperCase() === 'AUTO') emoji = '🛺';
  if (type.toUpperCase() === 'BIKE') emoji = '🛵';
  
  return L.divIcon({
    html: `<div style="background-color: white; border: 2px solid #3b82f6; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">${emoji}</div>`,
    className: 'custom-vehicle-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

type VehicleType = 'bike' | 'auto' | 'mini'

interface Suggestion {
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
}

// A simple component to re-center the map when position changes
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [riderProfile, setRiderProfile] = useState<any>(null)
  
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [status, setStatus] = useState<'idle' | 'estimating' | 'confirming' | 'searching' | 'accepted' | 'arrived' | 'in_transit' | 'completed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentRideId, setCurrentRideId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null)
  const [driverDetails, setDriverDetails] = useState<any>(null)
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const [distance, setDistance] = useState<number>(0)
  const [otp, setOtp] = useState<string | null>(null)
  
  const [rating, setRating] = useState<number>(0)
  const [review, setReview] = useState<string>('')
  const [hasRated, setHasRated] = useState<boolean>(false)
  
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([])
  
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('mini')
  
  const [currentPosition, setCurrentPosition] = useState<[number, number]>([40.7128, -74.0060])

  const [pickupSuggestions, setPickupSuggestions] = useState<Suggestion[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([])

  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (!currentUser) {
        setRiderProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Robust fetch: If we have a user from getSession but riderProfile is still null, fetch it
  useEffect(() => {
    if (user && !riderProfile) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase.from('riders').select('*').eq('id', user.id).single();
          if (error) {
            console.error("Robust fetch error:", error);
            if (error.code === 'PGRST116') {
               console.warn("User is not a rider. Forcing logout.");
               await supabase.auth.signOut();
               setUser(null);
            }
          }
          if (data) {
            setRiderProfile(data);
          }
        } catch (e: any) {
          console.error("Robust fetch exception:", e);
        }
      };
      fetchProfile();
    }
  }, [user?.id]);

  // Fetch current location on load
  useEffect(() => {
    const getLocation = async () => {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        setCurrentPosition([lat, lon])
        setPickupCoords([lat, lon])
        
        // Reverse geocode to get a readable address for Pickup
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
        const data = await res.json()
        if (data && data.address) {
           const main = data.address.road || data.address.suburb || data.address.neighbourhood || data.name || "Current Location";
           setPickup(main)
        } else {
           setPickup("Current Location")
        }
      } catch(e) {
        console.error("Error getting location", e)
      }
    }
    getLocation()
  }, [])

  // Listen for online drivers in real-time
  useEffect(() => {
    if (!user || (status !== 'idle' && status !== 'estimating')) return;
    
    const fetchDrivers = async () => {
      const { data } = await supabase.from('drivers').select('*').eq('isonline', true)
      if (data) setOnlineDrivers(data)
    }
    fetchDrivers()
    
    const channel = supabase.channel('public:drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchDrivers()
      })
      .subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [user, status])

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
        // Verify this user is actually a rider
        const { data: riderData } = await supabase
          .from('riders')
          .select('id')
          .eq('id', data.user.id)
          .single()
          
        if (!riderData) {
          await supabase.auth.signOut()
          alert("Access Denied: You do not have a Rider profile. If you are a Driver, please use a different email to register as a Rider.")
        }
      }
    } catch (error: any) {
      alert("Login Failed: " + error.message)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
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
    if (!name || !phone) {
      alert("Please fill in your name and phone number.")
      return
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error;
      
      const uid = data.user?.id
      if (!uid) throw new Error("No UID returned")
      
      // Save rider profile
      const { error: dbError } = await supabase.from('riders').insert([{
        id: uid,
        name,
        phone,
        email
      }])
      
      if (dbError) throw dbError;
    } catch (error: any) {
      alert("Sign Up Failed: " + error.message)
    }
  }

  // Fetch suggestions using Photon API
  const fetchSuggestions = async (query: string, setter: (s: Suggestion[]) => void) => {
    if (query.length < 3) {
      setter([])
      return
    }
    try {
      // Prioritize results near current position
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=${currentPosition[0]}&lon=${currentPosition[1]}`)
      const data = await res.json()
      if (data && data.features) {
        const results = data.features.map((f: any) => {
           const title = f.properties.name || f.properties.street || f.properties.city || "Unknown Location";
           const subtitleParts = [f.properties.district, f.properties.city, f.properties.state].filter(Boolean);
           return {
              title: title,
              subtitle: subtitleParts.join(', '),
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0]
           }
        }).filter((s: Suggestion) => s.title)
        setter(results)
      }
    } catch (e) {
      setter([])
    }
  }

  const handleEstimate = async () => {
    if (!pickup || !destination || !pickupCoords || !destCoords) {
      alert("Please select pickup and destination from the suggestions")
      return
    }

    setStatus('estimating')

    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson`)
      const data = await res.json()
      
      if (data.code === 'Ok' && data.routes.length > 0) {
        const route = data.routes[0]
        const distanceKm = route.distance / 1000
        
        setDistance(distanceKm)
        
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
  
  const getPrice = (type: VehicleType, distKm: number) => {
    switch(type) {
      case 'bike': return Math.max(20, 20 + (distKm * 8))
      case 'auto': return Math.max(30, 30 + (distKm * 12))
      case 'mini': return Math.max(50, 50 + (distKm * 15))
      default: return 0
    }
  }

  const cancelRide = async () => {
    setStatus('idle');
    setCurrentRideId(null);
    setDriverDetails(null);
    setDriverLocation(null);
    setRouteGeometry(null);
    
    if (!currentRideId) return;
    try {
      const { error } = await supabase.from('rides').update({
        status: 'cancelled'
      }).eq('id', currentRideId);
      
      if (error) console.error("Cancel update error:", error);
    } catch(e) {
      console.error("Cancel failed", e);
    }
  }

  const handleConfirmRide = async () => {
    setStatus('searching')
    setErrorMessage(null)
    console.log("Confirm Ride clicked. Attempting to insert into 'rides' table...");
    
    try {
      const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
      setOtp(generatedOtp);

      const rideData = {
        riderid: user?.id,
        pickup: pickup,
        destination: destination,
        pickuplat: pickupCoords?.[0],
        pickuplng: pickupCoords?.[1],
        destlat: destCoords?.[0],
        destlng: destCoords?.[1],
        status: 'pending',
        vehicletype: selectedVehicle,
        price: getPrice(selectedVehicle, distance),
        distance: distance,
        otp: generatedOtp
      };

      const { data, error } = await supabase.from('rides').insert([rideData]).select().single();
      
      if (error) throw error;

      console.log("Successfully wrote to Supabase with ID:", data.id);
      setCurrentRideId(data.id)
    } catch (e: any) {
      console.error("Error adding document: ", e);
      setErrorMessage("Network error: Could not reach Supabase.")
      setStatus('idle')
    }
  }

  useEffect(() => {
    if (!currentRideId) return;
    
    const fetchRide = async () => {
      const { data } = await supabase.from('rides').select('*').eq('id', currentRideId).single()
      if (data) updateRideState(data)
    }
    fetchRide()

    const channel = supabase.channel(`public:rides:id=eq.${currentRideId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${currentRideId}` }, payload => {
        updateRideState(payload.new)
      })
      .subscribe()
      
    const updateRideState = (data: any) => {
      if (['accepted', 'arrived', 'in_transit', 'completed'].includes(data.status)) {
        setStatus(data.status)
      }
      
      // Let's assume if it is accepted, we have driver ID and can fetch driver details if needed
      // but if the driver updated their own name, it is not on the rides table. 
      // The driver app code updates rides with driverName, so it should still be there for now.
      
      if (data.otp) {
        setOtp(data.otp)
      }
      
      if (data.driverlat && data.driverlng) {
         setDriverLocation([data.driverlat, data.driverlng])
      }
    }

    return () => { supabase.removeChannel(channel) };
  }, [currentRideId]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white w-full">
        <div className="p-8 max-w-md w-full bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800">
          <h1 className="text-4xl font-bold text-center mb-8">RYVO Rider</h1>
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
              <input type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <input type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3" />
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 mt-2">Create Rider Account</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen bg-zinc-900 text-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapContainer center={currentPosition} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <ChangeView center={currentPosition} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={currentPosition}>
            <Popup>You are here.</Popup>
          </Marker>
          
          {routeGeometry && (
             <Polyline positions={routeGeometry} color="black" weight={6} opacity={0.8} />
          )}

          {/* Show Online Drivers when idling or estimating */}
          {(status === 'idle' || status === 'estimating') && onlineDrivers.map(driver => (
            <Marker 
               key={driver.id} 
               position={[driver.lat, driver.lng]} 
               icon={createVehicleIcon(driver.vehicleType || 'mini')}
               zIndexOffset={100}
            />
          ))}


          {driverLocation && (
            <Marker position={driverLocation} icon={createVehicleIcon(driverDetails?.vehicleType || 'MINI')}>
              <Popup>Driver is here</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Top Bar with Hamburger */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-between items-center max-w-md mx-auto mt-2 pointer-events-auto">
          <div className="flex items-center space-x-3">
             <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-zinc-900/90 backdrop-blur rounded-full shadow-lg border border-zinc-800 text-white hover:bg-zinc-800 transition">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
             </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8 bg-gradient-to-t from-black/90 to-transparent">
        <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 p-6 rounded-3xl shadow-2xl max-w-md mx-auto relative">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">RYVO</h1>
          
          {['accepted', 'arrived', 'in_transit', 'completed'].includes(status) ? (
             <div className="py-2">
               <div className="flex items-center justify-between bg-zinc-800 p-4 rounded-2xl mb-4 border border-zinc-700">
                  <div className="flex items-center space-x-4">
                     <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-xl font-bold border-2 border-blue-400">
                        {driverDetails?.name?.charAt(0) || 'D'}
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-white">{driverDetails?.name || 'Driver'}</h2>
                        <p className="text-zinc-400 text-sm font-medium">{(driverDetails as any)?.rating || '5.0'} ★</p>
                     </div>
                  </div>
                  <div className="text-right">
                     <p className="bg-zinc-900 border border-zinc-600 px-3 py-1 rounded-md font-mono font-bold text-white tracking-widest text-lg shadow-sm">
                        {driverDetails?.vehicleNumber || 'XX00XX'}
                     </p>
                     <p className="text-zinc-400 text-xs mt-1 font-bold uppercase">{driverDetails?.vehicleColor || ''} {selectedVehicle}</p>
                     {driverDetails?.phone && (
                        <a href={`tel:${driverDetails.phone}`} className="inline-block mt-2 text-sm font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded hover:bg-green-500/20">
                          📞 {driverDetails.phone}
                        </a>
                     )}
                  </div>
               </div>
               
               <div className={`border p-4 rounded-xl text-center ${
                 status === 'accepted' ? 'bg-green-600/20 border-green-500/50 text-green-400' :
                 status === 'arrived' ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' :
                 status === 'in_transit' ? 'bg-purple-600/20 border-purple-500/50 text-purple-400' :
                 'bg-zinc-800 border-zinc-700 text-white'
               }`}>
                  <h3 className="font-bold mb-1">
                    {status === 'accepted' && 'Driver is on the way!'}
                    {status === 'arrived' && 'Driver has arrived!'}
                    {status === 'in_transit' && 'Heading to destination...'}
                    {status === 'completed' && 'Ride Completed!'}
                  </h3>
                  <p className="opacity-80 text-sm">
                    {status === 'accepted' && 'Please meet your driver at the pickup location.'}
                    {status === 'arrived' && 'Please meet your driver outside.'}
                    {status === 'in_transit' && 'Sit back and relax.'}
                    {status === 'completed' && 'Thank you for riding with RYVO!'}
                  </p>
                  
                  {(status === 'accepted' || status === 'arrived') && otp && (
                    <div className="mt-4 bg-zinc-900/50 p-3 rounded-lg border border-zinc-700/50 inline-block">
                       <p className="text-zinc-400 text-xs uppercase font-bold tracking-widest mb-1">Ride OTP</p>
                       <p className="text-white text-3xl font-black tracking-[0.2em]">{otp}</p>
                    </div>
                  )}

                  {['accepted', 'arrived'].includes(status) && (
                    <button 
                      onClick={cancelRide}
                      className="w-full mt-4 bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 font-bold py-3 rounded-xl transition"
                    >
                      Cancel Ride
                    </button>
                  )}
                  
                  {status === 'completed' && !hasRated && (
                    <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-2">Rate your driver</h4>
                      <div className="flex justify-center space-x-2 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button 
                            key={star} 
                            onClick={() => setRating(star)}
                            className={`text-3xl transition-transform hover:scale-110 ${rating >= star ? 'text-yellow-400' : 'text-zinc-600'}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      {rating > 0 && (
                        <div className="space-y-3 animate-slide-in">
                          <textarea 
                            value={review}
                            onChange={(e) => setReview(e.target.value)}
                            placeholder="Leave a compliment (optional)" 
                            className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-20"
                          />
                          <button 
                            onClick={async () => {
                              if (currentRideId) {
                                await supabase.from('rides').update({
                                  rating,
                                  review,
                                }).eq('id', currentRideId)
                              }
                              setHasRated(true)
                            }}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-500"
                          >
                            Submit Rating
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {status === 'completed' && hasRated && (
                    <div className="mt-4 bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl mb-4">
                      <p className="font-bold">Thank you for your feedback!</p>
                    </div>
                  )}
                  
                  {status === 'completed' && (
                    <button onClick={() => { 
                      setStatus('idle'); 
                      setCurrentRideId(null); 
                      setRouteGeometry(null);
                      setRating(0);
                      setReview('');
                      setHasRated(false);
                    }} className="mt-4 w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200">
                      Request Another Ride
                    </button>
                  )}
               </div>
             </div>
          ) : status === 'searching' ? (
            <div className="text-center py-8">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
               <p className="text-zinc-300 font-medium animate-pulse mb-6">Finding a nearby driver...</p>
               <button 
                 onClick={cancelRide}
                 className="w-full bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 font-bold py-3 rounded-xl transition"
               >
                 Cancel Request
               </button>
            </div>
          ) : status === 'confirming' ? (
            <div className="py-2">
               <p className="text-zinc-400 text-sm mb-3 font-medium">Select a ride</p>
               
               <div className="space-y-3 mb-6">
                 {/* Bike */}
                 <div 
                   onClick={() => setSelectedVehicle('bike')}
                   className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'bike' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                 >
                    <div className="flex items-center space-x-3">
                       <div className="text-2xl">🛵</div>
                       <div>
                         <h3 className="font-bold text-white">RYVO Bike</h3>
                         <p className="text-xs text-zinc-400">Beat the traffic</p>
                       </div>
                    </div>
                    <span className="font-bold text-xl">₹{getPrice('bike', distance).toFixed(2)}</span>
                 </div>

                 {/* Auto */}
                 <div 
                   onClick={() => setSelectedVehicle('auto')}
                   className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'auto' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                 >
                    <div className="flex items-center space-x-3">
                       <div className="text-2xl">🛺</div>
                       <div>
                         <h3 className="font-bold text-white">RYVO Auto</h3>
                         <p className="text-xs text-zinc-400">Affordable rides</p>
                       </div>
                    </div>
                    <span className="font-bold text-xl">₹{getPrice('auto', distance).toFixed(2)}</span>
                 </div>

                 {/* Mini */}
                 <div 
                   onClick={() => setSelectedVehicle('mini')}
                   className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedVehicle === 'mini' ? 'border-white bg-zinc-800' : 'border-transparent bg-zinc-800/50 hover:bg-zinc-800'}`}
                 >
                    <div className="flex items-center space-x-3">
                       <div className="text-2xl">🚗</div>
                       <div>
                         <h3 className="font-bold text-white">RYVO Mini</h3>
                         <p className="text-xs text-zinc-400">Comfortable AC rides</p>
                       </div>
                    </div>
                    <span className="font-bold text-xl">₹{getPrice('mini', distance).toFixed(2)}</span>
                 </div>
               </div>

               <button 
                  onClick={handleConfirmRide}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Confirm {selectedVehicle.toUpperCase()} (Cash)
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
              {errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-4 text-red-500 text-sm font-bold">
                  {errorMessage}
                </div>
              )}
              <p className="text-zinc-400 text-sm mb-6 font-medium">Where to?</p>
              <div className="space-y-4 relative">
                
                {/* Pickup Field */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                  <input 
                    type="text" 
                    value={pickup}
                    onChange={(e) => {
                      setPickup(e.target.value); 
                      fetchSuggestions(e.target.value, setPickupSuggestions)
                    }}
                    onBlur={() => setTimeout(() => setPickupSuggestions([]), 200)}
                    placeholder="Enter pickup location" 
                    className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-white transition-all font-medium"
                  />
                  {pickupSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 mt-2 rounded-2xl shadow-2xl overflow-hidden divide-y divide-zinc-800">
                      {pickupSuggestions.map((s, i) => (
                        <div 
                          key={i} 
                          className="px-5 py-4 hover:bg-zinc-800 cursor-pointer flex items-center space-x-4 transition-colors"
                          onClick={() => { 
                            setPickup(s.title); 
                            setPickupCoords([s.lat, s.lon]);
                            setCurrentPosition([s.lat, s.lon]);
                            setPickupSuggestions([]); 
                          }}
                        >
                          <div className="flex-shrink-0 bg-zinc-800 p-2 rounded-full">
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-white font-bold truncate text-base">{s.title}</p>
                            <p className="text-zinc-400 text-sm truncate">{s.subtitle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Destination Field */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <div className="w-2 h-2 bg-white"></div>
                  </div>
                  <input 
                    type="text" 
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      fetchSuggestions(e.target.value, setDestSuggestions)
                    }}
                    onBlur={() => setTimeout(() => setDestSuggestions([]), 200)}
                    placeholder="Where to?" 
                    className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-white transition-all font-medium"
                  />
                  {destSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 mt-2 rounded-2xl shadow-2xl overflow-hidden divide-y divide-zinc-800">
                      {destSuggestions.map((s, i) => (
                        <div 
                          key={i} 
                          className="px-5 py-4 hover:bg-zinc-800 cursor-pointer flex items-center space-x-4 transition-colors"
                          onClick={() => { 
                            setDestination(s.title); 
                            setDestCoords([s.lat, s.lon]);
                            setCurrentPosition([s.lat, s.lon]);
                            setDestSuggestions([]); 
                          }}
                        >
                          <div className="flex-shrink-0 bg-zinc-800 p-2 rounded-full">
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-white font-bold truncate text-base">{s.title}</p>
                            <p className="text-zinc-400 text-sm truncate">{s.subtitle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={handleEstimate}
                  disabled={status === 'estimating' || !pickup || !destination}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors mt-2 text-lg disabled:opacity-50"
                >
                  {status === 'estimating' ? 'Calculating...' : 'See Prices'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-[2000] flex">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>
           <div className="relative w-80 bg-zinc-950 h-full shadow-2xl flex flex-col border-r border-zinc-800 animate-slide-in">
              <div className="p-6 bg-zinc-900 border-b border-zinc-800">
                 <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-blue-400">
                       {riderProfile?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'R'}
                    </div>
                    <div>
                       <h2 className="text-xl font-bold text-white">{riderProfile?.name || 'Rider'}</h2>
                       <p className="text-zinc-400 text-sm">5.0 ★ Rating</p>
                    </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                 <button className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">🕒</span><span>My Rides</span>
                 </button>
                 <button className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">💳</span><span>Payment Methods</span>
                 </button>
                 <button className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
                    <span className="text-xl">⚙️</span><span>Settings</span>
                 </button>
                 <button className="w-full text-left px-6 py-4 hover:bg-zinc-800 text-white font-medium flex items-center space-x-4 transition">
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
    </div>
  )
}

export default App
