'use client';

import { useState, useEffect, Suspense } from 'react';
import { Button, Card, Typography, Space, Input, message } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerWithPassword, setPassword, signInWithPassword } from '@/lib/supabase/auth';

const { Title, Text } = Typography;

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const misFromUrl = searchParams.get('mis') || '';
  const isNewUser = searchParams.get('new') === '1';

  const [mis] = useState(misFromUrl);
  const [name, setName] = useState('');
  const [password, setPasswordVal] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!misFromUrl) {
      router.push('/login');
    }
  }, [misFromUrl, router]);

  const handleSetup = async () => {
    if (!mis.trim()) {
      message.warning('MIS号不能为空');
      return;
    }
    if (isNewUser && !name.trim()) {
      message.warning('请输入姓名');
      return;
    }
    if (!password || password.length < 4) {
      message.warning('密码至少4位');
      return;
    }
    if (password !== confirmPassword) {
      message.warning('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);

      if (isNewUser) {
        // 新用户：注册并设置密码
        await registerWithPassword(mis, name, password);
        message.success('注册成功，正在进入系统...');
      } else {
        // 已有用户：设置密码
        await setPassword(mis, password);
        // 设置完密码后自动登录
        await signInWithPassword(mis, password);
        message.success('密码设置成功，正在进入系统...');
      }

      router.push('/dashboard');
    } catch (error: any) {
      message.error(error.message || '操作失败');
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
            <CheckCircleOutlined style={{ fontSize: 40, color: '#667eea', marginBottom: 12 }} />
            <Title level={3} style={{ marginBottom: 8 }}>
              {isNewUser ? '首次登录 - 设置账号' : '设置登录密码'}
            </Title>
            <Text type="secondary">
              {isNewUser ? '请填写信息并设置密码' : '为您的账号设置登录密码'}
            </Text>
          </div>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Input
              size="large"
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="MIS号"
              value={mis}
              disabled
              style={{ height: 48 }}
            />

            {isNewUser && (
              <Input
                size="large"
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="请输入姓名（真实姓名）"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ height: 48 }}
              />
            )}

            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="设置密码（至少4位）"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              style={{ height: 48 }}
            />

            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onPressEnter={handleSetup}
              style={{ height: 48 }}
            />

            <Button
              type="primary"
              size="large"
              onClick={handleSetup}
              loading={loading}
              disabled={!password || !confirmPassword}
              block
              style={{ height: 48, fontSize: 16 }}
            >
              {isNewUser ? '注册并进入系统' : '设置密码并登录'}
            </Button>

            <Button
              type="link"
              block
              onClick={() => router.push('/login')}
            >
              返回登录
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}><span style={{ color: '#fff', fontSize: 16 }}>加载中...</span></div>}>
      <SetupForm />
    </Suspense>
  );
}
