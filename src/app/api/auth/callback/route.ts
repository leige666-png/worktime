import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 用 code 换取 session
    await supabase.auth.exchangeCodeForSession(code);
  }

  // 登录成功后重定向到 dashboard
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
