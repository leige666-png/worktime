'use client';

import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, TimePicker, InputNumber, message, Tag, Space, Typography, Popconfirm, Alert, Tabs, Spin } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { overtimeDB, overtimeTypeDB, userDB, groupDB, generateId, now, calcTimeDuration, calcWorkloadDuration, calcDeviation, configDB } from '@/lib/db';
import type { OvertimeRecord, OvertimeType } from '@/types/database';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function OvertimePage() {
  const { user, isAdmin, canReview } = useAuthStore();
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [pendingRecords, setPendingRecords] = useState<OvertimeRecord[]>([]);
  const [types, setTypes] = useState<OvertimeType[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('my');

  const loadData = async () => {
    if (!user) return;
    try {
      const [myRecords, activeTypes] = await Promise.all([
        overtimeDB.getByUser(user.id),
        overtimeTypeDB.getActive(),
      ]);
      setRecords(myRecords);
      setTypes(activeTypes);

      if (canReview()) {
        const pending = await overtimeDB.getPending();
        setPendingRecords(pending);
      }

      if (isAdmin()) {
        const users = await userDB.getActive();
        setAllUsers(users);
      }
    } catch (error) {
      console.error('Load overtime data error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!user) return;

      const selectedType = types.find(t => t.id === values.typeId);
      const startTime = values.startTime.format('HH:mm');
      const endTime = values.endTime.format('HH:mm');
      const timeDuration = calcTimeDuration(startTime, endTime);
      const calculatedDuration = calcWorkloadDuration(values.workload, values.efficiency);
      const cfg = await configDB.get();
      const threshold = cfg.anomalyThreshold;
      const deviationPercent = calcDeviation(timeDuration, calculatedDuration);
      const hasAnomaly = deviationPercent > threshold;

      // 确定提交对象（管理员可代提交）
      let targetUser = user;
      if (values.userId && values.userId !== user.id && isAdmin()) {
        const found = await userDB.getById(values.userId);
        if (found) targetUser = found;
      }

      const group = targetUser.groupId ? await groupDB.getById(targetUser.groupId) : null;

      const record: OvertimeRecord = {
        id: generateId(),
        userId: targetUser.id,
        userName: targetUser.name,
        userMis: targetUser.mis,
        groupId: targetUser.groupId,
        groupName: group?.name || null,
        date: values.date.format('YYYY-MM-DD'),
        startTime,
        endTime,
        timeDuration,
        typeId: values.typeId,
        typeName: selectedType?.name || '',
        task: values.task,
        efficiency: values.efficiency,
        workload: values.workload,
        calculatedDuration,
        hasAnomaly,
        anomalyReason: hasAnomaly ? `时间差${timeDuration}分钟与量级计算${calculatedDuration}分钟偏差${deviationPercent}%` : null,
        deviationPercent,
        proof: values.proof || null,
        status: 'pending',
        submittedBy: user.id,
        submittedByName: user.name,
        reviewerId: null,
        reviewerName: null,
        reviewedAt: null,
        reviewComment: null,
        createdAt: now(),
        updatedAt: now(),
      };

      await overtimeDB.add(record);

      if (hasAnomaly) {
        message.warning(`提交成功，但检测到时长异常（偏差${deviationPercent}%），已通知管理员核实`);
      } else {
        message.success('加班申请已提交，等待审批');
      }

      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error) {
      // form validation error
    }
  };

  const handleApprove = async (id: string) => {
    if (!user) return;
    await overtimeDB.approve(id, user.id, user.name);
    message.success('已通过');
    await loadData();
  };

  const handleReject = (id: string) => {
    if (!user) return;
    Modal.confirm({
      title: '驳回原因',
      content: (
        <Input.TextArea id="reject-reason" placeholder="请输入驳回原因" rows={3} />
      ),
      onOk: async () => {
        const reason = (document.getElementById('reject-reason') as HTMLTextAreaElement)?.value || '审批未通过';
        await overtimeDB.reject(id, user.id, user.name, reason);
        message.success('已驳回');
        await loadData();
      },
    });
  };

  const statusColors: Record<string, string> = { pending: 'processing', approved: 'success', rejected: 'error' };
  const statusLabels: Record<string, string> = { pending: '待审批', approved: '已通过', rejected: '已驳回' };

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '姓名', dataIndex: 'userName', key: 'userName', width: 80 },
    { title: '团队', dataIndex: 'groupName', key: 'groupName', width: 80, render: (v: string) => v || '-' },
    { title: '类型', dataIndex: 'typeName', key: 'typeName', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: '事项', dataIndex: 'task', key: 'task', ellipsis: true },
    { title: '时间段', key: 'time', width: 120, render: (_: any, r: OvertimeRecord) => `${r.startTime}-${r.endTime}` },
    { title: '时长(h)', key: 'duration', width: 80, render: (_: any, r: OvertimeRecord) => (r.timeDuration / 60).toFixed(1) },
    { title: '量级', dataIndex: 'workload', key: 'workload', width: 60 },
    { title: '人效', dataIndex: 'efficiency', key: 'efficiency', width: 60 },
    {
      title: '异常', key: 'anomaly', width: 60,
      render: (_: any, r: OvertimeRecord) => r.hasAnomaly
        ? <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} title={r.anomalyReason || ''} />
        : <CheckOutlined style={{ color: '#52c41a' }} />,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>,
    },
  ];

  const approvalColumns = [
    ...columns,
    {
      title: '操作', key: 'action', width: 140, fixed: 'right' as const,
      render: (_: any, r: OvertimeRecord) => r.status === 'pending' ? (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleApprove(r.id)}>通过</Button>
          <Button type="link" size="small" danger onClick={() => handleReject(r.id)}>驳回</Button>
        </Space>
      ) : null,
    },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin tip="加载中..." /></div>;

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarExtraContent={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            填报加班
          </Button>
        }
        items={[
          {
            key: 'my',
            label: '我的加班',
            children: (
              <Table
                dataSource={records}
                columns={columns}
                rowKey="id"
                size="small"
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 15 }}
              />
            ),
          },
          ...(canReview() ? [{
            key: 'pending',
            label: `待审批 (${pendingRecords.length})`,
            children: (
              <Table
                dataSource={pendingRecords}
                columns={approvalColumns}
                rowKey="id"
                size="small"
                scroll={{ x: 1200 }}
                pagination={{ pageSize: 15 }}
              />
            ),
          }] : []),
        ]}
      />

      {/* 填报弹窗 */}
      <Modal
        title="填报加班"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        width={600}
        okText="提交"
      >
        <Form form={form} layout="vertical" initialValues={{ efficiency: 30, workload: 0 }}>
          {isAdmin() && (
            <Form.Item name="userId" label="提交对象（管理员可代提交）">
              <Select placeholder="默认为自己" allowClear>
                {allUsers.map((u: any) => (
                  <Select.Option key={u.id} value={u.id}>{u.name}（{u.mis}）</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="date" label="加班日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="startTime" label="开始时间" rules={[{ required: true, message: '请选择' }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间" rules={[{ required: true, message: '请选择' }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="typeId" label="加班类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select placeholder="请选择加班类型">
              {types.map(t => (
                <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="task" label="加班事项" rules={[{ required: true, message: '请填写加班事项' }]}>
            <Input.TextArea placeholder="具体的加班内容名称" rows={2} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="efficiency" label="人效（件/小时）" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0.1} step={1} style={{ width: '100%' }} placeholder="该类型的人效" />
            </Form.Item>
            <Form.Item name="workload" label="加班量级（件）" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="完成了多少量级" />
            </Form.Item>
          </Space>
          <Form.Item name="proof" label="证明（ID或截图描述）">
            <Input.TextArea placeholder="请描述加班证据，如任务ID、截图说明等" rows={2} />
          </Form.Item>
          <Alert
            message="时长计算说明"
            description="系统会同时计算两个维度：① 时间差（结束-开始）② 量级÷人效。若两者偏差超过阈值，将触发异常警报由管理员核实。"
            type="info"
            showIcon
            style={{ marginTop: 8 }}
          />
        </Form>
      </Modal>
    </div>
  );
}
