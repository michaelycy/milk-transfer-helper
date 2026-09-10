import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Segmented, Spin, Table, Typography } from 'antd';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import { PageHeader } from '../../components/page-header';
import { StatsService, type AdminStats } from '../../services/stats.service';

export const Route = createFileRoute('/_auth/')({
  component: DashboardPage,
});

function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data, isPending } = useQuery({
    queryKey: ['stats', days],
    queryFn: (): Promise<AdminStats> => StatsService.overview(days),
  });

  const totalEvents = data ? Object.values(data.eventsByName).reduce((a, b) => a + b, 0) : 0;

  return (
    <div>
      <PageHeader
        title="数据看板"
        description="关键指标聚合自 analytics_events（服务端计算，FR-H4）；指标口径见 docs/spec/00-glossary §5"
        extra={
          <Segmented
            options={[
              { label: '近 7 天', value: 7 },
              { label: '近 30 天', value: 30 },
              { label: '近 90 天', value: 90 },
            ]}
            value={days}
            onChange={(v) => setDays(v as number)}
          />
        }
      />
      <Spin spinning={isPending}>
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <StatisticCard title="注册用户" value={data?.users ?? '-'} hint="users 表总数" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <StatisticCard
                title="进行中计划"
                value={data ? `${data.plans.active} / ${data.plans.total}` : '-'}
                hint="active+paused / 全部（FR 北极星）"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <StatisticCard
                title={`事件总量（近 ${days} 天）`}
                value={totalEvents || '-'}
                hint="全部埋点事件求和"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <StatisticCard
                title="阅读最高文章"
                value={data?.topArticles[0]?.title ?? '-'}
                hint={data?.topArticles[0] ? `${data.topArticles[0].count} 次阅读` : '近窗口无阅读'}
              />
            </Card>
          </Col>
        </Row>

        <Card title="关键事件按日趋势" style={{ marginTop: 16 }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data?.trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="app_launch" name="启动" stroke="#FF6B35" dot={false} />
              <Line
                type="monotone"
                dataKey="feed_recorded"
                name="喂养记录"
                stroke="#1989FA"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="plan_created"
                name="创建计划"
                stroke="#00B96B"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card title="事件明细（按量排序）" size="small">
              <Table
                size="small"
                rowKey="name"
                pagination={false}
                dataSource={Object.entries(data?.eventsByName ?? {}).map(([name, count]) => ({
                  name,
                  count,
                }))}
                columns={[
                  { title: '事件', dataIndex: 'name' },
                  { title: '次数', dataIndex: 'count', align: 'right', width: 100 },
                ]}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="文章阅读 Top 10" size="small">
              <Table
                size="small"
                rowKey="title"
                pagination={false}
                dataSource={data?.topArticles ?? []}
                columns={[
                  { title: '标题', dataIndex: 'title', ellipsis: true },
                  { title: '阅读', dataIndex: 'count', align: 'right', width: 80 },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
}

function StatisticCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {title}
      </Typography.Text>
      <Typography.Title level={3} style={{ margin: '4px 0 2px' }}>
        {value}
      </Typography.Title>
      {hint && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      )}
    </div>
  );
}
