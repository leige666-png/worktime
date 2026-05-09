'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  DatePicker,
  Select,
  Modal,
  Form,
  Input,
  InputNumber,
  TimePicker,
  message,
  Tooltip,
  Popconfirm,
} from 'antd';
import { PlusOutlined, ExportOutlined, WarningOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import {
  getWorklossRecords,
  getWorklossTypes,
  createWorklossRecord,
  revokeWorklossRecord,
  approveWorklossRecord,
  rejectWorklossRecord,
} from '@/lib/services/workloss';
import type { WorklossType } from '@/types/database';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待审批' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
  revoked: { color: 'default', text: '已撤回' },
};

const impactMap: Record<string, { color: string; text: string }> = {
  low: { color: 'blue', text: '低' },
  medium: { color: 'orange', text: '中' },
  high: { color: 'red', text: '高' },
  critical: { color: 'purple', text: '严重' },
};

export default function WorklossPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [types, setTypes] = useState<WorklossType[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [impactFilter, setImpactFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [form] = Form.useForm();
  const { user, hasRole } = useAuthStore();

  const canApprove = hasRole('admin') || hasRole('team_lead') || hasRole('reviewer');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (!canApprove) params.userId = user?.id;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.typeId = typeFilter;
      if (impactFilter) params.impactLevel = impactFilter;
      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const [recordsData, typesData] = await Promise.all([
        getWorklossRecords(params),
        getWorklossTypes(),
      ]);
      setRecords(recordsData || []);
      setTypes(typesData || []);
    } catch (error: any) {
      message.error('加载数据失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, impactFilter, dateRange, user?.id, canApprove]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const date = values.date.format('YYYY-MM-DD');
      const [startTime, endTime] = values.time_range;

      await createWorklossRecord({
        user_id: user!.id,
        type_id: values.type_id,
        date,
        start_time: `${date}T${startTime.format('HH:mm')}:00`,
        end_time: `${date}T${endTime.format('HH:mm')}:00`,
        description: values.description,
        impact_level: values.impact_level,
        affected_tasks: values.affected_tasks,
        workload_lost: values.workload_lost,
        efficiency_before: values.efficiency_before || 1.0,
        efficiency_after: values.efficiency_after || 0.0,
      });

      message.success('工损申报提交成功');
      setIsModalOpen(false);
      form.resetFields();
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('提交失败：' + error.message);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeWorklossRecord(id);
      message.success('已撤回');
      loadData();
    } catch (error: any) {
      message.error('撤回失败：' + error.message);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveWorklossRecord(id, user!.id);
      message.success('已通过');
      loadData();
    } catch (error: any) {
      message.error('操作失败：' + error.message);
    }
  };

  const handleReject = async (id: string) => {
    Modal.confirm({
      title: '驳回原因',
      content: (
        <Input.TextArea id="reject-reason-wl" rows={3} placeholder="请输入驳回原因" />
      ),
      onOk: async () => {
        const reason = (document.getElementById('reject-reason-wl') as HTMLTextAreaElement)?.value;
        if (!reason) {
          message.warning('请输入驳回原因');
          return Promise.reject();
        }
        await rejectWorklossRecord(id, user!.id, reason);
        message.success('已驳回');
        loadData();
      },
    });
  };

  const columns = [
    {
      title: '申报人',
      key: 'user',
      render: (_: unknown, record: any) => record.users?.name || '-',
      hidden: !canApprove,
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: '时间段',
      key: 'time_range',
      render: (_: unknown, record: any) =>
        `${dayjs(record.start_time).format('HH:mm')} - ${dayjs(record.end_time).format('HH:mm')}`,
    },
    {
      title: '时长',
      dataIndex: 'duration_minutes',
      key: 'duration_minutes',
      render: (min: number) => `${Math.floor(min / 60)}h${min % 60}m`,
    },
    {
      title: '类型',
      key: 'type',
      render: (_: unknown, record: any) => (
        <Tag color={record.workloss_types?.color}>
          {record.workloss_types?.name || '-'}
        </Tag>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 180,
    },
    {
      title: '影响',
      dataIndex: 'impact_level',
      key: 'impact_level',
      render: (level: string) => {
        const i = impactMap[level] || { color: 'default', text: level };
        return <Tag color={i.color}>{i.text}</Tag>;
      },
    },
    {
      title: '异常',
      key: 'anomaly',
      render: (_: unknown, record: any) =>
        record.anomaly_flag ? (
          <Tooltip title={record.anomaly_reason}>
            <Tag color="red" icon={<WarningOutlined />}>异常</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">正常</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: any) => (
        <Space>
          {record.status === 'pending' && record.user_id === user?.id && (
            <Popconfirm title="确定撤回？" onConfirm={() => handleRevoke(record.id)}>
              <a style={{ color: '#ff4d4f' }}>撤回</a>
            </Popconfirm>
          )}
          {record.status === 'pending' && canApprove && record.user_id !== user?.id && (
            <>
              <a style={{ color: '#52c41a' }} onClick={() => handleApprove(record.id)}>通过</a>
              <a style={{ color: '#ff4d4f' }} onClick={() => handleReject(record.id)}>驳回</a>
            </>
          )}
        </Space>
      ),
    },
  ].filter((col) => !col.hidden);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>工损申报</Title>
        <Space>
          <Button icon={<ExportOutlined />}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            新增申报
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Select placeholder="状态" style={{ width: 110 }} allowClear value={statusFilter} onChange={setStatusFilter}
            options={[
              { value: 'pending', label: '待审批' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
            ]}
          />
          <Select placeholder="工损类型" style={{ width: 130 }} allowClear value={typeFilter} onChange={setTypeFilter}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select placeholder="影响等级" style={{ width: 110 }} allowClear value={impactFilter} onChange={setImpactFilter}
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
              { value: 'critical', label: '严重' },
            ]}
          />
          <Button onClick={loadData}>查询</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={records} rowKey="id" loading={loading}
        pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal title="新增工损申报" open={isModalOpen} onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)} width={600} okText="提交"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="工损日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="time_range" label="工损时段" rules={[{ required: true, message: '请选择时段' }]}>
            <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type_id" label="工损类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select placeholder="选择工损类型" options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="description" label="工损描述" rules={[{ required: true, message: '请描述工损原因' }]}>
            <Input.TextArea rows={3} placeholder="详细描述工损原因和影响" />
          </Form.Item>
          <Form.Item name="impact_level" label="影响等级" rules={[{ required: true, message: '请选择影响等级' }]}>
            <Select placeholder="选择影响等级" options={[
              { value: 'low', label: '低 - 轻微影响，可自行恢复' },
              { value: 'medium', label: '中 - 一般影响，需要协调' },
              { value: 'high', label: '高 - 严重影响，阻塞进度' },
              { value: 'critical', label: '严重 - 完全阻塞，无法工作' },
            ]} />
          </Form.Item>
          <Form.Item name="affected_tasks" label="受影响任务">
            <Input.TextArea rows={2} placeholder="列出受影响的任务或项目（可选）" />
          </Form.Item>
          <Form.Item name="workload_lost" label="损失工作量">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} placeholder="预估损失的工作量" />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="efficiency_before" label="工损前效率" initialValue={1.0} style={{ flex: 1 }}>
              <InputNumber min={0.1} max={2.0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="efficiency_after" label="工损后效率" initialValue={0.0} style={{ flex: 1 }}>
              <InputNumber min={0} max={2.0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
