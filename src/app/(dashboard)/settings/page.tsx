'use client';

import { useState, useEffect } from 'react';
import { Card, Tabs, Table, Button, Space, Modal, Form, Input, InputNumber, Switch, ColorPicker, message, Popconfirm, Tag, Empty, Slider, Typography } from 'antd';
import { SettingOutlined, ThunderboltOutlined, ToolOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { overtimeTypeDB, worklossTypeDB, configDB, generateId, now } from '@/lib/db';
import type { OvertimeType, WorklossType, SystemConfig } from '@/types/database';

const { Text } = Typography;

export default function SettingsPage() {
  const { hasRole } = useAuthStore();
  const [overtimeTypes, setOvertimeTypes] = useState<OvertimeType[]>([]);
  const [worklossTypes, setWorklossTypes] = useState<WorklossType[]>([]);
  const [config, setConfig] = useState<SystemConfig>({ anomalyThreshold: 20, systemName: '工时管理系统', allowSelfRegister: true });

  // 弹窗
  const [otModal, setOtModal] = useState(false);
  const [wlModal, setWlModal] = useState(false);
  const [editingOt, setEditingOt] = useState<OvertimeType | null>(null);
  const [editingWl, setEditingWl] = useState<WorklossType | null>(null);
  const [otForm] = Form.useForm();
  const [wlForm] = Form.useForm();

  const isAdmin = hasRole('admin');

  const loadData = () => {
    setOvertimeTypes(overtimeTypeDB.getAll().sort((a, b) => a.sortOrder - b.sortOrder));
    setWorklossTypes(worklossTypeDB.getAll().sort((a, b) => a.sortOrder - b.sortOrder));
    setConfig(configDB.get());
  };

  useEffect(() => { loadData(); }, []);

  // ========== 加班类型管理 ==========

  const handleAddOt = () => {
    setEditingOt(null);
    otForm.resetFields();
    otForm.setFieldsValue({ color: '#1890ff', defaultEfficiency: 20, isActive: true, sortOrder: overtimeTypes.length + 1 });
    setOtModal(true);
  };

  const handleEditOt = (type: OvertimeType) => {
    setEditingOt(type);
    otForm.setFieldsValue({ ...type });
    setOtModal(true);
  };

  const handleSaveOt = async () => {
    try {
      const values = await otForm.validateFields();
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#1890ff';

      if (editingOt) {
        overtimeTypeDB.update(editingOt.id, { ...values, color });
        message.success('加班类型已更新');
      } else {
        overtimeTypeDB.add({
          id: generateId(),
          name: values.name,
          color,
          defaultEfficiency: values.defaultEfficiency,
          description: values.description || null,
          isActive: values.isActive ?? true,
          sortOrder: values.sortOrder || overtimeTypes.length + 1,
          createdAt: now(),
        });
        message.success('加班类型已创建');
      }
      setOtModal(false);
      loadData();
    } catch { /* validation */ }
  };

  const handleDeleteOt = (type: OvertimeType) => {
    overtimeTypeDB.delete(type.id);
    message.success('已删除');
    loadData();
  };

  const handleToggleOt = (type: OvertimeType) => {
    overtimeTypeDB.update(type.id, { isActive: !type.isActive });
    loadData();
  };

  // ========== 工损类型管理 ==========

  const handleAddWl = () => {
    setEditingWl(null);
    wlForm.resetFields();
    wlForm.setFieldsValue({ color: '#fa8c16', defaultEfficiency: 10, isActive: true, sortOrder: worklossTypes.length + 1 });
    setWlModal(true);
  };

  const handleEditWl = (type: WorklossType) => {
    setEditingWl(type);
    wlForm.setFieldsValue({ ...type });
    setWlModal(true);
  };

  const handleSaveWl = async () => {
    try {
      const values = await wlForm.validateFields();
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#fa8c16';

      if (editingWl) {
        worklossTypeDB.update(editingWl.id, { ...values, color });
        message.success('工损类型已更新');
      } else {
        worklossTypeDB.add({
          id: generateId(),
          name: values.name,
          color,
          defaultEfficiency: values.defaultEfficiency,
          description: values.description || null,
          isActive: values.isActive ?? true,
          sortOrder: values.sortOrder || worklossTypes.length + 1,
          createdAt: now(),
        });
        message.success('工损类型已创建');
      }
      setWlModal(false);
      loadData();
    } catch { /* validation */ }
  };

  const handleDeleteWl = (type: WorklossType) => {
    worklossTypeDB.delete(type.id);
    message.success('已删除');
    loadData();
  };

  const handleToggleWl = (type: WorklossType) => {
    worklossTypeDB.update(type.id, { isActive: !type.isActive });
    loadData();
  };

  // ========== 系统配置 ==========

  const handleSaveConfig = () => {
    configDB.set(config);
    message.success('系统配置已保存');
  };

  // ========== 表格列 ==========

  const otColumns = [
    {
      title: '类型名称', key: 'name', width: 150,
      render: (_: unknown, r: OvertimeType) => (
        <Space>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: r.color }} />
          <span>{r.name}</span>
        </Space>
      ),
    },
    { title: '默认人效', dataIndex: 'defaultEfficiency', key: 'defaultEfficiency', width: 100, render: (v: number) => `${v} 件/h` },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态', dataIndex: 'isActive', key: 'isActive', width: 80,
      render: (v: boolean, r: OvertimeType) => (
        <Switch size="small" checked={v} onChange={() => handleToggleOt(r)} disabled={!isAdmin} />
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, r: OvertimeType) => isAdmin ? (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditOt(r)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteOt(r)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  const wlColumns = [
    {
      title: '类型名称', key: 'name', width: 150,
      render: (_: unknown, r: WorklossType) => (
        <Space>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: r.color }} />
          <span>{r.name}</span>
        </Space>
      ),
    },
    { title: '默认人效', dataIndex: 'defaultEfficiency', key: 'defaultEfficiency', width: 100, render: (v: number) => `${v} 件/h` },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态', dataIndex: 'isActive', key: 'isActive', width: 80,
      render: (v: boolean, r: WorklossType) => (
        <Switch size="small" checked={v} onChange={() => handleToggleWl(r)} disabled={!isAdmin} />
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, r: WorklossType) => isAdmin ? (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditWl(r)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteWl(r)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  if (!isAdmin) {
    return (
      <Card>
        <Empty description="仅管理员可访问系统设置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  return (
    <div>
      <Tabs
        items={[
          {
            key: 'overtime-types',
            label: <Space><ThunderboltOutlined />加班类型</Space>,
            children: (
              <Card
                size="small"
                extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddOt}>新增类型</Button>}
              >
                <Table columns={otColumns} dataSource={overtimeTypes} rowKey="id" size="small" pagination={false} />
              </Card>
            ),
          },
          {
            key: 'workloss-types',
            label: <Space><ToolOutlined />工损类型</Space>,
            children: (
              <Card
                size="small"
                extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddWl}>新增类型</Button>}
              >
                <Table columns={wlColumns} dataSource={worklossTypes} rowKey="id" size="small" pagination={false} />
              </Card>
            ),
          },
          {
            key: 'system',
            label: <Space><SettingOutlined />系统配置</Space>,
            children: (
              <Card size="small">
                <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 500 }}>
                  <div>
                    <Text strong>系统名称</Text>
                    <Input
                      value={config.systemName}
                      onChange={e => setConfig({ ...config, systemName: e.target.value })}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                  <div>
                    <Text strong>异常偏差阈值</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>时间差与量级计算偏差超过此百分比时触发警报</Text>
                    <Slider
                      min={5}
                      max={50}
                      value={config.anomalyThreshold}
                      onChange={v => setConfig({ ...config, anomalyThreshold: v })}
                      marks={{ 5: '5%', 10: '10%', 20: '20%', 30: '30%', 50: '50%' }}
                      style={{ marginTop: 8 }}
                    />
                    <Text>当前阈值：<Tag color="orange">{config.anomalyThreshold}%</Tag></Text>
                  </div>
                  <div>
                    <Space>
                      <Text strong>允许自主注册</Text>
                      <Switch checked={config.allowSelfRegister} onChange={v => setConfig({ ...config, allowSelfRegister: v })} />
                    </Space>
                    <br />
                    <Text type="secondary">关闭后新用户无法自行注册，需管理员手动添加</Text>
                  </div>
                  <Button type="primary" onClick={handleSaveConfig}>保存配置</Button>
                </Space>
              </Card>
            ),
          },
        ]}
      />

      {/* 加班类型编辑弹窗 */}
      <Modal title={editingOt ? '编辑加班类型' : '新增加班类型'} open={otModal} onOk={handleSaveOt} onCancel={() => setOtModal(false)} okText="保存">
        <Form form={otForm} layout="vertical">
          <Form.Item name="name" label="类型名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：队列加班" />
          </Form.Item>
          <Form.Item name="color" label="标识颜色">
            <ColorPicker />
          </Form.Item>
          <Form.Item name="defaultEfficiency" label="默认人效（件/小时）" rules={[{ required: true }]}>
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="类型描述（可选）" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序号">
            <InputNumber min={1} max={99} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 工损类型编辑弹窗 */}
      <Modal title={editingWl ? '编辑工损类型' : '新增工损类型'} open={wlModal} onOk={handleSaveWl} onCancel={() => setWlModal(false)} okText="保存">
        <Form form={wlForm} layout="vertical">
          <Form.Item name="name" label="类型名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：申述类" />
          </Form.Item>
          <Form.Item name="color" label="标识颜色">
            <ColorPicker />
          </Form.Item>
          <Form.Item name="defaultEfficiency" label="默认人效（件/小时）" rules={[{ required: true }]}>
            <InputNumber min={0} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="类型描述（可选）" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序号">
            <InputNumber min={1} max={99} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
