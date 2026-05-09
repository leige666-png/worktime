import { supabase } from '@/lib/supabase/client';
import dayjs from 'dayjs';

export async function getDashboardStats(userId: string) {
  const now = dayjs();
  const monthStart = now.startOf('month').format('YYYY-MM-DD');
  const monthEnd = now.endOf('month').format('YYYY-MM-DD');

  // 本月加班记录
  const { data: overtimeRecords } = await supabase
    .from('overtime_records')
    .select('duration_minutes, status')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEnd);

  // 本月工损记录
  const { data: worklossRecords } = await supabase
    .from('workloss_records')
    .select('duration_minutes, status')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEnd);

  const totalOvertimeMinutes = overtimeRecords
    ?.filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (r.duration_minutes || 0), 0) || 0;

  const totalWorklossMinutes = worklossRecords
    ?.filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (r.duration_minutes || 0), 0) || 0;

  const pendingCount = (overtimeRecords?.filter((r) => r.status === 'pending').length || 0)
    + (worklossRecords?.filter((r) => r.status === 'pending').length || 0);

  const approvedCount = (overtimeRecords?.filter((r) => r.status === 'approved').length || 0)
    + (worklossRecords?.filter((r) => r.status === 'approved').length || 0);

  return {
    totalOvertimeHours: Math.round(totalOvertimeMinutes / 60 * 10) / 10,
    totalWorklossHours: Math.round(totalWorklossMinutes / 60 * 10) / 10,
    pendingCount,
    approvedCount,
  };
}

export async function getRecentRecords(userId: string, limit = 5) {
  const { data: recentOvertime } = await supabase
    .from('overtime_records')
    .select('id, date, start_time, end_time, duration_minutes, status, overtime_types!overtime_records_type_id_fkey(name, color)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  return recentOvertime || [];
}

export async function getPendingApprovals(reviewerId: string, limit = 10) {
  // 获取待审批的加班记录
  const { data: pendingOvertime } = await supabase
    .from('overtime_records')
    .select('id, date, duration_minutes, users!overtime_records_user_id_fkey(name), overtime_types!overtime_records_type_id_fkey(name)')
    .eq('status', 'pending')
    .neq('user_id', reviewerId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  // 获取待审批的工损记录
  const { data: pendingWorkloss } = await supabase
    .from('workloss_records')
    .select('id, date, duration_minutes, users!workloss_records_user_id_fkey(name), workloss_types!workloss_records_type_id_fkey(name)')
    .eq('status', 'pending')
    .neq('user_id', reviewerId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  return {
    overtime: pendingOvertime || [],
    workloss: pendingWorkloss || [],
  };
}
