'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Col, Row, Typography, DatePicker, Space, Table, Tag, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getOvertimeTrend,
  getWorklossDistribution,
  getUserRanking,
  getAnomalyStats,
} from '@/lib/services/statistics';

const { Title } = Typography;

export default function StatisticsPage() {
  const [month, setMonth] = useState(dayjs());
  const [trendData, setTrendData] = useState<{ date: string; hours: number }[]>([]);
  const [distributionData, setDistributionData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [rankingData, setRankingData] = useState<{ name: string; hours: number }[]>([]);
  const [anomalyData, setAnomalyData] = useState<{ overtime: any[]; workloss: any[]; total: number }>({ overtime: [], workloss: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year: month.year(), month: month.month() + 1 };
      const [trend, distribution, ranking, anomalies] = await Promise.all([
        getOvertimeTrend(params),
        getWorklossDistribution(params),
        getUserRanking({ ...params, type: 'overtime', limit: 10 }),
        getAnomalyStats(params),
      ]);
      setTrendData(trend);
      setDistributionData(distribution);
      setRankingData(ranking);
      setAnomalyData(anomalies);
    } catch (error: any) {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 加班趋势图配置
  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: trendData.map((d) => d.date) },
    yAxis: { type: 'value' as const, name: '小时' },
    series: [{
      name: '加班时长',
      type: 'bar',
      data: trendData.map((d) => d.hours),
      itemStyle: { color: '#1890ff' },
    }],
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
  };

  // 工损分布饼图配置
  const distributionOption = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}h ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: distributionData.map((d) => ({
        name: d.name,
        value: d.value,
        itemStyle: { color: d.color },
      })),
      label: { show: true, formatter: '{b}\n{d}%' },
    }],
  };

  // 人员排行图配置
  const rankingOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'value' as const, name: '小时' },
    yAxis: {
      type: 'category' as const,
      data: rankingData.map((d) => d.name).reverse(),
      axisLabel: { width: 60, overflow: 'truncate' as const },
    },
    series: [{
      type: 'bar',
      data: rankingData.map((d) => d.hours).reverse(),
      itemStyle: { color: '#722ed1' },
    }],
    grid: { left: 80, right: 20, top: 10, bottom: 30 },
  };

  // 异常列表
  const anomalyColumns = [
    { title: '类型', key: 'type', dataIndex: '_type', render: (t: string) => <Tag color={t === '加班' ? 'blue' : 'orange'}>{t}</Tag> },
    { title: '人员', key: 'user', render: (_: unknown, r: any) => r.users?.name || '-' },
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '异常原因', dataIndex: 'anomaly_reason', key: 'reason', ellipsis: true },
  ];

  const anomalyList = [
    ...anomalyData.overtime.map((r) => ({ ...r, _type: '加班' })),
    ...anomalyData.workloss.map((r) => ({ ...r, _type: '工损' })),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>数据统计</Title>
        <Space>
          <DatePicker
            picker="month"
            value={month}
            onChange={(val) => val && setMonth(val)}
            allowClear={false}
          />
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="加班趋势（按日）" loading={loading} style={{ height: 400 }}>
            {trendData.length > 0 ? (
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                本月暂无加班数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="工损类型分布" loading={loading} style={{ height: 400 }}>
            {distributionData.length > 0 ? (
              <ReactECharts option={distributionOption} style={{ height: 300 }} />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                本月暂无工损数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="加班时长排行 TOP10" loading={loading} style={{ height: 400 }}>
            {rankingData.length > 0 ? (
              <ReactECharts option={rankingOption} style={{ height: 300 }} />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                本月暂无数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={<span><WarningOutlined style={{ color: '#ff4d4f' }} /> 异常检测 ({anomalyData.total})</span>}
            loading={loading}
            style={{ height: 400 }}
          >
            {anomalyList.length > 0 ? (
              <Table
                columns={anomalyColumns}
                dataSource={anomalyList}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ y: 260 }}
              />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52c41a' }}>
                本月无异常记录
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
