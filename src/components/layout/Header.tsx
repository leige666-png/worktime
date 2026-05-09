'use client';

import { useEffect, useState } from 'react';
import { Layout, Avatar, Dropdown, Badge, Space, Typography, message, Tag } from 'antd';
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { signOut } from '@/lib/supabase/auth';
import { notificationDB } from '@/lib/db';
import { ROLE_LABELS } from '@/types/database';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  team_lead: 'orange',
  reviewer: 'blue',
  member: 'default',
};

export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      setUnreadCount(notificationDB.getUnreadCount(user.id));
    }
    // 每5秒刷新未读数
    const timer = setInterval(() => {
      if (user) {
        setUnreadCount(notificationDB.getUnreadCount(user.id));
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [user]);

  const handleLogout = () => {
    signOut();
    logout();
    router.push('/login');
    message.success('已退出登录');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心',
      onClick: () => router.push('/profile'),
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => router.push('/profile'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <AntHeader
      style={{
        background: '#fff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 64,
      }}
    >
      <Space size={20}>
        {user && (
          <Tag color={ROLE_COLORS[user.role]} style={{ marginRight: 0 }}>
            {ROLE_LABELS[user.role]}
          </Tag>
        )}
        <Badge count={unreadCount} size="small" offset={[-2, 2]}>
          <BellOutlined
            style={{ fontSize: 18, cursor: 'pointer' }}
            onClick={() => router.push('/profile')}
          />
        </Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#667eea' }} />
            <Text>{user?.name || '未登录'}</Text>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
}
