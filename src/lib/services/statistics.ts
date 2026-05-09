import { supabase } from '@/lib/supabase/client';
import dayjs from 'dayjs';

export async function getOvertimeTrend(params: {
  year: number;
  month: number;
  groupId?: string;
}) {
  const startDate = dayjs(`${params.year}-${String(params.month).padStart(2, '0')}-01`);
  const endDate = startDate.endOf('month');

  let query = supabase
    .from('overtime_records')
    .select('date, duration_minutes, user_id, status')
    .gte('date', startDate.format('YYYY-MM-DD'))
    .lte('date', endDate.format('YYYY-MM-DD'))
    .eq('status', 'approved');

  const { data, error } = await query;
  if (error) throw error;

  // 按日期聚合
  const dailyMap: Record<string, number> = {};
  for (let d = startDate; d.isBefore(endDate) || d.isSame(endDate, 'day'); d = d.add(1, 'day')) {
    dailyMap[d.format('MM-DD')] = 0;
  }

  data?.forEach((r) => {
    const key = dayjs(r.date).format('MM-DD');
    dailyMap[key] = (dailyMap[key] || 0) + (r.duration_minutes || 0);
  });

  return Object.entries(dailyMap).map(([date, minutes]) => ({
    date,
    hours: Math.round(minutes / 60 * 10) / 10,
  }));
}

export async function getWorklossDistribution(params: {
  year: number;
  month: number;
}) {
  const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
  const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

  const { data, error } = await supabase
    .from('workloss_records')
    .select('duration_minutes, workloss_types!workloss_records_type_id_fkey(name, color)')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('status', 'approved');

  if (error) throw error;

  // 按类型聚合
  const typeMap: Record<string, { name: string; color: string; minutes: number }> = {};
  data?.forEach((r: any) => {
    const typeName = r.workloss_types?.name || '未知';
    if (!typeMap[typeName]) {
      typeMap[typeName] = { name: typeName, color: r.workloss_types?.color || '#999', minutes: 0 };
    }
    typeMap[typeName].minutes += r.duration_minutes || 0;
  });

  return Object.values(typeMap).map((t) => ({
    name: t.name,
    value: Math.round(t.minutes / 60 * 10) / 10,
    color: t.color,
  }));
}

export async function getUserRanking(params: {
  year: number;
  month: number;
  type: 'overtime' | 'workloss';
  limit?: number;
}) {
  const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
  const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');
  const table = params.type === 'overtime' ? 'overtime_records' : 'workloss_records';
  const fk = params.type === 'overtime'
    ? 'users!overtime_records_user_id_fkey(name)'
    : 'users!workloss_records_user_id_fkey(name)';

  const { data, error } = await supabase
    .from(table)
    .select(`duration_minutes, user_id, ${fk}`)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('status', 'approved');

  if (error) throw error;

  // 按用户聚合
  const userMap: Record<string, { name: string; minutes: number }> = {};
  data?.forEach((r: any) => {
    const userId = r.user_id;
    const userName = r.users?.name || '未知';
    if (!userMap[userId]) {
      userMap[userId] = { name: userName, minutes: 0 };
    }
    userMap[userId].minutes += r.duration_minutes || 0;
  });

  return Object.values(userMap)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, params.limit || 10)
    .map((u) => ({
      name: u.name,
      hours: Math.round(u.minutes / 60 * 10) / 10,
    }));
}

export async function getAnomalyStats(params: {
  year: number;
  month: number;
}) {
  const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
  const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

  const { data: overtimeAnomalies } = await supabase
    .from('overtime_records')
    .select('id, date, anomaly_reason, users!overtime_records_user_id_fkey(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('anomaly_flag', true);

  const { data: worklossAnomalies } = await supabase
    .from('workloss_records')
    .select('id, date, anomaly_reason, users!workloss_records_user_id_fkey(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('anomaly_flag', true);

  return {
    overtime: overtimeAnomalies || [],
    workloss: worklossAnomalies || [],
    total: (overtimeAnomalies?.length || 0) + (worklossAnomalies?.length || 0),
  };
}
