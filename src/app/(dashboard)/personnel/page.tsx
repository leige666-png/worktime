'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Avatar,
  Input,
  Tabs,
  Modal,
  Form,
  Select,
  message,
  Popconfirm,
  ColorPicker,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { User, Role, Group } from '@/types/database';
import { useAuthStore } from '@/lib/store/auth';
import {
  getUsers,
  getRoles,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  assignRole,
  removeRole,
  updateUserStatus,
  addUserToGroup,
  removeUserFromGroup,
} from '@/lib/services/personnel';

const { Title } = Typography;

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: 'green', text: '在职' },
  inactive: { color: 'default', text: '离职' },
  frozen: { color: 'blue', text: '冻结' },
};

export default function PersonnelPage() {
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [roleForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const { user: currentUser } = useAuthStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, groupsData] = await Promise.all([
        getUsers({ search: searchText }),
        getRoles(),
        getGroups(),
      ]);
      setUsers(usersData || []);
      setRoles(rolesData || []);
      setGroups(groupsData || []);
    } catch (error: any) {
      message.error('加载数据失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 角色管理
  const handleRoleEdit = (user: any) => {
    setSelectedUser(user);
    const currentRoleIds = user.user_roles?.map((ur: any) => ur.role_id) || [];
    roleForm.setFieldsValue({ roles: currentRoleIds });
    setRoleModalOpen(true);
  };

  const handleRoleSave = async () => {
    try {
      const values = await roleForm.validateFields();
      const currentRoleIds = selectedUser.user_roles?.map((ur: any) => ur.role_id) || [];
      const newRoleIds: string[] = values.roles;

      // 移除取消的角色
      for (const roleId of currentRoleIds) {
        if (!newRoleIds.includes(roleId)) {
          await removeRole(selectedUser.id, roleId);
        }
      }
      // 添加新角色
      for (const roleId of newRoleIds) {
        if (!currentRoleIds.includes(roleId)) {
          await assignRole(selectedUser.id, roleId, currentUser?.id);
        }
      }

      message.success('角色更新成功');
      setRoleModalOpen(false);
      loadData();
    } catch (error: any) {
      message.error('操作失败：' + error.message);
    }
  };

  // 分组管理
  const handleGroupSave = async () => {
    try {
      const values = await groupForm.validateFields();
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#1890ff';

      if (editingGroup) {
        await updateGroup(editingGroup.id, { ...values, color });
        message.success('分组更新成功');
      } else {
        await createGroup({ ...values, color, created_by: currentUser?.id });
        message.success('分组创建成功');
      }
      setGroupModalOpen(false);
      groupForm.resetFields();
      setEditingGroup(null);
      loadData();
    } catch (error: any) {
      message.error('操作失败：' + error.message);
    }
  };

  const handleGroupDelete = async (id: string) => {
    try {
      await deleteGroup(id);
      message.success('分组已删除');
      loadData();
    } catch (error: any) {
      message.error('删除失败：' + error.message);
    }
  };

  const handleStatusChange = async (userId: string, status: 'active' | 'inactive' | 'frozen') => {
    try {
      await updateUserStatus(userId, status);
      message.success('状态更新成功');
      loadData();
    } catch (error: any) {
      message.error('操作失败：' + error.message);
    }
  };

  const userColumns = [
    {
      title: '姓名',
      key: 'name',
      render: (_: unknown, record: any) => (
        <Space>
          <Avatar size="small" src={record.avatar} icon={<UserOutlined />} />
          {record.name}
        </Space>
      ),
    },
    {
      title: 'MIS',
      dataIndex: 'mis',
      key: 'mis',
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string | null) => dept || '-',
    },
    {
      title: '角色',
      key: 'roles',
      render: (_: unknown, record: any) => (
        <Space wrap>
          {record.user_roles?.map((ur: any) => (
            <Tag key={ur.role_id} color="blue">
              {ur.roles?.display_name || '未知'}
            </Tag>
          ))}
        </Space>
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
          <a onClick={() => handleRoleEdit(record)}>角色</a>
          <Select
            size="small"
            value={record.status}
            style={{ width: 80 }}
            onChange={(val) => handleStatusChange(record.id, val)}
            options={[
              { value: 'active', label: '在职' },
              { value: 'frozen', label: '冻结' },
              { value: 'inactive', label: '离职' },
            ]}
          />
        </Space>
      ),
    },
  ];

  const groupColumns = [
    {
      title: '分组名称',
      key: 'name',
      render: (_: unknown, record: any) => (
        <Space>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: record.color }} />
          {record.name}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string | null) => desc || '-',
    },
    {
      title: '成员数',
      key: 'member_count',
      render: (_: unknown, record: any) => record.user_groups?.length || 0,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: any) => (
        <Space>
          <a
            onClick={() => {
              setEditingGroup(record);
              groupForm.setFieldsValue(record);
              setGroupModalOpen(true);
            }}
          >
            <EditOutlined /> 编辑
          </a>
          <Popconfirm title="确定删除该分组？" onConfirm={() => handleGroupDelete(record.id)}>
            <a style={{ color: '#ff4d4f' }}>
              <DeleteOutlined /> 删除
            </a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          人员管理
        </Title>
      </div>

      <Tabs
        defaultActiveKey="members"
        items={[
          {
            key: 'members',
            label: (
              <span>
                <UserOutlined /> 成员列表 ({users.length})
              </span>
            ),
            children: (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <Input
                    placeholder="搜索姓名或 MIS"
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onPressEnter={loadData}
                    style={{ width: 300 }}
                    allowClear
                  />
                </Card>
                <Table
                  columns={userColumns}
                  dataSource={users}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 人` }}
                />
              </>
            ),
          },
          {
            key: 'groups',
            label: (
              <span>
                <TeamOutlined /> 分组管理 ({groups.length})
              </span>
            ),
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingGroup(null);
                      groupForm.resetFields();
                      setGroupModalOpen(true);
                    }}
                  >
                    新建分组
                  </Button>
                </div>
                <Table
                  columns={groupColumns}
                  dataSource={groups}
                  rowKey="id"
                  loading={loading}
                />
              </>
            ),
          },
        ]}
      />

      {/* 角色编辑弹窗 */}
      <Modal
        title={`编辑角色 - ${selectedUser?.name}`}
        open={roleModalOpen}
        onOk={handleRoleSave}
        onCancel={() => setRoleModalOpen(false)}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roles" label="分配角色" rules={[{ required: true, message: '请至少选择一个角色' }]}>
            <Select
              mode="multiple"
              placeholder="选择角色"
              options={roles.map((r) => ({
                value: r.id,
                label: `${r.display_name} (${r.name})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分组编辑弹窗 */}
      <Modal
        title={editingGroup ? '编辑分组' : '新建分组'}
        open={groupModalOpen}
        onOk={handleGroupSave}
        onCancel={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
          groupForm.resetFields();
        }}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true }]}>
            <Input placeholder="输入分组名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="分组描述（可选）" />
          </Form.Item>
          <Form.Item name="color" label="颜色标识" initialValue="#1890ff">
            <ColorPicker />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
