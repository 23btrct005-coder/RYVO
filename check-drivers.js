import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://ljnybrfrbcjskauolnyu.supabase.co', 'sb_publishable_ZT9bmCMNLh-ushHtvNtX8A_IjxDNXCJ')

async function run() {
  const { data, error } = await supabase.from('drivers').select('*');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

run();
