import { supabase, supabaseConfigured } from './supabase.mjs';

const call = async (fn, args) => {
  if (!supabaseConfigured || !supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || {}) : (data || {});
};

export async function clearExamAnswerData(examLegacyId) {
  return call('clear_exam_answer_data', { p_exam_legacy_id: String(examLegacyId) });
}

export async function clearApplicationBatchData(batchLegacyId) {
  return call('clear_application_batch_data', { p_batch_legacy_id: String(batchLegacyId) });
}
