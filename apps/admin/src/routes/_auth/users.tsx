import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Drawer,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { AdminService } from '../../services/admin.service';
import type { AdminUserRow } from '../../types';
import { useHasPermission } from '../../lib/permissions';

export const Route = createFileRoute('/_auth/users')({ component: UsersPage });

const PAGE_SIZE = 20;

function UsersPage() {
  const allowed = useHasPermission('user:read');
  const { message } = App.useApp();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openid, setOpenid] = useState('');
  const [range, setRange] = useState<[import('dayjs').Dayjs | null, import('dayjs').Dayjs | null]>([null, null]);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await AdminService.queryUsers({
          openid: openid || undefined,
          since: range[0] ? range[0].startOf('day').toISOString() : undefined,
          until: range[1] ? range[1].endOf('day').toISOString() : undefined,
          limit: PAGE_SIZE,
          offset: p * PAGE_SIZE,
        });
        setRows(res.data ?? []);
        setCount(res.count ?? 0);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message, openid, range],
  );

  useEffect(() => {
    if (allowed) void load(page);
  }, [allowed, load, page]);

  if (!allowed) {
    return <Alert type="warning" showIcon message="403" description="需要 user:read 权限（仅超级管理员）" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          用户查询
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          user:read（仅超级管理员）· 只读统计画像 · openid 脱敏 · 每次查询写入审计日志
        </Typography.Text>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="openid 精确查询"
          style={{ width: 220 }}
          value={openid}
          onChange={(e) => setOpenid(e.target.value)}
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

      <Table<AdminUserRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        size="middle"
        pagination={{
          pageSize: PAGE_SIZE,
          total: count,
          current: page + 1,
          showTotal: (t) => `共 ${t} 条 · 单页上限 ${PAGE_SIZE}`,
          onChange: (p) => setPage(p - 1),
        }}
      >
        <Table.Column<AdminUserRow> title="openid（脱敏）" dataIndex="openid_masked" />
        <Table.Column<AdminUserRow>
          title="昵称"
          dataIndex="nickname"
          width={140}
          render={(v: string | null) => v || '—'}
        />
        <Table.Column<AdminUserRow>
          title="注册时间"
          dataIndex="created_at"
          width={140}
          render={(v: string | null) => (v ? new Date(v).toLocaleDateString() : '—')}
        />
        <Table.Column<AdminUserRow> title="宝宝数" dataIndex="baby_count" width={80} />
        <Table.Column<AdminUserRow> title="累计记录" dataIndex="record_count" width={100} />
        <Table.Column<AdminUserRow> title="计划数" dataIndex="plan_count" width={80} />
        <Table.Column<AdminUserRow>
          title="操作"
          width={80}
          render={(_, row) => (
            <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
              详情
            </Button>
          )}
        />
      </Table>

      <UserProfileDrawer userId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function UserProfileDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof AdminService.userProfile>> | null>(null);

  useEffect(() => {
    if (userId) {
      setProfile(null);
      void AdminService.userProfile(userId).then(setProfile).catch(() => setProfile(null));
    }
  }, [userId]);

  return (
    <Drawer title="用户画像" width={360} open={!!userId} onClose={onClose}>
      {profile ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space size={8}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {profile.openid_masked ?? '—'}
            </Typography.Text>
            <Tag>微信账号</Tag>
          </Space>
          <Space size={24} wrap>
            <StatisticLite label="累计记录" value={String(profile.record_count)} />
            <StatisticLite label="手机号" value={profile.phone_bound ? '已绑定' : '未绑定'} />
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            注册时间：{profile.created_at ? new Date(profile.created_at).toLocaleString() : '—'}
            <br />
            最近活跃：{profile.last_active ? new Date(profile.last_active).toLocaleString() : '—'}
          </Typography.Paragraph>
          <Alert
            type="info"
            showIcon
            message="查询已写入审计日志（FR-J11）· 不提供业务明细与导出"
          />
        </Space>
      ) : (
        <Typography.Text type="secondary">加载中…</Typography.Text>
      )}
    </Drawer>
  );
}

function StatisticLite({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
