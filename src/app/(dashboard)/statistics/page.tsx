'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Select, DatePicker, Table, Tag, Space, Button, Tabs, Empty, Tooltip } from 'antd';
import { BarChartOutlined, PieChartOutlined, LineChartOutlined, DownloadOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/store/auth';
import { overtimeDB, worklossDB, userDB, groupDB } from '@/lib/db';
import { ROLE_LABELS } from '@/types/database';
import type { OvertimeRecord, WorklossRecord, User, Group } from '@/types/database';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function StatisticsPage() {
  const { user, hasRole } = useAuthStore();
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().endOf('month').format('YYYY-MM-DD'),
  ]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [groups, setGroups] = useState<Group[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    setGroups(groupDB.getAll());
    setAllUsers(userDB.getAll());
  }, []);

  // 获取筛选后的数据
  const { overtimeRecords, worklossRecords } = useMemo(() => {
    let ot = overtimeDB.getByDateRange(dateRange[0], dateRange[1]).filter(r => r.status === 'approved');
    let wl = worklossDB.getByDateRange(dateRange[0], dateRange[1]).filter(r => r.status === 'approved');

    if (selectedGroup !== 'all') {
      ot = ot.filter(r => r.groupId === selectedGroup);
      wl = wl.filter(r => r.groupId === selectedGroup);
    }
    if (selectedUser !== 'all') {
      ot = ot.filter(r => r.userId === selectedUser);
      wl = wl.filter(r => r.userId === selectedUser);
    }
    // 非管理员只能看自己的
    if (!hasRole('team_lead') && user) {
      ot = ot.filter(r => r.userId === user.id);
      wl = wl.filter(r => r.userId === user.id);
    }

    return { overtimeRecords: ot, worklossRecords: wl };
  }, [dateRange, selectedGroup, selectedUser, user, hasRole]);

  // 汇总统计
  const summary = useMemo(() => {
    const totalOtMinutes = overtimeRecords.reduce((s, r) => s + r.timeDuration, 0);
    const totalWlMinutes = worklossRecords.reduce((s, r) => s + r.timeDuration, 0);
    const anomalyCount = [...overtimeRecords, ...worklossRecords].filter(r => r.hasAnomaly).length;
    const totalRecords = overtimeRecords.length + worklossRecords.length;

    return {
      totalOtHours: Math.round(totalOtMinutes / 60 * 10) / 10,
      totalWlHours: Math.round(totalWlMinutes / 60 * 10) / 10,
      anomalyCount,
      totalRecords,
      avgOtPerPerson: allUsers.length > 0 ? Math.round(totalOtMinutes / 60 / Math.max(1, new Set(overtimeRecords.map(r => r.userId)).size) * 10) / 10 : 0,
      avgWlPerPerson: allUsers.length > 0 ? Math.round(totalWlMinutes / 60 / Math.max(1, new Set(worklossRecords.map(r => r.userId)).size) * 10) / 10 : 0,
    };
  }, [overtimeRecords, worklossRecords, allUsers]);

  // 按人员汇总
  const userStats = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; groupName: string | null; otMinutes: number; wlMinutes: number; otCount: number; wlCount: number; anomalyCount: number }>();

    overtimeRecords.forEach(r => {
      const existing = map.get(r.userId) || { userId: r.userId, userName: r.userName, groupName: r.groupName, otMinutes: 0, wlMinutes: 0, otCount: 0, wlCount: 0, anomalyCount: 0 };
      existing.otMinutes += r.timeDuration;
      existing.otCount += 1;
      if (r.hasAnomaly) existing.anomalyCount += 1;
      map.set(r.userId, existing);
    });

    worklossRecords.forEach(r => {
      const existing = map.get(r.userId) || { userId: r.userId, userName: r.userName, groupName: r.groupName, otMinutes: 0, wlMinutes: 0, otCount: 0, wlCount: 0, anomalyCount: 0 };
      existing.wlMinutes += r.timeDuration;
      existing.wlCount += 1;
      if (r.hasAnomaly) existing.anomalyCount += 1;
      map.set(r.userId, existing);
    });

    return Array.from(map.values()).sort((a, b) => (b.otMinutes + b.wlMinutes) - (a.otMinutes + a.wlMinutes));
  }, [overtimeRecords, worklossRecords]);

  // 按类型汇总
  const typeStats = useMemo(() => {
    const otMap = new Map<string, { typeName: string; minutes: number; count: number; category: string }>();
    const wlMap = new Map<string, { typeName: string; minutes: number; count: number; category: string }>();

    overtimeRecords.forEach(r => {
      const existing = otMap.get(r.typeId) || { typeName: r.typeName, minutes: 0, count: 0, category: '加班' };
      existing.minutes += r.timeDuration;
      existing.count += 1;
      otMap.set(r.typeId, existing);
    });

    worklossRecords.forEach(r => {
      const existing = wlMap.get(r.typeId) || { typeName: r.typeName, minutes: 0, count: 0, category: '工损' };
      existing.minutes += r.timeDuration;
      existing.count += 1;
      wlMap.set(r.typeId, existing);
    });

    return [...Array.from(otMap.values()), ...Array.from(wlMap.values())].sort((a, b) => b.minutes - a.minutes);
  }, [overtimeRecords, worklossRecords]);

  // 按分组汇总
  const groupStats = useMemo(() => {
    const map = new Map<string, { groupName: string; otMinutes: number; wlMinutes: number; memberCount: number; recordCount: number }>();

    overtimeRecords.forEach(r => {
      const key = r.groupId || 'ungrouped';
      const existing = map.get(key) || { groupName: r.groupName || '未分组', otMinutes: 0, wlMinutes: 0, memberCount: 0, recordCount: 0 };
      existing.otMinutes += r.timeDuration;
      existing.recordCount += 1;
      map.set(key, existing);
    });

    worklossRecords.forEach(r => {
      const key = r.groupId || 'ungrouped';
      const existing = map.get(key) || { groupName: r.groupName || '未分组', otMinutes: 0, wlMinutes: 0, memberCount: 0, recordCount: 0 };
      existing.wlMinutes += r.timeDuration;
      existing.recordCount += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => (b.otMinutes + b.wlMinutes) - (a.otMinutes + a.wlMinutes));
  }, [overtimeRecords, worklossRecords]);

  // 导出 CSV
  const handleExport = () => {
    const headers = ['姓名', '分组', '日期', '类型', '分类', '事项', '开始时间', '结束时间', '时长(分钟)', '量级时长(分钟)', '偏差%', '状态'];
    const rows: string[][] = [];

    overtimeRecords.forEach(r => {
      rows.push([r.userName, r.groupName || '', r.date, r.typeName, '加班', r.task, r.startTime, r.endTime, String(r.timeDuration), String(r.calculatedDuration), String(r.deviationPercent), r.status]);
    });
    worklossRecords.forEach(r => {
      rows.push([r.userName, r.groupName || '', r.date, r.typeName, '工损', r.task, r.startTime, r.endTime, String(r.timeDuration), String(r.calculatedDuration), String(r.deviationPercent), r.status]);
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工时统计_${dateRange[0]}_${dateRange[1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 人员统计表格列
  const userStatsColumns = [
    { title: '姓名', dataIndex: 'userName', key: 'userName', width: 100 },
    { title: '分组', dataIndex: 'groupName', key: 'groupName', width: 100, render: (v: string | null) => v || '未分组' },
    { title: '加班时长', key: 'otHours', width: 100, render: (_: unknown, r: typeof userStats[0]) => `${Math.round(r.otMinutes / 60 * 10) / 10}h` },
    { title: '工损时长', key: 'wlHours', width: 100, render: (_: unknown, r: typeof userStats[0]) => `${Math.round(r.wlMinutes / 60 * 10) / 10}h` },
    { title: '总时长', key: 'total', width: 100, render: (_: unknown, r: typeof userStats[0]) => <strong>{Math.round((r.otMinutes + r.wlMinutes) / 60 * 10) / 10}h</strong> },
    { title: '记录数', key: 'count', width: 80, render: (_: unknown, r: typeof userStats[0]) => r.otCount + r.wlCount },
    {
      title: '异常', dataIndex: 'anomalyCount', key: 'anomalyCount', width: 60,
      render: (v: number) => v > 0 ? <Tag color="error">{v}</Tag> : <span style={{ color: '#999' }}>0</span>,
    },
  ];

  const typeStatsColumns = [
    { title: '类型', dataIndex: 'typeName', key: 'typeName', width: 120 },
    { title: '分类', dataIndex: 'category', key: 'category', width: 80, render: (v: string) => <Tag color={v === '加班' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: '总时长', key: 'hours', width: 100, render: (_: unknown, r: typeof typeStats[0]) => `${Math.round(r.minutes / 60 * 10) / 10}h` },
    { title: '记录数', dataIndex: 'count', key: 'count', width: 80 },
    {
      title: '占比', key: 'percent', width: 100,
      render: (_: unknown, r: typeof typeStats[0]) => {
        const total = typeStats.reduce((s, t) => s + t.minutes, 0);
        return total > 0 ? `${Math.round(r.minutes / total * 100)}%` : '0%';
      },
    },
  ];

  const groupStatsColumns = [
    { title: '分组', dataIndex: 'groupName', key: 'groupName', width: 120 },
    { title: '加班时长', key: 'otHours', width: 100, render: (_: unknown, r: typeof groupStats[0]) => `${Math.round(r.otMinutes / 60 * 10) / 10}h` },
    { title: '工损时长', key: 'wlHours', width: 100, render: (_: unknown, r: typeof groupStats[0]) => `${Math.round(r.wlMinutes / 60 * 10) / 10}h` },
    { title: '总时长', key: 'total', width: 100, render: (_: unknown, r: typeof groupStats[0]) => <strong>{Math.round((r.otMinutes + r.wlMinutes) / 60 * 10) / 10}h</strong> },
    { title: '记录数', dataIndex: 'recordCount', key: 'recordCount', width: 80 },
  ];

  return (
    <div>
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <span>时间范围：</span>
              <RangePicker
                size="small"
                value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                  }
                }}
                presets={[
                  { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                  { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                  { label: '近7天', value: [dayjs().subtract(6, 'day'), dayjs()] },
                  { label: '近30天', value: [dayjs().subtract(29, 'day'), dayjs()] },
                  { label: '近90天', value: [dayjs().subtract(89, 'day'), dayjs()] },
                ]}
              />
            </Space>
          </Col>
          {hasRole('team_lead') && (
            <>
              <Col>
                <Space>
                  <span>分组：</span>
                  <Select size="small" value={selectedGroup} onChange={setSelectedGroup} style={{ width: 120 }}>
                    <Select.Option value="all">全部</Select.Option>
                    {groups.map(g => <Select.Option key={g.id} value={g.id}>{g.name}</Select.Option>)}
                  </Select>
                </Space>
              </Col>
              <Col>
                <Space>
                  <span>人员：</span>
                  <Select size="small" value={selectedUser} onChange={setSelectedUser} style={{ width: 140 }} showSearch optionFilterProp="children">
                    <Select.Option value="all">全部</Select.Option>
                    {allUsers.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
                  </Select>
                </Space>
              </Col>
            </>
          )}
          <Col flex={1} style={{ textAlign: 'right' }}>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>导出 CSV</Button>
          </Col>
        </Row>
      </Card>

      {/* 汇总卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="加班总时长" value={summary.totalOtHours} suffix="h" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="工损总时长" value={summary.totalWlHours} suffix="h" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="总记录数" value={summary.totalRecords} suffix="条" /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="异常记录" value={summary.anomalyCount} suffix="条" valueStyle={{ color: summary.anomalyCount > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="人均加班" value={summary.avgOtPerPerson} suffix="h" valueStyle={{ fontSize: 20 }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="人均工损" value={summary.avgWlPerPerson} suffix="h" valueStyle={{ fontSize: 20 }} /></Card></Col>
      </Row>

      {/* 详细统计 */}
      <Tabs
        items={[
          {
            key: 'byUser',
            label: <Space><UserOutlined />按人员</Space>,
            children: (
              <Card size="small">
                {userStats.length > 0 ? (
                  <Table columns={userStatsColumns} dataSource={userStats} rowKey="userId" size="small" pagination={false} />
                ) : (
                  <Empty description="该时间段内暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            ),
          },
          {
            key: 'byType',
            label: <Space><PieChartOutlined />按类型</Space>,
            children: (
              <Card size="small">
                {typeStats.length > 0 ? (
                  <Table columns={typeStatsColumns} dataSource={typeStats} rowKey="typeName" size="small" pagination={false} />
                ) : (
                  <Empty description="该时间段内暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            ),
          },
          {
            key: 'byGroup',
            label: <Space><TeamOutlined />按分组</Space>,
            children: (
              <Card size="small">
                {groupStats.length > 0 ? (
                  <Table columns={groupStatsColumns} dataSource={groupStats} rowKey="groupName" size="small" pagination={false} />
                ) : (
                  <Empty description="该时间段内暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
