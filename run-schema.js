const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  const sql = fs.readFileSync('/Users/studies/Downloads/automate/RYVO/schema.sql', 'utf8');
  await client.query(sql);
  console.log('Schema executed successfully');
  await client.end();
}
run().catch(console.error);
