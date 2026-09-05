const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  
  console.log('1. Dropping existing tables...');
  await client.query('DROP TABLE IF EXISTS public.rides CASCADE;');
  await client.query('DROP TABLE IF EXISTS public.drivers CASCADE;');
  await client.query('DROP TABLE IF EXISTS public.riders CASCADE;');
  
  console.log('2. Wiping all auth users so you can use any email...');
  await client.query('DELETE FROM auth.users;');

  console.log('3. Recreating tables from scratch...');
  const sql = `
-- Create Riders Table
CREATE TABLE public.riders (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Drivers Table
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  vehicletype text,
  vehiclecolor text,
  vehiclenumber text,
  licensenumber text,
  documents jsonb,
  isonline boolean DEFAULT false,
  lat double precision,
  lng double precision,
  rating text,
  totalreviews integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Rides Table
CREATE TABLE public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  riderId uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  pickup text,
  destination text,
  pickupLat double precision,
  pickupLng double precision,
  destLat double precision,
  destLng double precision,
  vehicleType text,
  price numeric,
  distance numeric,
  status text,
  driverId uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  driverLat double precision,
  driverLng double precision,
  otp text,
  rating text,
  review text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Completely disable Row Level Security on all tables
ALTER TABLE public.riders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides DISABLE ROW LEVEL SECURITY;

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'drivers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rides;
  END IF;
END $$;
  `;
  await client.query(sql);

  console.log('4. Reloading API schema cache...');
  await client.query("NOTIFY pgrst, 'reload schema'");

  console.log('Done! Database is fully reset and clean.');
  await client.end();
}
run().catch(console.error);
