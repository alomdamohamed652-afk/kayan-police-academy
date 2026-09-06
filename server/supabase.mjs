import { createClient } from '@supabase/supabase-js';

const url=String(process.env.SUPABASE_URL||'').trim();
// Supabase now supports opaque sb_secret_ keys. Accept the modern variable
// first, while keeping the legacy service_role variable for compatibility.
const serviceKey=String(
  process.env.SUPABASE_SECRET_KEY||
  process.env.SUPABASE_SERVICE_ROLE_KEY||
  ''
).trim();

export const supabaseConfigured=Boolean(url&&serviceKey);
export const supabase=supabaseConfigured
  ? createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  : null;

export function requireSupabase(){
  if(!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}
