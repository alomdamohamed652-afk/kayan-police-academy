import { createClient } from '@supabase/supabase-js';

const url=String(process.env.SUPABASE_URL||'').trim();
const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();

export const supabaseConfigured=Boolean(url&&serviceKey);
export const supabase=supabaseConfigured
  ? createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  : null;

export function requireSupabase(){
  if(!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}
