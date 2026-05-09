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
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';

const { Sider } = Layout;

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: '工作台',
  },
  {
    key: '/personnel',
    icon: <TeamOutlined />,
    label: '人员管理',
    roles: ['admin', 'team_lead'],
  },
  {
    key: '/overtime',
    icon: <ClockCircleOutlined />,
    label: '加班申报',
  },
  {
    key: '/workloss',
    icon: <WarningOutlined />,
    label: '工损申报',
  },
  {
    key: '/statistics',
    icon: <BarChartOutlined />,
    label: '数据统计',
    roles: ['admin', 'team_lead', 'reviewer'],
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    roles: ['admin'],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { hasRole } = useAuthStore();

  const filteredItems = menuItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((role) => hasRole(role));
  });

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
        <h1 style={{ fontSize: collapsed ? 16 : 18, fontWeight: 700, margin: 0 }}>
          {collapsed ? 'WT' : '工时管理'}
        </h1>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[pathname]}
        items={filteredItems}
        onClick={({ key }) => router.push(key)}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
}
