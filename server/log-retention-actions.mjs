import { supabase, supabaseConfigured } from './supabase.mjs';

async function call(fn, days){
  if(!supabaseConfigured || !supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const {data,error}=await supabase.rpc(fn,{p_days:Number(days)});
  if(error) throw error;
  return data||{};
}

export async function purgeOldLogs(){
  return call('purge_old_academy_logs',7);
}

export async function purgeLogsKeepRecent3Days(){
  return call('purge_academy_logs_keep_recent_days',3);
}
