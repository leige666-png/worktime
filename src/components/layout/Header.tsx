'use client';

import { Layout, Avatar, Dropdown, Badge, Space, Typography, message } from 'antd';
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { signOut } from '@/lib/supabase/auth';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut();
      logout();
      router.push('/login');
    } catch {
      message.error('退出登录失败');
    }
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
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
      }}
    >
      <Space size={24}>
        <Badge count={0} size="small">
          <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        </Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              size="small"
              src={user?.avatar}
              icon={<UserOutlined />}
            />
            <Text>{user?.name || '未登录'}</Text>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
}
