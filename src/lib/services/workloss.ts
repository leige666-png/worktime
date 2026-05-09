import { supabase } from '@/lib/supabase/client';
import type { WorklossRecord, WorklossType } from '@/types/database';

export async function getWorklossTypes() {
  const { data, error } = await supabase
    .from('workloss_types')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data as WorklossType[];
}

export async function getWorklossRecords(params?: {
  userId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  typeId?: string;
  impactLevel?: string;
}) {
  let query = supabase
    .from('workloss_records')
    .select('*, users!workloss_records_user_id_fkey(id, name, mis, avatar), workloss_types!workloss_records_type_id_fkey(id, name, code, color)')
    .order('date', { ascending: false });

  if (params?.userId) {
    query = query.eq('user_id', params.userId);
  }
  if (params?.status) {
    query = query.eq('status', params.status);
  }
  if (params?.startDate) {
    query = query.gte('date', params.startDate);
  }
  if (params?.endDate) {
    query = query.lte('date', params.endDate);
  }
  if (params?.typeId) {
    query = query.eq('type_id', params.typeId);
  }
  if (params?.impactLevel) {
    query = query.eq('impact_level', params.impactLevel);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createWorklossRecord(record: {
  user_id: string;
  type_id: string;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  impact_level: string;
  affected_tasks?: string;
  workload_lost?: number;
  efficiency_before?: number;
  efficiency_after?: number;
}) {
  const { data, error } = await supabase
    .from('workloss_records')
    .insert(record)
    .select('*, workloss_types!workloss_records_type_id_fkey(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorklossRecord(id: string, updates: Partial<WorklossRecord>) {
  const { data, error } = await supabase
    .from('workloss_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function revokeWorklossRecord(id: string) {
  return updateWorklossRecord(id, { status: 'revoked' });
}

export async function approveWorklossRecord(id: string, reviewerId: string, comment?: string) {
  return updateWorklossRecord(id, {
    status: 'approved',
    reviewer_id: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_comment: comment || null,
  });
}

export async function rejectWorklossRecord(id: string, reviewerId: string, comment: string) {
  return updateWorklossRecord(id, {
    status: 'rejected',
    reviewer_id: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_comment: comment,
  });
}
