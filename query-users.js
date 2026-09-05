const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.ljnybrfrbcjskauolnyu:GD49rms1HRtKmb2z@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query('SELECT id, email FROM auth.users');
  console.log(res.rows);
  await client.end();
}
run();
