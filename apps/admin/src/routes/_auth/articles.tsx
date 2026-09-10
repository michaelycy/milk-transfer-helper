import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Input, Popconfirm, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/page-header';
import { StatusTag } from '../../components/status-tag';
import { ArticleDrawer } from '../../components/article-drawer';
import { ArticleService } from '../../services/article.service';
import type { ArticleRow, ReviewStatus } from '../../types';

export const Route = createFileRoute('/_auth/articles')({
  component: ArticlesPage,
});

/** 文章管理（FR-J3/G1）：审核流转在列表行完成，编辑走抽屉；仅 approved 对小程序可见 */
function ArticlesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ArticleRow | null>(null);

  const { data: articles = [], isPending } = useQuery({
    queryKey: ['articles', keyword, status],
    queryFn: () => ArticleService.list({ keyword, status }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['articles'] });

  const review = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ReviewStatus }) =>
      ArticleService.setReviewStatus(id, next),
    onSuccess: (_, { next }) => {
      message.success(next === 'approved' ? '已通过，小程序端立即可见' : '已更新审核状态');
      void invalidate();
    },
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ArticleService.remove(id),
    onSuccess: () => {
      message.success('已删除');
      void invalidate();
    },
    onError: (e) => message.error(`删除失败：${e.message}`),
  });

  const columns = useMemo(
    () => [
      { title: '标题', dataIndex: 'title', ellipsis: true },
      { title: '分类', dataIndex: 'category', width: 100 },
      { title: '作者', dataIndex: 'author', width: 100, render: (v: string | null) => v ?? '—' },
      {
        title: '审核状态',
        dataIndex: 'review_status',
        width: 100,
        render: (v: ReviewStatus) => <StatusTag value={v} />,
      },
      {
        title: '操作',
        key: 'ops',
        width: 220,
        render: (_: unknown, row: ArticleRow) => (
          <Space>
            <a
              onClick={() => {
                setEditing(row);
                setDrawerOpen(true);
              }}
            >
              编辑
            </a>
            {row.review_status !== 'approved' && (
              <Popconfirm
                title="通过后小程序端立即可见，确认？"
                onConfirm={() => review.mutate({ id: row.id, next: 'approved' })}
              >
                <a style={{ color: '#52c41a' }}>通过</a>
              </Popconfirm>
            )}
            {row.review_status !== 'rejected' && (
              <Popconfirm
                title="驳回后小程序端不可见，确认？"
                onConfirm={() => review.mutate({ id: row.id, next: 'rejected' })}
              >
                <a style={{ color: '#faad14' }}>驳回</a>
              </Popconfirm>
            )}
            <Popconfirm title="确认删除该文章？" onConfirm={() => remove.mutate(row.id)}>
              <a style={{ color: '#ff4d4f' }}>删除</a>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [review, remove],
  );

  return (
    <div>
      <PageHeader
        title="文章管理"
        description="G1：撰写 → 顾问/法务审核 → 通过后小程序可见"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            新建文章
          </Button>
        }
      />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="标题搜索"
            allowClear
            style={{ width: 240 }}
            onSearch={setKeyword}
          />
          <Select
            placeholder="审核状态"
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'pending', label: '待审核' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
            ]}
            onChange={(v) => setStatus(v ?? null)}
          />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          loading={isPending}
          columns={columns}
          dataSource={articles}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>
      <ArticleDrawer
        open={drawerOpen}
        record={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={invalidate}
      />
    </div>
  );
}
