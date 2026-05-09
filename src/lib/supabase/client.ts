import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 使用占位值，避免连接到美团内部 Supabase 触发 SSO 跳转
// 业务数据功能后续接入真实数据库时再替换
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
