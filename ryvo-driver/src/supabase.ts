import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ljnybrfrbcjskauolnyu.supabase.co'
const supabaseAnonKey = 'sb_publishable_ZT9bmCMNLh-ushHtvNtX8A_IjxDNXCJ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
