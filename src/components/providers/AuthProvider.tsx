'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Spin } from 'antd';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserWithRoles } from '@/lib/supabase/auth';
import { useAuthStore } from '@/lib/store/auth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 初始化：检查当前会话
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const userWithRoles = await getCurrentUserWithRoles();
          setUser(userWithRoles);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    };

    initAuth();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const userWithRoles = await getCurrentUserWithRoles();
          setUser(userWithRoles);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setLoading]);

  // 路由保护
  useEffect(() => {
    if (isLoading) return;

    const isLoginPage = pathname === '/login';

    if (!isAuthenticated && !isLoginPage) {
      router.push('/login');
    } else if (isAuthenticated && isLoginPage) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // 加载中
  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  // 未登录且不在登录页，不渲染内容（等待重定向）
  if (!isAuthenticated && pathname !== '/login') {
    return null;
  }

  return <>{children}</>;
}
