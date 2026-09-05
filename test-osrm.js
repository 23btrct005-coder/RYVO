async function run() {
  const pickupCoords = [12.9716, 77.5946]; // Bangalore center
  const destCoords = [12.9279, 77.6271]; // Koramangala
  const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson`;
  console.log("URL:", url);
  
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 'Ok' && data.routes.length > 0) {
     const route = data.routes[0];
     console.log("Distance (m):", route.distance);
     console.log("Distance (km):", route.distance / 1000);
  } else {
     console.log("Error:", data);
  }
}
run();
