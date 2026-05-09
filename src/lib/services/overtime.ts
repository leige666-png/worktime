import { supabase } from '@/lib/supabase/client';
import type { OvertimeRecord, OvertimeType } from '@/types/database';

export async function getOvertimeTypes() {
  const { data, error } = await supabase
    .from('overtime_types')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data as OvertimeType[];
}

export async function getOvertimeRecords(params?: {
  userId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  typeId?: string;
}) {
  let query = supabase
    .from('overtime_records')
    .select('*, users!overtime_records_user_id_fkey(id, name, mis, avatar), overtime_types!overtime_records_type_id_fkey(id, name, code, color, multiplier)')
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

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createOvertimeRecord(record: {
  user_id: string;
  type_id: string;
  date: string;
  start_time: string;
  end_time: string;
  workload_description?: string;
  workload_amount?: number;
  efficiency_score?: number;
}) {
  const { data, error } = await supabase
    .from('overtime_records')
    .insert(record)
    .select('*, overtime_types!overtime_records_type_id_fkey(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateOvertimeRecord(id: string, updates: Partial<OvertimeRecord>) {
  const { data, error } = await supabase
    .from('overtime_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function revokeOvertimeRecord(id: string) {
  return updateOvertimeRecord(id, { status: 'revoked' });
}

export async function approveOvertimeRecord(id: string, reviewerId: string, comment?: string) {
  return updateOvertimeRecord(id, {
    status: 'approved',
    reviewer_id: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_comment: comment || null,
  });
}

export async function rejectOvertimeRecord(id: string, reviewerId: string, comment: string) {
  return updateOvertimeRecord(id, {
    status: 'rejected',
    reviewer_id: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_comment: comment,
  });
}
