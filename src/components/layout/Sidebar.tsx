'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';

const { Sider } = Layout;

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, canManagePersonnel, canReview, isAdmin } = useAuthStore();

  // 根据权限动态生成菜单
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '工作台',
    },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: '个人中心',
    },
    {
      key: '/overtime',
      icon: <ClockCircleOutlined />,
      label: '加班填报',
    },
    {
      key: '/workloss',
      icon: <WarningOutlined />,
      label: '工损填报',
    },
    // 以下菜单需要权限
    ...(canManagePersonnel() ? [{
      key: '/personnel',
      icon: <TeamOutlined />,
      label: '人员管理',
    }] : []),
    ...(canReview() ? [{
      key: '/statistics',
      icon: <BarChartOutlined />,
      label: '工时统计',
    }] : []),
    ...(isAdmin() ? [{
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    }] : []),
  ];

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      theme="light"
      style={{
        borderRight: '1px solid #f0f0f0',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 200,
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <h1 style={{ fontSize: collapsed ? 16 : 18, fontWeight: 700, margin: 0, color: '#667eea' }}>
          {collapsed ? 'WT' : '工时管理'}
        </h1>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[pathname]}
        items={menuItems}
        onClick={({ key }) => router.push(key)}
        style={{ borderRight: 0, marginTop: 8 }}
      />
      {!collapsed && user && (
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, padding: '0 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: '#bbb' }}>{user.mis}</div>
        </div>
      )}
    </Sider>
  );
}
