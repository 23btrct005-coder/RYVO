const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  
  await client.query('ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;');
  await client.query('ALTER TABLE public.riders DISABLE ROW LEVEL SECURITY;');
  await client.query('ALTER TABLE public.rides DISABLE ROW LEVEL SECURITY;');
  
  const res = await client.query(`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname IN ('drivers', 'riders', 'rides')
  `);
  console.log(res.rows);
  
  await client.end();
}
run().catch(console.error);
