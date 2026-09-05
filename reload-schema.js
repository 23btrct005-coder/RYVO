const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('PostgREST schema cache reloaded!');
  await client.end();
}
run().catch(console.error);
