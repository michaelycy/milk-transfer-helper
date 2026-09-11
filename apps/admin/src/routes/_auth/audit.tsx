import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Alert, App, Button, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { AdminService } from '../../services/admin.service';
import type { AuditLogRow } from '../../types';
import { useHasPermission } from '../../lib/permissions';

export const Route = createFileRoute('/_auth/audit')({ component: AuditPage });

const ACTION_OPTIONS = [
  { value: 'admin.invite', label: '管理员邀请' },
  { value: 'admin.update', label: '管理员变更' },
  { value: 'admin.remove', label: '管理员移除' },
  { value: 'users.query', label: '用户查询' },
  { value: 'users.profile', label: '用户画像' },
  { value: 'admins.insert', label: '管理员行变更（DB）' },
  { value: 'admins.update', label: '管理员行变更（DB）' },
  { value: 'ai_provider_secrets.insert', label: '密钥设置' },
  { value: 'ai_provider_secrets.update', label: '密钥更新' },
  { value: 'ai_provider_secrets.delete', label: '密钥清除' },
  { value: 'ai_prompt_templates.review', label: '提示词审核' },
];

function AuditPage() {
  const allowed = useHasPermission('audit:read');
  const { message } = App.useApp();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | undefined>();
  const [actor, setActor] = useState('');
  const [range, setRange] = useState<[import('dayjs').Dayjs | null, import('dayjs').Dayjs | null]>([null, null]);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await AdminService.auditLogs({
          action,
          actor: actor || undefined,
          since: range[0] ? range[0].startOf('day').toISOString() : undefined,
          until: range[1] ? range[1].endOf('day').toISOString() : undefined,
          limit: 50,
          offset: p * 50,
        });
        setRows(res.data ?? []);
        setCount(res.count ?? 0);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message, action, actor, range],
  );

  useEffect(() => {
    if (allowed) void load(page);
  }, [allowed, load, page]);

  if (!allowed) {
    return <Alert type="warning" showIcon message="403" description="需要 audit:read 权限" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          操作审计
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          只追加 · 保留 ≥ 180 天 · audit:read（analyst 可查看以形成监督）
        </Typography.Text>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="操作者 user_id"
          style={{ width: 260 }}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          allowClear
        />
        <Select
          placeholder="动作类型"
          style={{ width: 180 }}
          options={ACTION_OPTIONS}
          value={action}
          onChange={setAction}
          allowClear
        />
        <DatePicker.RangePicker
          value={range as never}
          onChange={(v) => setRange([v?.[0] ?? null, v?.[1] ?? null])}
        />
        <Button type="primary" onClick={() => { setPage(0); void load(0); }}>
          查询
        </Button>
      </Space>

      <Table<AuditLogRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        size="middle"
        pagination={{
          pageSize: 50,
          total: count,
          current: page + 1,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p - 1),
        }}
      >
        <Table.Column<AuditLogRow>
          title="时间"
          dataIndex="created_at"
          width={150}
          render={(v: string) => new Date(v).toLocaleString()}
        />
        <Table.Column<AuditLogRow>
          title="操作者"
          dataIndex="actor_user_id"
          width={140}
          render={(v: string) => <Typography.Text style={{ fontSize: 12 }}>{v.slice(0, 8)}…</Typography.Text>}
        />
        <Table.Column<AuditLogRow>
          title="动作"
          dataIndex="action"
          width={170}
          render={(v: string) => <Tag color={v.includes('key') ? 'orange' : v.includes('users') ? 'default' : 'blue'}>{v}</Tag>}
        />
        <Table.Column<AuditLogRow>
          title="目标"
          dataIndex="target_id"
          width={140}
          render={(v: string | null) => (v ? <Typography.Text style={{ fontSize: 12 }}>{v.slice(0, 10)}…</Typography.Text> : '—')}
        />
        <Table.Column<AuditLogRow>
          title="详情"
          dataIndex="detail"
          render={(v: Record<string, unknown> | null) => (
            <Typography.Text style={{ fontSize: 12 }} ellipsis>
              {v ? JSON.stringify(v).slice(0, 80) : '—'}
            </Typography.Text>
          )}
        />
        <Table.Column<AuditLogRow> title="IP" dataIndex="ip" width={120} render={(v: string | null) => v || '—'} />
      </Table>
    </div>
  );
}
