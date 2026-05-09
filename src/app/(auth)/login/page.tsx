'use client';

import { useState } from 'react';
import { Button, Card, Typography, Space, Input, message, Divider, Tabs } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, UserAddOutlined, IdcardOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { signInWithPassword, registerUser } from '@/lib/supabase/auth';
import { useAuthStore } from '@/lib/store/auth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const router = useRouter();
  const { setUser } = useAuthStore();

  // 登录表单
  const [loginMis, setLoginMis] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // 注册表单
  const [regMis, setRegMis] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async () => {
    if (!loginMis.trim()) { message.warning('请输入MIS号'); return; }
    if (!loginPassword) { message.warning('请输入密码'); return; }

    try {
      setLoginLoading(true);
      const user = await signInWithPassword(loginMis, loginPassword);
      setUser(user);
      message.success(`欢迎回来，${user.name}`);
      router.push('/dashboard');
    } catch (error: any) {
      message.error(error.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regMis.trim()) { message.warning('请输入MIS号'); return; }
    if (!regName.trim()) { message.warning('请输入姓名'); return; }
    if (!regPassword || regPassword.length < 4) { message.warning('密码至少4位'); return; }
    if (regPassword !== regConfirm) { message.warning('两次密码不一致'); return; }

    try {
      setRegLoading(true);
      const user = await registerUser(regMis, regName, regPassword);
      setUser(user);
      if (user.role === 'admin') {
        message.success('注册成功！您是第一位用户，已自动获得管理员权限');
      } else {
        message.success('注册成功！您可以在个人中心申请更高权限');
      }
      router.push('/dashboard');
    } catch (error: any) {
      message.error(error.message || '注册失败');
    } finally {
      setRegLoading(false);
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
        style={{ width: 440, borderRadius: 12 }}
        styles={{ body: { padding: '40px 40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 4 }}>工时管理系统</Title>
          <Text type="secondary">WorkTime Management System</Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'login' | 'register')}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 8 }}>
                  <Input
                    size="large"
                    prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="请输入MIS号"
                    value={loginMis}
                    onChange={(e) => setLoginMis(e.target.value)}
                    style={{ height: 46 }}
                  />
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="请输入密码"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onPressEnter={handleLogin}
                    style={{ height: 46 }}
                  />
                  <Button
                    type="primary"
                    size="large"
                    icon={<LoginOutlined />}
                    onClick={handleLogin}
                    loading={loginLoading}
                    disabled={!loginMis || !loginPassword}
                    block
                    style={{ height: 46, fontSize: 15 }}
                  >
                    登 录
                  </Button>
                </Space>
              ),
            },
            {
              key: 'register',
              label: '首次注册',
              children: (
                <Space direction="vertical" size={14} style={{ width: '100%', paddingTop: 8 }}>
                  <Input
                    size="large"
                    prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="请输入MIS号"
                    value={regMis}
                    onChange={(e) => setRegMis(e.target.value)}
                    style={{ height: 46 }}
                  />
                  <Input
                    size="large"
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="请输入真实姓名"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{ height: 46 }}
                  />
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="设置密码（至少4位）"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{ height: 46 }}
                  />
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="确认密码"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    onPressEnter={handleRegister}
                    style={{ height: 46 }}
                  />
                  <Button
                    type="primary"
                    size="large"
                    icon={<UserAddOutlined />}
                    onClick={handleRegister}
                    loading={regLoading}
                    disabled={!regMis || !regName || !regPassword || !regConfirm}
                    block
                    style={{ height: 46, fontSize: 15 }}
                  >
                    注册并进入系统
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
                    首位注册用户自动获得管理员权限，后续用户可在系统内申请权限提升
                  </Text>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
