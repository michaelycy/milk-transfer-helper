import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { AdminRow } from '../../types';
import { AdminService } from '../../services/admin.service';
import { ROLE_LABELS, useHasPermission, type AdminRole } from '../../lib/permissions';

export const Route = createFileRoute('/_auth/admins')({ component: AdminsPage });

const ROLE_COLOR: Record<AdminRole, string> = {
  super_admin: 'orange',
  operator: 'blue',
  analyst: 'default',
};

function AdminsPage() {
  const allowed = useHasPermission('admin:manage');
  const { message } = App.useApp();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [meId, setMeId] = useState('');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await AdminService.listAdmins());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (!allowed) return;
    void load();
    void AdminService.me().then((me) => setMeId(me.user_id));
  }, [allowed, load, message]);

  if (!allowed) {
    return <Alert type="warning" showIcon message="403" description="需要 admin:manage 权限（仅超级管理员）" />;
  }

  /** 最后一个 active 超管保护：停用/降级/移除按钮在其行上禁用（DB 触发器兜底） */
  const isLastSuper = (row: AdminRow) =>
    row.role === 'super_admin' &&
    row.status === 'active' &&
    rows.filter((r) => r.role === 'super_admin' && r.status === 'active').length === 1;

  const submitInvite = async () => {
    const values = (await form.validateFields()) as { email: string; role: AdminRole };
    try {
      await AdminService.inviteAdmin(values);
      message.success('邀请已发送 / 管理员已创建');
      setInviteOpen(false);
      form.resetFields();
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const patch = async (userId: string, body: { role?: AdminRole; status?: 'active' | 'disabled' }) => {
    try {
      await AdminService.updateAdmin(userId, body);
      message.success('已更新');
      void load();
    } catch (e) {
      message.error((e as Error).message);
      void load();
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            管理员管理
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            仅 admin:manage（超级管理员）可见 · 全部操作写入审计日志
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
          邀请管理员
        </Button>
      </div>

      <Table<AdminRow>
        rowKey="user_id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        size="middle"
      >
        <Table.Column<AdminRow> title="邮箱" dataIndex="email" />
        <Table.Column<AdminRow>
          title="角色"
          dataIndex="role"
          width={140}
          render={(_, row) =>
            row.user_id === meId ? (
              <Select<AdminRole>
                value={row.role}
                style={{ width: 120 }}
                onChange={(role) => void patch(row.user_id, { role })}
                options={(Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              />
            ) : (
              <Tag color={ROLE_COLOR[row.role]}>{ROLE_LABELS[row.role]}</Tag>
            )
          }
        />
        <Table.Column<AdminRow>
          title="状态"
          dataIndex="status"
          width={100}
          render={(_, row) =>
            row.status === 'active' ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>
          }
        />
        <Table.Column<AdminRow>
          title="加入时间"
          dataIndex="created_at"
          width={160}
          render={(v: string) => (v ? new Date(v).toLocaleDateString() : '—')}
        />
        <Table.Column<AdminRow>
          title="操作"
          width={220}
          render={(_, row) => {
            const self = row.user_id === meId;
            const locked = isLastSuper(row);
            return (
              <Space size={12}>
                {self ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    当前账号
                  </Typography.Text>
                ) : (
                  <>
                    <Button
                      size="small"
                      type="link"
                      disabled={locked || row.status === 'disabled'}
                      onClick={() => void patch(row.user_id, { status: 'disabled' })}
                    >
                      停用
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      disabled={row.status !== 'disabled'}
                      onClick={() => void patch(row.user_id, { status: 'active' })}
                    >
                      启用
                    </Button>
                    <Popconfirm
                      title="移除该管理员？"
                      onConfirm={() =>
                        void AdminService.removeAdmin(row.user_id)
                          .then(() => {
                            message.success('已移除');
                            void load();
                          })
                          .catch((e: Error) => message.error(e.message))
                      }
                    >
                      <Button size="small" type="link" danger disabled={locked}>
                        移除
                      </Button>
                    </Popconfirm>
                  </>
                )}
                {locked && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    最后一个超管
                  </Typography.Text>
                )}
              </Space>
            );
          }}
        />
      </Table>

      <Drawer
        title="邀请管理员"
        width={400}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        extra={
          <Button type="primary" onClick={() => void submitInvite()}>
            发送邀请
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, type: 'email', message: '请输入对方登录邮箱' }]}
          >
            <Input placeholder="请输入对方登录邮箱" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="operator" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
              }))}
            />
          </Form.Item>
        </Form>
        <Alert
          type="info"
          showIcon
          message="账号不存在时发送邀请邮件；SMTP 未配置时请在 Supabase Dashboard 建号后重试"
        />
      </Drawer>
    </div>
  );
}
