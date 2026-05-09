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
  getOvertimeRecords,
  getOvertimeTypes,
  createOvertimeRecord,
  revokeOvertimeRecord,
  approveOvertimeRecord,
  rejectOvertimeRecord,
} from '@/lib/services/overtime';
import type { OvertimeType } from '@/types/database';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待审批' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
  revoked: { color: 'default', text: '已撤回' },
};

export default function OvertimePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [types, setTypes] = useState<OvertimeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
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
      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const [recordsData, typesData] = await Promise.all([
        getOvertimeRecords(params),
        getOvertimeTypes(),
      ]);
      setRecords(recordsData || []);
      setTypes(typesData || []);
    } catch (error: any) {
      message.error('加载数据失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, dateRange, user?.id, canApprove]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const date = values.date.format('YYYY-MM-DD');
      const [startTime, endTime] = values.time_range;

      await createOvertimeRecord({
        user_id: user!.id,
        type_id: values.type_id,
        date,
        start_time: `${date}T${startTime.format('HH:mm')}:00`,
        end_time: `${date}T${endTime.format('HH:mm')}:00`,
        workload_description: values.workload_description,
        workload_amount: values.workload_amount,
        efficiency_score: values.efficiency_score || 1.0,
      });

      message.success('加班申报提交成功');
      setIsModalOpen(false);
      form.resetFields();
      loadData();
    } catch (error: any) {
      if (error.errorFields) return; // form validation
      message.error('提交失败：' + error.message);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeOvertimeRecord(id);
      message.success('已撤回');
      loadData();
    } catch (error: any) {
      message.error('撤回失败：' + error.message);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveOvertimeRecord(id, user!.id);
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
        <Input.TextArea id="reject-reason" rows={3} placeholder="请输入驳回原因" />
      ),
      onOk: async () => {
        const reason = (document.getElementById('reject-reason') as HTMLTextAreaElement)?.value;
        if (!reason) {
          message.warning('请输入驳回原因');
          return Promise.reject();
        }
        await rejectOvertimeRecord(id, user!.id, reason);
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
        <Tag color={record.overtime_types?.color}>
          {record.overtime_types?.name || '-'}
        </Tag>
      ),
    },
    {
      title: '工作内容',
      dataIndex: 'workload_description',
      key: 'workload_description',
      ellipsis: true,
      width: 200,
    },
    {
      title: '异常',
      key: 'anomaly',
      render: (_: unknown, record: any) =>
        record.anomaly_flag ? (
          <Tooltip title={record.anomaly_reason}>
            <Tag color="red" icon={<WarningOutlined />}>
              异常
            </Tag>
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
              <a style={{ color: '#52c41a' }} onClick={() => handleApprove(record.id)}>
                通过
              </a>
              <a style={{ color: '#ff4d4f' }} onClick={() => handleReject(record.id)}>
                驳回
              </a>
            </>
          )}
        </Space>
      ),
    },
  ].filter((col) => !col.hidden);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          加班申报
        </Title>
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
          <Select
            placeholder="状态筛选"
            style={{ width: 120 }}
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending', label: '待审批' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
              { value: 'revoked', label: '已撤回' },
            ]}
          />
          <Select
            placeholder="加班类型"
            style={{ width: 140 }}
            allowClear
            value={typeFilter}
            onChange={setTypeFilter}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Button onClick={loadData}>查询</Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title="新增加班申报"
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        okText="提交"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="加班日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="time_range" label="加班时段" rules={[{ required: true, message: '请选择时段' }]}>
            <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type_id" label="加班类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              placeholder="选择加班类型"
              options={types.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.multiplier}x)`,
              }))}
            />
          </Form.Item>
          <Form.Item name="workload_description" label="工作内容" rules={[{ required: true, message: '请描述工作内容' }]}>
            <Input.TextArea rows={3} placeholder="描述加班期间完成的工作内容" />
          </Form.Item>
          <Form.Item
            name="workload_amount"
            label="工作量（可选，用于双维度异常检测）"
            tooltip="填写后系统将自动对比时长与工作量的合理性"
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} placeholder="如：3（表示完成了3个需求/任务）" />
          </Form.Item>
          <Form.Item
            name="efficiency_score"
            label="效率系数"
            initialValue={1.0}
            tooltip="1.0为正常效率，>1表示高效，<1表示低效"
          >
            <InputNumber min={0.1} max={2.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
