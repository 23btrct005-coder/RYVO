async function run() {
  const query = "Koramangala";
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=12.9716&lon=77.5946`);
  const data = await res.json();
  console.log(JSON.stringify(data.features[0].geometry, null, 2));
}
run();
