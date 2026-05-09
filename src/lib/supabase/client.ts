import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 不使用严格泛型，避免 GENERATED 列等导致的类型冲突
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
