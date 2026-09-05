const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ljnybrfrbcjskauolnyu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbnlicmZyYmNqc2thdW9sbnl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYzMDI0NywiZXhwIjoyMDk5MjA2MjQ3fQ.SceSOi3lo1oXD6xV-u-ktA_5mRmfQiA-5p5-412W0mU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error listing users:', error);
    return;
  }
  
  console.log('Deleting', users.length, 'users...');
  for (const user of users) {
    const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
    if (delError) {
      console.error('Error deleting user', user.email, delError);
    } else {
      console.log('Deleted user:', user.email);
    }
  }
  console.log('Done.');
}
run();
