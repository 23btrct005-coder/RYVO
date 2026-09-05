-- Disable RLS temporarily to allow all operations without authentication rules (since we are replacing Firebase logic which allowed anon read/write mostly, but let's be more specific)

-- Create Riders Table
CREATE TABLE IF NOT EXISTS public.riders (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  vehicleType text,
  vehicleColor text,
  vehicleNumber text,
  licenseNumber text,
  documents jsonb,
  isOnline boolean DEFAULT false,
  lat double precision,
  lng double precision,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Rides Table
CREATE TABLE IF NOT EXISTS public.rides (
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn off RLS for these tables to allow open read/write just like Firebase open rules
ALTER TABLE public.riders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides DISABLE ROW LEVEL SECURITY;

-- Enable Realtime on Drivers and Rides tables
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table rides;
