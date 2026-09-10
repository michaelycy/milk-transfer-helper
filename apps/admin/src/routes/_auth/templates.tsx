import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Popconfirm, Space, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/page-header';
import { TemplateDrawer } from '../../components/template-drawer';
import { TemplateService, type TemplatePatch } from '../../services/template.service';
import type { PlanTemplateRow } from '../../types';

export const Route = createFileRoute('/_auth/templates')({
  component: TemplatesPage,
});

const METHOD_LABEL: Record<string, string> = { mixed: '混合法', interval: '隔顿法' };

/** 转奶模板（FR-J4/C2）：内容变更 version 自动 +1，进行中计划锁定创建时版本 */
function TemplatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PlanTemplateRow | null>(null);

  const { data: templates = [], isPending } = useQuery({
    queryKey: ['templates'],
    queryFn: () => TemplateService.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TemplatePatch }) =>
      TemplateService.update(id, patch),
    onSuccess: () => {
      message.success('已更新');
      void invalidate();
    },
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => TemplateService.remove(id),
    onSuccess: () => {
      message.success('已删除');
      void invalidate();
    },
    onError: (e) => message.error(`删除失败：${e.message}`),
  });

  const columns = useMemo(
    () => [
      {
        title: '方法',
        dataIndex: 'method',
        width: 90,
        render: (v: string) => <Tag>{METHOD_LABEL[v] ?? v}</Tag>,
      },
      { title: '模板名称', dataIndex: 'name', ellipsis: true },
      {
        title: '版本',
        dataIndex: 'version',
        width: 70,
        render: (v: number) => <span style={{ color: '#595959' }}>v{v}</span>,
      },
      {
        title: '默认',
        dataIndex: 'is_default',
        width: 80,
        render: (v: boolean) =>
          v ? <Tag color="orange">默认</Tag> : <span style={{ color: '#8c8c8c' }}>—</span>,
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        width: 80,
        render: (v: boolean, row: PlanTemplateRow) => (
          <Switch
            size="small"
            checked={v}
            onChange={(checked) => update.mutate({ id: row.id, patch: { enabled: checked } })}
          />
        ),
      },
      {
        title: '操作',
        key: 'ops',
        width: 150,
        render: (_: unknown, row: PlanTemplateRow) => (
          <Space>
            <a
              onClick={() => {
                setEditing(row);
                setDrawerOpen(true);
              }}
            >
              编辑
            </a>
            <Popconfirm title="确认删除该模板？" onConfirm={() => remove.mutate(row.id)}>
              <a style={{ color: '#ff4d4f' }}>删除</a>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [update, remove],
  );

  return (
    <div>
      <PageHeader
        title="转奶模板"
        description="C2：内容变更版本自动 +1；进行中计划按创建时版本锁定"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            新建模板
          </Button>
        }
      />
      <Card>
        <Table
          rowKey="id"
          size="middle"
          loading={isPending}
          columns={columns}
          dataSource={templates}
          pagination={false}
        />
      </Card>
      <TemplateDrawer
        open={drawerOpen}
        record={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={invalidate}
      />
    </div>
  );
}
