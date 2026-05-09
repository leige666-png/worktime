'use client';

import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Tag, List, Space, message } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { getDashboardStats, getRecentRecords, getPendingApprovals } from '@/lib/services/dashboard';
import dayjs from 'dayjs';

const { Title } = Typography;

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待审批' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
  revoked: { color: 'default', text: '已撤回' },
};

export default function DashboardPage() {
  const { user, hasRole } = useAuthStore();
  const [stats, setStats] = useState({ totalOvertimeHours: 0, totalWorklossHours: 0, pendingCount: 0, approvedCount: 0 });
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<{ overtime: any[]; workloss: any[] }>({ overtime: [], workloss: [] });
  const [loading, setLoading] = useState(true);

  const canApprove = hasRole('admin') || hasRole('team_lead') || hasRole('reviewer');

  useEffect(() => {
    if (!user) return;

    const loadDashboard = async () => {
      try {
        const [statsData, recentData] = await Promise.all([
          getDashboardStats(user.id),
          getRecentRecords(user.id),
        ]);
        setStats(statsData);
        setRecentRecords(recentData);

        if (canApprove) {
          const approvals = await getPendingApprovals(user.id);
          setPendingApprovals(approvals);
        }
      } catch (error: any) {
        message.error('加载数据失败');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [user, canApprove]);

  const totalPendingApprovals = pendingApprovals.overtime.length + pendingApprovals.workloss.length;

  return (
    <div>
      <Title level={4}>
        {user?.name ? `${user.name}，` : ''}欢迎回来
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="本月加班时长"
              value={stats.totalOvertimeHours}
              suffix="小时"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="本月工损时长"
              value={stats.totalWorklossHours}
              suffix="小时"
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="我的待审批"
              value={stats.pendingCount}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="已通过"
              value={stats.approvedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="最近加班记录" extra={<a href="/overtime">查看全部</a>} loading={loading}>
            {recentRecords.length > 0 ? (
              <List
                size="small"
                dataSource={recentRecords}
                renderItem={(item: any) => (
                  <List.Item>
                    <Space>
                      <span>{item.date}</span>
                      <Tag color={item.overtime_types?.color}>{item.overtime_types?.name}</Tag>
                      <span>{Math.floor((item.duration_minutes || 0) / 60)}h{(item.duration_minutes || 0) % 60}m</span>
                    </Space>
                    <Tag color={statusMap[item.status]?.color}>{statusMap[item.status]?.text}</Tag>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无记录，去<a href="/overtime">申报加班</a>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="待处理审批"
            extra={canApprove ? <Tag color="red">{totalPendingApprovals}</Tag> : null}
            loading={loading}
          >
            {canApprove && totalPendingApprovals > 0 ? (
              <List
                size="small"
                dataSource={[
                  ...pendingApprovals.overtime.map((r) => ({ ...r, _type: '加班' })),
                  ...pendingApprovals.workloss.map((r) => ({ ...r, _type: '工损' })),
                ]}
                renderItem={(item: any) => (
                  <List.Item>
                    <Space>
                      <Tag color={item._type === '加班' ? 'blue' : 'orange'}>{item._type}</Tag>
                      <span>{item.users?.name}</span>
                      <span>{item.date}</span>
                      <span>{Math.floor((item.duration_minutes || 0) / 60)}h</span>
                    </Space>
                    <a href={item._type === '加班' ? '/overtime' : '/workloss'}>去审批</a>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                {canApprove ? '暂无待处理审批' : '您没有审批权限'}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
