const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Wipe all Auth users (this gives you a totally clean slate for emails)
    await client.query('DELETE FROM auth.users;');
    console.log('Wiped all authentication users.');

    // 2. Drop existing tables
    await client.query('DROP TABLE IF EXISTS public.rides CASCADE;');
    await client.query('DROP TABLE IF EXISTS public.drivers CASCADE;');
    await client.query('DROP TABLE IF EXISTS public.riders CASCADE;');
    console.log('Dropped all old tables.');

    // 3. Re-run the clean schema
    const sql = fs.readFileSync('/Users/studies/Downloads/automate/RYVO/schema.sql', 'utf8');
    await client.query(sql);
    console.log('Recreated tables successfully.');

    // 4. Force Supabase API cache to reload
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('Reloaded Supabase API cache.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
