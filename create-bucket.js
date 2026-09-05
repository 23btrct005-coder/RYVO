const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:GD49rms1HRtKmb2z@db.ljnybrfrbcjskauolnyu.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  
  console.log('Creating storage bucket...');
  const sql = `
-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete" ON storage.objects;

-- Create policies to allow completely open access to the 'documents' bucket for development
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'documents' );

CREATE POLICY "Allow public upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'documents' );

CREATE POLICY "Allow public update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'documents' );

CREATE POLICY "Allow public delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'documents' );
  `;
  await client.query(sql);

  console.log('Bucket created and policies applied!');
  await client.end();
}
run().catch(console.error);
