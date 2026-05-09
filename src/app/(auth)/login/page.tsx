'use client';

import { useState } from 'react';
import { Button, Card, Typography, Space, Input, message, Divider } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { checkMisStatus, signInWithPassword } from '@/lib/supabase/auth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [mis, setMis] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 正常登录（MIS + 密码）
  const handleLogin = async () => {
    if (!mis.trim()) {
      message.warning('请输入MIS号');
      return;
    }
    if (!password) {
      message.warning('请输入密码');
      return;
    }

    try {
      setLoading(true);
      await signInWithPassword(mis, password);
      message.success('登录成功');
      router.push('/dashboard');
    } catch (error: any) {
      message.error(error.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 首次登录
  const handleFirstLogin = async () => {
    if (!mis.trim()) {
      message.warning('请先输入MIS号');
      return;
    }

    try {
      setLoading(true);
      const status = await checkMisStatus(mis);

      if (status.exists && status.hasPassword) {
        message.info('该账号已设置密码，请直接登录');
      } else {
        // 跳转到设置密码页面
        router.push(`/login/setup?mis=${encodeURIComponent(mis.trim())}&new=${status.exists ? '0' : '1'}`);
      }
    } catch (error: any) {
      message.error(error.message || '检查失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{ width: 420, borderRadius: 12 }}
        styles={{ body: { padding: 48 } }}
      >
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ marginBottom: 8 }}>
              工时管理系统
            </Title>
            <Text type="secondary">WorkTime Management System</Text>
          </div>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Input
              size="large"
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入MIS号"
              value={mis}
              onChange={(e) => setMis(e.target.value)}
              style={{ height: 48 }}
            />

            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={handleLogin}
              style={{ height: 48 }}
            />

            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              onClick={handleLogin}
              loading={loading}
              disabled={!mis || !password}
              block
              style={{ height: 48, fontSize: 16 }}
            >
              登 录
            </Button>
          </Space>

          <Divider style={{ margin: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>首次使用？</Text>
          </Divider>

          <Button
            type="default"
            size="large"
            onClick={handleFirstLogin}
            loading={loading}
            block
            style={{ height: 44 }}
          >
            首次登录 / 设置密码
          </Button>

          <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
            首次登录请输入MIS号后点击上方按钮设置密码
          </Text>
        </Space>
      </Card>
    </div>
  );
}
