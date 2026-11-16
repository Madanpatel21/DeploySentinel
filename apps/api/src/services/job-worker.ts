import { supabase } from '../db/supabase.js';

export async function enqueueBackgroundJob(
  organizationId: string,
  jobType: string,
  payload: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from('jobs_queue')
    .insert({
      organization_id: organizationId,
      job_type: jobType,
      payload,
      status: 'COMPLETED',
      attempts: 1,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }
  return data.id as string;
}
