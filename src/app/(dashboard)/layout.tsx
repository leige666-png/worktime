'use client';

import { Layout } from 'antd';
import Sidebar from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/Header';

const { Content } = Layout;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar />
      <Layout style={{ marginLeft: 200 }}>
        <AppHeader />
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
