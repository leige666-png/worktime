'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Spin } from 'antd';
import { getCurrentUserWithRoles, getSession } from '@/lib/supabase/auth';
import { useAuthStore } from '@/lib/store/auth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = getSession();
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

  const isAuthPage = pathname === '/login' || pathname?.startsWith('/login/');
  if (!isAuthenticated && !isAuthPage) {
    return null;
  }

  return <>{children}</>;
}
