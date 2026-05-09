'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Spin } from 'antd';
import { getCurrentUser } from '@/lib/supabase/auth';
import { initializeSystem } from '@/lib/db';
import { useAuthStore } from '@/lib/store/auth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function init() {
      try {
        // 初始化系统（确保远程 data 分支和默认数据存在）
        await initializeSystem();
        // 检查登录状态（从远程验证用户是否存在）
        const user = await getCurrentUser();
        setUser(user);
      } catch (error) {
        console.error('Init failed:', error);
        setUser(null);
      }
    }
    init();
  }, [setUser]);

  // 路由保护
  useEffect(() => {
    if (isLoading) return;

    const isAuthPage = pathname === '/login' || pathname?.startsWith('/login/');

    if (!isAuthenticated && !isAuthPage) {
      router.push('/login');
    } else if (isAuthenticated && isAuthPage) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="系统连接中..." />
      </div>
    );
  }

  const isAuthPage = pathname === '/login' || pathname?.startsWith('/login/');
  if (!isAuthenticated && !isAuthPage) {
    return null;
  }

  return <>{children}</>;
}
