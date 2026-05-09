'use client';

import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, List, Tag, Empty, Button, Space, Spin } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { overtimeDB, worklossDB, notificationDB, permissionRequestDB } from '@/lib/db';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { user, canReview } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    monthOvertimeHours: 0,
    monthWorklossHours: 0,
    pendingApproval: 0,
    anomalyCount: 0,
    pendingPermissions: 0,
  });
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    async function loadData() {
      try {
        const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
        const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

        // 本月加班时长（已审批）
        const myOvertime = await overtimeDB.getByUser(user!.id);
        const overtimeRecords = myOvertime.filter(r => r.status === 'approved' && r.date >= monthStart && r.date <= monthEnd);
        const monthOvertimeMinutes = overtimeRecords.reduce((sum, r) => sum + r.timeDuration, 0);

        // 本月工损时长（已审批）
        const myWorkloss = await worklossDB.getByUser(user!.id);
        const worklossRecords = myWorkloss.filter(r => r.status === 'approved' && r.date >= monthStart && r.date <= monthEnd);
        const monthWorklossMinutes = worklossRecords.reduce((sum, r) => sum + r.timeDuration, 0);

        // 待审批数量
        let pendingApproval = 0;
        let pendingPermissions = 0;
        if (canReview()) {
          const pendingOt = await overtimeDB.getPending();
          const pendingWl = await worklossDB.getPending();
          pendingApproval = pendingOt.length + pendingWl.length;
          const pendingPerm = await permissionRequestDB.getPending();
          pendingPermissions = pendingPerm.length;
        }

        // 异常记录数
        const anomalyCount = myOvertime.filter(r => r.hasAnomaly).length + myWorkloss.filter(r => r.hasAnomaly).length;

        setStats({
          monthOvertimeHours: Math.round(monthOvertimeMinutes / 60 * 10) / 10,
          monthWorklossHours: Math.round(monthWorklossMinutes / 60 * 10) / 10,
          pendingApproval,
          anomalyCount,
          pendingPermissions,
        });

        // 最近通知
        const notifications = await notificationDB.getByUser(user!.id);
        setRecentNotifications(notifications.slice(0, 8));
      } catch (error) {
        console.error('Dashboard load error:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, canReview]);

  if (!user) return null;
  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin tip="加载数据中..." /></div>;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        欢迎回来，{user.name}
      </Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => router.push('/overtime')}>
            <Statistic
              title="本月加班时长"
              value={stats.monthOvertimeHours}
              suffix="小时"
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => router.push('/workloss')}>
            <Statistic
              title="本月工损时长"
              value={stats.monthWorklossHours}
              suffix="小时"
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        {canReview() && (
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Statistic
                title="待审批"
                value={stats.pendingApproval + stats.pendingPermissions}
                suffix="条"
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
        )}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="异常记录"
              value={stats.anomalyCount}
              suffix="条"
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: stats.anomalyCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 快捷操作 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card title="快捷操作" size="small">
            <Space wrap>
              <Button type="primary" onClick={() => router.push('/overtime')}>填报加班</Button>
              <Button onClick={() => router.push('/workloss')}>填报工损</Button>
              {canReview() && <Button onClick={() => router.push('/statistics')}>查看统计</Button>}
              <Button onClick={() => router.push('/profile')}>个人中心</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 最近通知 */}
      <Card
        title={<><BellOutlined /> 最近通知</>}
        size="small"
        extra={<a onClick={() => router.push('/profile')}>查看全部</a>}
      >
        {recentNotifications.length > 0 ? (
          <List
            size="small"
            dataSource={recentNotifications}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      {!item.isRead && <Tag color="red" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>新</Tag>}
                      <Text style={{ fontSize: 13 }}>{item.title}</Text>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.content?.slice(0, 60)}{item.content?.length > 60 ? '...' : ''} · {dayjs(item.createdAt).format('MM-DD HH:mm')}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </div>
  );
}
