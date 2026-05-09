'use client';

import { useState } from 'react';
import { Button, Card, Typography, Space, message } from 'antd';
import { SafetyOutlined, LoadingOutlined } from '@ant-design/icons';
import { signInWithMeituanSSO } from '@/lib/supabase/auth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleSSOLogin = async () => {
    try {
      setLoading(true);
      await signInWithMeituanSSO();
    } catch (error: any) {
      message.error('登录失败：' + (error.message || '未知错误'));
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
        style={{ width: 400, textAlign: 'center', borderRadius: 12 }}
        styles={{ body: { padding: 48 } }}
      >
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              工时管理系统
            </Title>
            <Text type="secondary">WorkTime Management System</Text>
          </div>

          <Button
            type="primary"
            size="large"
            icon={loading ? <LoadingOutlined /> : <SafetyOutlined />}
            onClick={handleSSOLogin}
            loading={loading}
            block
            style={{ height: 48, fontSize: 16 }}
          >
            美团 SSO 登录
          </Button>

          <Text type="secondary" style={{ fontSize: 12 }}>
            使用美团统一身份认证登录，首次登录将自动创建账号
          </Text>
        </Space>
      </Card>
    </div>
  );
}
