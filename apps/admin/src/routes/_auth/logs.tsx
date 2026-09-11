import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PageHeader } from '../../components/page-header';
import { LogService } from '../../services/log.service';
import type { ApiLogQuery, ApiLogRow } from '../../types';

export const Route = createFileRoute('/_auth/logs')({
  component: LogsPage,
});

/** 时间窗快捷项（FR-J12 验收：时间/级别/路径/request_id 组合筛选） */
const RANGE_OPTIONS = [
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
  { value: 'all', label: '不限时间' },
];

const LEVEL_COLOR: Record<ApiLogRow['level'], string> = {
  info: 'blue',
  warn: 'orange',
  error: 'red',
};

const PAGE_SIZE = 50;

function LogsPage() {
  const [level, setLevel] = useState<ApiLogQuery['level']>();
  const [path, setPath] = useState('');
  const [requestId, setRequestId] = useState('');
  const [range, setRange] = useState('24h');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const since =
    range === 'all'
      ? undefined
      : range === '1h'
        ? dayjs().subtract(1, 'hour').toISOString()
        : range === '24h'
          ? dayjs().subtract(24, 'hour').toISOString()
          : dayjs().subtract(7, 'day').toISOString();
  const query: ApiLogQuery = {
    level,
    path: path.trim() || undefined,
    request_id: requestId.trim() || undefined,
    since,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['api-logs', query],
    queryFn: () => LogService.query(query),
    placeholderData: keepPreviousData,
  });

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const columns = [
    {
      title: '时间',
      width: 150,
      render: (_: unknown, row: ApiLogRow) =>
        row.created_at ? dayjs(row.created_at).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '级别',
      width: 80,
      render: (_: unknown, row: ApiLogRow) => (
        <Tag color={LEVEL_COLOR[row.level]}>{row.level}</Tag>
      ),
    },
    { title: '方法', dataIndex: 'method', width: 90 },
    {
      title: '路径',
      dataIndex: 'path',
      ellipsis: true,
      render: (v: string) => <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', width: 70 },
    {
      title: '耗时',
      width: 90,
      render: (_: unknown, row: ApiLogRow) =>
        row.duration_ms != null ? `${row.duration_ms} ms` : '-',
    },
    {
      title: '用户',
      dataIndex: 'user_id',
      width: 130,
      ellipsis: true,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Request ID',
      dataIndex: 'request_id',
      width: 140,
      render: (v: string) => (
        <Typography.Text copyable={{ text: v }} style={{ fontSize: 12 }}>
          {v.slice(0, 8)}
        </Typography.Text>
      ),
    },
    {
      title: '摘要',
      dataIndex: 'message',
      ellipsis: { showTitle: true },
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {v}
            </Typography.Text>
          </Tooltip>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="运行日志"
        description="FR-J12 API 请求级运行日志（保留期 30 天）· Request ID 与响应头 X-Request-Id 对应，可精确关联问题请求"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            刷新
          </Button>
        }
      />
      <Space wrap>
        <Select
          value={range}
          onChange={resetPage(setRange)}
          options={RANGE_OPTIONS}
          style={{ width: 140 }}
        />
        <Select
          allowClear
          placeholder="全部级别"
          value={level}
          onChange={resetPage((v: ApiLogQuery['level']) => setLevel(v))}
          options={[
            { value: 'info', label: 'info' },
            { value: 'warn', label: 'warn' },
            { value: 'error', label: 'error' },
          ]}
          style={{ width: 130 }}
        />
        <Input
          allowClear
          placeholder="按路径包含检索（如 /v1/db/tables）"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onPressEnter={resetPage((v: string) => setPath(v))}
          onBlur={(e) => resetPage(setPath)(e.target.value)}
          style={{ width: 280 }}
        />
        <Input
          allowClear
          placeholder="Request ID 精确检索"
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          onPressEnter={resetPage((v: string) => setRequestId(v))}
          onBlur={(e) => resetPage(setRequestId)(e.target.value)}
          style={{ width: 280 }}
        />
      </Space>
      {error ? <Typography.Text type="danger">{(error as Error).message}</Typography.Text> : null}
      <Table<ApiLogRow>
        rowKey="request_id"
        size="small"
        loading={isFetching}
        columns={columns}
        dataSource={data?.rows ?? []}
        pagination={{
          current: page,
          pageSize,
          total: data?.count ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (next, nextSize) => {
            setPage(next);
            setPageSize(nextSize);
          },
        }}
      />
    </Space>
  );
}
