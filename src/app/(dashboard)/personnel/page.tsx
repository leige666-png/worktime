'use client';

import { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Badge, Tooltip, Empty, Spin } from 'antd';
import { UserAddOutlined, TeamOutlined, SafetyOutlined, PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, SendOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { userDB, groupDB, permissionRequestDB, taskDB, generateId, now } from '@/lib/db';
import { ROLE_LABELS } from '@/types/database';
import type { User, Group, PermissionRequest, UserRole } from '@/types/database';
import dayjs from 'dayjs';

export default function PersonnelPage() {
  const { user, hasRole } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [activeTab, setActiveTab] = useState('users');

  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [roleModal, setRoleModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [taskTargetUser, setTaskTargetUser] = useState<User | null>(null);
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewingRequest, setReviewingRequest] = useState<PermissionRequest | null>(null);

  const [groupForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [reviewForm] = Form.useForm();

  const loadData = async () => {
    try {
      const [u, g, r] = await Promise.all([userDB.getAll(), groupDB.getAll(), permissionRequestDB.getAll()]);
      setUsers(u);
      setGroups(g);
      setRequests(r);
    } catch (error) {
      console.error('Personnel load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const canManage = hasRole('team_lead');
  const isAdmin = hasRole('admin');

  const handleChangeRole = (targetUser: User) => {
    setEditingUser(targetUser);
    roleForm.setFieldsValue({ role: targetUser.role, groupId: targetUser.groupId });
    setRoleModal(true);
  };

  const handleSaveRole = async () => {
    try {
      const values = await roleForm.validateFields();
      if (!editingUser || !user) return;
      await userDB.update(editingUser.id, { role: values.role, groupId: values.groupId || null });
      if (values.groupId) await groupDB.refreshMemberCount(values.groupId);
      if (editingUser.groupId && editingUser.groupId !== values.groupId) {
        await groupDB.refreshMemberCount(editingUser.groupId);
      }
      message.success('用户信息已更新');
      setRoleModal(false);
      await loadData();
    } catch { /* validation */ }
  };

  const handleDeleteUser = async (targetUser: User) => {
    await userDB.delete(targetUser.id);
    if (targetUser.groupId) await groupDB.refreshMemberCount(targetUser.groupId);
    message.success('用户已删除');
    await loadData();
  };

  const handleAssignTask = (targetUser: User) => {
    setTaskTargetUser(targetUser);
    taskForm.resetFields();
    setTaskModal(true);
  };

  const handleSaveTask = async () => {
    try {
      const values = await taskForm.validateFields();
      if (!taskTargetUser || !user) return;
      await taskDB.add({
        id: generateId(),
        userId: taskTargetUser.id,
        userName: taskTargetUser.name,
        title: values.title,
        description: values.description || null,
        assignedBy: user.id,
        assignedByName: user.name,
        status: 'pending',
        dueDate: values.dueDate || null,
        createdAt: now(),
        updatedAt: now(),
      });
      message.success(`已向 ${taskTargetUser.name} 分配任务`);
      setTaskModal(false);
    } catch { /* validation */ }
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    groupForm.resetFields();
    setGroupModal(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    groupForm.setFieldsValue({ name: group.name, description: group.description, color: group.color, leaderId: group.leaderId });
    setGroupModal(true);
  };

  const handleSaveGroup = async () => {
    try {
      const values = await groupForm.validateFields();
      const color = values.color || '#1890ff';
      const leader = values.leaderId ? await userDB.getById(values.leaderId) : null;

      if (editingGroup) {
        await groupDB.update(editingGroup.id, {
          name: values.name,
          description: values.description || null,
          color,
          leaderId: values.leaderId || null,
          leaderName: leader?.name || null,
          updatedAt: now(),
        });
        message.success('分组已更新');
      } else {
        await groupDB.add({
          id: generateId(),
          name: values.name,
          description: values.description || null,
          color,
          leaderId: values.leaderId || null,
          leaderName: leader?.name || null,
          memberCount: 0,
          createdAt: now(),
          updatedAt: now(),
        });
        message.success('分组已创建');
      }
      setGroupModal(false);
      await loadData();
    } catch { /* validation */ }
  };

  const handleDeleteGroup = async (group: Group) => {
    await groupDB.delete(group.id);
    message.success('分组已删除');
    await loadData();
  };

  const handleReview = (request: PermissionRequest) => {
    setReviewingRequest(request);
    reviewForm.resetFields();
    setReviewModal(true);
  };

  const handleApproveRequest = async () => {
    if (!reviewingRequest || !user) return;
    const values = await reviewForm.validateFields();
    await permissionRequestDB.approve(reviewingRequest.id, user.id, user.name, values.comment);
    message.success('已批准权限申请');
    setReviewModal(false);
    await loadData();
  };

  const handleRejectRequest = async () => {
    if (!reviewingRequest || !user) return;
    const comment = reviewForm.getFieldValue('comment');
    await permissionRequestDB.reject(reviewingRequest.id, user.id, user.name, comment || '管理员拒绝');
    message.success('已拒绝权限申请');
    setReviewModal(false);
    await loadData();
  };

  const userColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: 'MIS', dataIndex: 'mis', key: 'mis', width: 120 },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 100,
      render: (role: UserRole) => <Tag color={role === 'admin' ? 'red' : role === 'team_lead' ? 'orange' : role === 'reviewer' ? 'blue' : 'default'}>{ROLE_LABELS[role]}</Tag>,
    },
    {
      title: '分组', key: 'group', width: 120,
      render: (_: unknown, record: User) => {
        const group = groups.find(g => g.id === record.groupId);
        return group ? <Tag color={group.color}>{group.name}</Tag> : <span style={{ color: '#999' }}>未分组</span>;
      },
    },
    {
      title: '最后登录', dataIndex: 'lastLogin', key: 'lastLogin', width: 140,
      render: (v: string | null) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: User) => {
        if (!canManage || record.id === user?.id) return null;
        return (
          <Space size="small">
            {isAdmin && <Tooltip title="修改角色/分组"><Button size="small" icon={<EditOutlined />} onClick={() => handleChangeRole(record)} /></Tooltip>}
            <Tooltip title="分配任务"><Button size="small" icon={<SendOutlined />} onClick={() => handleAssignTask(record)} /></Tooltip>
            {isAdmin && <Popconfirm title="确定删除该用户？" onConfirm={() => handleDeleteUser(record)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
          </Space>
        );
      },
    },
  ];

  const groupColumns = [
    {
      title: '分组名称', key: 'name', width: 150,
      render: (_: unknown, record: Group) => <Space><div style={{ width: 12, height: 12, borderRadius: 2, background: record.color }} /><span>{record.name}</span></Space>,
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '组长', dataIndex: 'leaderName', key: 'leaderName', width: 100, render: (v: string | null) => v || '-' },
    { title: '成员数', dataIndex: 'memberCount', key: 'memberCount', width: 80 },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: unknown, record: Group) => canManage ? (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditGroup(record)} />
          <Popconfirm title="删除分组后，组内成员将变为未分组" onConfirm={() => handleDeleteGroup(record)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ) : null,
    },
  ];

  const requestColumns = [
    { title: '申请人', dataIndex: 'userName', key: 'userName', width: 100 },
    { title: 'MIS', dataIndex: 'userMis', key: 'userMis', width: 120 },
    { title: '申请角色', dataIndex: 'requestedRole', key: 'requestedRole', width: 100, render: (role: UserRole) => <Tag color="blue">{ROLE_LABELS[role]}</Tag> },
    { title: '理由', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (status: string) => <Tag color={status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'processing'}>{status === 'approved' ? '已通过' : status === 'rejected' ? '已拒绝' : '待审批'}</Tag> },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, record: PermissionRequest) => {
        if (record.status !== 'pending' || !isAdmin) return null;
        return <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleReview(record)}>审批</Button>;
      },
    },
  ];

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin tip="加载中..." /></div>;

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'users',
            label: <Space><UserAddOutlined />人员列表 ({users.length})</Space>,
            children: <Card size="small"><Table columns={userColumns} dataSource={users} rowKey="id" size="small" pagination={{ pageSize: 15 }} /></Card>,
          },
          {
            key: 'groups',
            label: <Space><TeamOutlined />分组管理 ({groups.length})</Space>,
            children: (
              <Card size="small" extra={canManage && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddGroup}>新建分组</Button>}>
                <Table columns={groupColumns} dataSource={groups} rowKey="id" size="small" pagination={false} locale={{ emptyText: <Empty description="暂无分组" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
              </Card>
            ),
          },
          {
            key: 'requests',
            label: <Badge count={pendingCount} size="small" offset={[8, -2]}><Space><SafetyOutlined />权限审批</Space></Badge>,
            children: (
              <Card size="small">
                <Table columns={requestColumns} dataSource={requests.sort((a, b) => { if (a.status === 'pending' && b.status !== 'pending') return -1; if (a.status !== 'pending' && b.status === 'pending') return 1; return b.createdAt.localeCompare(a.createdAt); })} rowKey="id" size="small" pagination={{ pageSize: 10 }} locale={{ emptyText: <Empty description="暂无权限申请" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
              </Card>
            ),
          },
        ]}
      />

      <Modal title={`编辑用户：${editingUser?.name}`} open={roleModal} onOk={handleSaveRole} onCancel={() => setRoleModal(false)} okText="保存">
        <Form form={roleForm} layout="vertical">
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="team_lead">小组长</Select.Option>
              <Select.Option value="reviewer">审核员</Select.Option>
              <Select.Option value="member">普通成员</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="groupId" label="所属分组">
            <Select allowClear placeholder="选择分组">{groups.map(g => <Select.Option key={g.id} value={g.id}>{g.name}</Select.Option>)}</Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingGroup ? '编辑分组' : '新建分组'} open={groupModal} onOk={handleSaveGroup} onCancel={() => setGroupModal(false)} okText="保存">
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}><Input placeholder="如：A组、B组" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea placeholder="分组描述（可选）" rows={2} /></Form.Item>
          <Form.Item name="color" label="标识颜色" initialValue="#1890ff"><Input type="color" style={{ width: 60, height: 32 }} /></Form.Item>
          <Form.Item name="leaderId" label="组长">
            <Select allowClear placeholder="选择组长">{users.filter(u => u.role !== 'member').map(u => <Select.Option key={u.id} value={u.id}>{u.name}（{u.mis}）</Select.Option>)}</Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`分配任务给：${taskTargetUser?.name}`} open={taskModal} onOk={handleSaveTask} onCancel={() => setTaskModal(false)} okText="分配">
        <Form form={taskForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}><Input placeholder="简要描述任务" /></Form.Item>
          <Form.Item name="description" label="详细描述"><Input.TextArea placeholder="任务详细说明（可选）" rows={3} /></Form.Item>
          <Form.Item name="dueDate" label="截止日期"><Input type="date" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="审批权限申请"
        open={reviewModal}
        onCancel={() => setReviewModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setReviewModal(false)}>取消</Button>,
          <Button key="reject" danger onClick={handleRejectRequest}>拒绝</Button>,
          <Button key="approve" type="primary" onClick={handleApproveRequest}>批准</Button>,
        ]}
      >
        {reviewingRequest && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>申请人：</strong>{reviewingRequest.userName}（{reviewingRequest.userMis}）</p>
            <p><strong>申请角色：</strong>{ROLE_LABELS[reviewingRequest.requestedRole]}</p>
            <p><strong>申请理由：</strong>{reviewingRequest.reason}</p>
          </div>
        )}
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="comment" label="审批意见"><Input.TextArea placeholder="填写审批意见（可选）" rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
