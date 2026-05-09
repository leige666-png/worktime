'use client';

import { useState, useEffect } from 'react';
import { Card, Tabs, List, Tag, Button, Typography, Space, Statistic, Row, Col, Empty, Modal, Form, Input, Select, message, Badge, Spin } from 'antd';
import { UserOutlined, KeyOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { notificationDB, overtimeDB, worklossDB, permissionRequestDB, taskDB, generateId, now } from '@/lib/db';
import { changePassword } from '@/lib/supabase/auth';
import { ROLE_LABELS } from '@/types/database';
import type { Notification, TaskAssignment } from '@/types/database';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [passwordModal, setPasswordModal] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [passwordForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [monthStats, setMonthStats] = useState({ overtimeHours: 0, worklossHours: 0, recordCount: 0 });

  const loadData = async () => {
    if (!user) return;
    try {
      const notifs = await notificationDB.getByUser(user.id);
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.isRead).length);

      const userTasks = await taskDB.getByUser(user.id);
      setTasks(userTasks);

      const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
      const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
      const myOvertime = await overtimeDB.getByUser(user.id);
      const myWorkloss = await worklossDB.getByUser(user.id);
      const approvedOt = myOvertime.filter(r => r.status === 'approved' && r.date >= monthStart && r.date <= monthEnd);
      const approvedWl = myWorkloss.filter(r => r.status === 'approved' && r.date >= monthStart && r.date <= monthEnd);

      setMonthStats({
        overtimeHours: Math.round(approvedOt.reduce((s, r) => s + r.timeDuration, 0) / 60 * 10) / 10,
        worklossHours: Math.round(approvedWl.reduce((s, r) => s + r.timeDuration, 0) / 60 * 10) / 10,
        recordCount: approvedOt.length + approvedWl.length,
      });
    } catch (error) {
      console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    await notificationDB.markAllRead(user.id);
    await loadData();
    message.success('已全部标为已读');
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (!user) return;
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次密码不一致');
        return;
      }
      await changePassword(user.mis, values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      setPasswordModal(false);
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.message || '修改失败');
    }
  };

  const handleRequestRole = async () => {
    try {
      const values = await roleForm.validateFields();
      if (!user) return;

      const pending = await permissionRequestDB.getByUser(user.id);
      if (pending.filter(r => r.status === 'pending').length > 0) {
        message.warning('您已有待处理的权限申请，请等待审批');
        return;
      }

      await permissionRequestDB.add({
        id: generateId(),
        userId: user.id,
        userName: user.name,
        userMis: user.mis,
        requestedRole: values.role,
        reason: values.reason,
        status: 'pending',
        reviewerId: null,
        reviewerName: null,
        reviewComment: null,
        reviewedAt: null,
        createdAt: now(),
      });

      message.success('权限申请已提交，等待管理员审批');
      setRoleModal(false);
      roleForm.resetFields();
    } catch { /* validation */ }
  };

  const handleTaskStatus = async (taskId: string, status: 'in_progress' | 'completed') => {
    await taskDB.update(taskId, { status, updatedAt: now() });
    await loadData();
    message.success(status === 'completed' ? '任务已完成' : '已开始处理');
  };

  if (!user) return null;
  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin tip="加载中..." /></div>;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#667eea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
          </Col>
          <Col flex={1}>
            <Title level={4} style={{ margin: 0 }}>{user.name}</Title>
            <Space style={{ marginTop: 4 }}>
              <Text type="secondary">MIS: {user.mis}</Text>
              <Tag color={user.role === 'admin' ? 'red' : user.role === 'team_lead' ? 'orange' : user.role === 'reviewer' ? 'blue' : 'default'}>
                {ROLE_LABELS[user.role]}
              </Tag>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button size="small" icon={<KeyOutlined />} onClick={() => setPasswordModal(true)}>修改密码</Button>
              {user.role === 'member' && (
                <Button size="small" icon={<SafetyOutlined />} type="primary" ghost onClick={() => setRoleModal(true)}>申请权限</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="本月加班" value={monthStats.overtimeHours} suffix="小时" /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="本月工损" value={monthStats.worklossHours} suffix="小时" /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="本月记录" value={monthStats.recordCount} suffix="条" /></Card></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'notifications',
            label: <Badge count={unreadCount} size="small" offset={[8, -2]}>通知消息</Badge>,
            children: (
              <Card size="small" extra={notifications.length > 0 && <Button type="link" size="small" onClick={handleMarkAllRead}>全部已读</Button>}>
                {notifications.length > 0 ? (
                  <List
                    size="small"
                    dataSource={notifications.slice(0, 30)}
                    renderItem={(item) => (
                      <List.Item
                        style={{ opacity: item.isRead ? 0.6 : 1, cursor: 'pointer' }}
                        onClick={async () => { await notificationDB.markRead(item.id); await loadData(); }}
                      >
                        <List.Item.Meta
                          title={<Text style={{ fontSize: 13 }}>{!item.isRead && '🔴 '}{item.title}</Text>}
                          description={<Text type="secondary" style={{ fontSize: 12 }}>{item.content} · {dayjs(item.createdAt).format('MM-DD HH:mm')}</Text>}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            ),
          },
          {
            key: 'tasks',
            label: `我的任务 (${tasks.filter(t => t.status !== 'completed').length})`,
            children: (
              <Card size="small">
                {tasks.length > 0 ? (
                  <List
                    size="small"
                    dataSource={tasks}
                    renderItem={(item) => (
                      <List.Item
                        actions={
                          item.status === 'pending' ? [
                            <Button size="small" type="link" onClick={() => handleTaskStatus(item.id, 'in_progress')}>开始</Button>,
                          ] : item.status === 'in_progress' ? [
                            <Button size="small" type="link" onClick={() => handleTaskStatus(item.id, 'completed')}>完成</Button>,
                          ] : []
                        }
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text>{item.title}</Text>
                              <Tag color={item.status === 'completed' ? 'success' : item.status === 'in_progress' ? 'processing' : 'default'}>
                                {item.status === 'completed' ? '已完成' : item.status === 'in_progress' ? '进行中' : '待处理'}
                              </Tag>
                            </Space>
                          }
                          description={<Text type="secondary" style={{ fontSize: 12 }}>{item.description} · 分配人：{item.assignedByName}{item.dueDate ? ` · 截止：${item.dueDate}` : ''}</Text>}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            ),
          },
        ]}
      />

      <Modal title="修改密码" open={passwordModal} onOk={handleChangePassword} onCancel={() => setPasswordModal(false)} okText="确认修改">
        <Form form={passwordForm} layout="vertical">
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true }]}><Input.Password /></Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 4, message: '至少4位' }]}><Input.Password /></Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>

      <Modal title="申请权限提升" open={roleModal} onOk={handleRequestRole} onCancel={() => setRoleModal(false)} okText="提交申请">
        <Form form={roleForm} layout="vertical">
          <Form.Item name="role" label="申请角色" rules={[{ required: true, message: '请选择' }]}>
            <Select placeholder="请选择要申请的角色">
              <Select.Option value="reviewer">审核员 - 可审批加班/工损记录</Select.Option>
              <Select.Option value="team_lead">小组长 - 可管理人员和审批</Select.Option>
              <Select.Option value="admin">管理员 - 最高权限</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="reason" label="申请理由" rules={[{ required: true, message: '请填写理由' }]}>
            <Input.TextArea placeholder="请说明申请该权限的理由" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
