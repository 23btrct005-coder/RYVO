const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ljnybrfrbcjskauolnyu.supabase.co';
const supabaseAnonKey = 'sb_publishable_ZT9bmCMNLh-ushHtvNtX8A_IjxDNXCJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('drivers').select('*');
  console.log('Anon Key Test:', { data, error });
}
test();
