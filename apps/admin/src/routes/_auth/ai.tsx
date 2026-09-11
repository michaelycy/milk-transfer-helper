import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { ApiOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { Typography } from 'antd';
import { PageHeader } from '../../components/page-header';
import { AiAdminService, AiProviderService } from '../../services/ai.service';
import { MilkService } from '../../services/milk.service';
import {
  AI_REVIEW_LABEL,
  AI_SCENE_LABEL,
  AI_SCENE_OPTIONS,
  type AiConfigRow,
  type AiKeyStatus,
  type AiPromptRow,
  type AiProviderRow,
  type AiReviewStatus,
  type AiScene,
  type AiSubmissionRow,
  type AiUsageRow,
} from '../../types';

export const Route = createFileRoute('/_auth/ai')({
  component: AiPage,
});

/** 内置供应商享有默认端点（zhipu/openai）；其他供应商按 AI_<PROVIDER大写>_API_KEY 约定读密钥并必填 base_url */
/** 注册表未收录的供应商仍允许在场景层临时覆盖端点（保留 K1 行为） */
const BUILTIN_PROVIDERS = ['zhipu', 'openai'];

interface ConfigFormValues {
  provider: string;
  model: string;
  base_url?: string;
  temperature: number;
  max_tokens: number;
  daily_limit_per_user: number;
  enabled: boolean;
  fallback_provider?: string | null;
  fallback_model?: string | null;
  note?: string;
}

interface ProviderFormValues {
  name: string;
  base_url: string;
  note?: string;
  enabled: boolean;
  api_key?: string;
}

function AiPage() {
  // 画板 A-08 page-head：右侧操作钮组可跨 Tab 跳转（补录队列带待处理计数）
  const [activeTab, setActiveTab] = useState('scenes');
  const [composerOpen, setComposerOpen] = useState(false);
  // 「依此编辑」携带原提示词作为新版本底稿；页头「新建提示词版本」为空白起步
  const [composerInitial, setComposerInitial] = useState<string>('');
  const { data: pending = [] } = useQuery({
    queryKey: ['ai-submissions', 'pending'],
    queryFn: () => AiAdminService.submissions('pending'),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="AI 配置"
        description="FR-J6 场景模型路由 · 提示词版本审核 · 补录队列 · 用量概览"
        extra={
          <Space>
            <Button icon={<InboxOutlined />} onClick={() => setActiveTab('queue')}>
              补录队列 ({pending.length})
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setActiveTab('prompts');
                setComposerInitial('');
                setComposerOpen(true);
              }}
            >
              新建提示词版本
            </Button>
          </Space>
        }
      />
      <Alert
        type="info"
        showIcon
        message="供应商密钥由服务端环境变量管理（AI_*_API_KEY），平台不存储、不展示密钥"
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'scenes', label: '场景配置', children: <ScenesPane /> },
          {
            key: 'prompts',
            label: '提示词模板',
            children: (
              <PromptsPane
                composerOpen={composerOpen}
                setComposerOpen={setComposerOpen}
                composerInitial={composerInitial}
              />
            ),
          },
          { key: 'providers', label: '供应商', children: <ProvidersPane /> },
          { key: 'queue', label: '补录队列', children: <QueuePane /> },
          { key: 'usage', label: '用量概览', children: <UsagePane /> },
        ]}
      />
    </Space>
  );
}

/* ---------- 场景配置 ---------- */

function ScenesPane() {
  const queryClient = useQueryClient();
  const { data: configs = [], isPending } = useQuery({
    queryKey: ['ai-configs'],
    queryFn: () => AiAdminService.configs(),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => AiProviderService.list(),
  });
  const enabledProviders = providers.filter((pv) => pv.enabled);
  const providerOptions = enabledProviders.map((pv) => ({ value: pv.name }));
  const [editing, setEditing] = useState<AiConfigRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm<ConfigFormValues>();

  const openEdit = (row: AiConfigRow) => {
    setEditing(row);
    form.setFieldsValue({
      provider: row.provider,
      model: row.model,
      base_url: row.base_url ?? '',
      temperature: Number(row.temperature),
      max_tokens: row.max_tokens,
      daily_limit_per_user: row.daily_limit_per_user,
      enabled: row.enabled,
      fallback_provider: row.fallback_provider ?? null,
      fallback_model: row.fallback_model ?? null,
      note: row.note ?? '',
    });
    setDrawerOpen(true);
  };

  const [probing, setProbing] = useState(false);
  const probeForm = async () => {
    const provider = form.getFieldValue('provider');
    const model = form.getFieldValue('model');
    if (!provider || !model) {
      message.warning('请先填写供应商与模型名');
      return;
    }
    setProbing(true);
    try {
      const r = await AiProviderService.probe({
        provider,
        model,
        base_url: form.getFieldValue('base_url') || null,
      });
      if (r.ok) message.success(`连通正常 · ${r.latency_ms}ms`);
      else message.error(`连通失败：${r.error?.message ?? '未知错误'}`);
    } catch (e) {
      message.error(`探针失败：${(e as Error).message}`);
    } finally {
      setProbing(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (values: ConfigFormValues) => {
      if (!editing) throw new Error('未选择场景');
      return AiAdminService.updateConfig(editing.id, {
        ...values,
        base_url: values.base_url || null,
        fallback_provider: values.fallback_provider || null,
        fallback_model: values.fallback_model || null,
      });
    },
    onSuccess: () => {
      message.success('已保存');
      setDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['ai-configs'] });
    },
    onError: (e) => message.error(`保存失败：${e.message}`),
  });

  return (
    <>
      <Table<AiConfigRow>
        rowKey="id"
        size="middle"
        loading={isPending}
        dataSource={configs}
        pagination={false}
        columns={[
          { title: '场景', dataIndex: 'scene', render: (s: AiScene) => AI_SCENE_LABEL[s] },
          { title: '供应商', dataIndex: 'provider' },
          { title: '模型', dataIndex: 'model' },
          { title: '温度', dataIndex: 'temperature' },
          {
            title: '每日限额',
            dataIndex: 'daily_limit_per_user',
            render: (v: number) => `${v} 次/人/日`,
          },
          {
            title: '状态',
            dataIndex: 'enabled',
            render: (enabled: boolean) =>
              enabled ? <Tag color="green">启用中</Tag> : <Tag>已停用</Tag>,
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, row) => (
              <Button type="link" onClick={() => openEdit(row)}>
                编辑
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        title={editing ? `编辑场景 · ${AI_SCENE_LABEL[editing.scene]}` : '编辑场景'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item
            name="provider"
            label="供应商（来自供应商注册表）"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              placeholder="选择供应商"
              showSearch
              options={(providerOptions.some((o) => o.value === editing?.provider) ||
              !editing?.provider
                ? providerOptions
                : [{ value: editing.provider }, ...providerOptions]
              ).map((o) => ({ value: o.value, label: o.value }))}
            />
          </Form.Item>
          <Form.Item
            name="model"
            label="模型名（OpenAI 兼容协议；视觉场景需支持 image 输入）"
            rules={[{ required: true, message: '请输入模型名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.provider !== cur.provider}>
            {({ getFieldValue }) => {
              const custom =
                getFieldValue('provider') && !BUILTIN_PROVIDERS.includes(getFieldValue('provider'));
              return (
                <Form.Item
                  name="base_url"
                  label={
                    custom
                      ? '服务端点（自定义供应商必填，OpenAI 兼容 /v1 地址）'
                      : '自定义端点（可选，覆盖供应商默认）'
                  }
                  rules={
                    custom
                      ? [{ required: true, message: '自定义供应商必须填写服务端点' }]
                      : undefined
                  }
                >
                  <Input placeholder="https://…" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="temperature" label="温度（0–2）" rules={[{ required: true }]}>
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="max_tokens" label="最大 Tokens" rules={[{ required: true }]}>
            <InputNumber min={1} max={8192} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="daily_limit_per_user"
            label="每用户每日限额（次）"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="fallback_provider"
            label="备用供应商（可空；主模型调用失败时自动重试一次，FR-K7）"
          >
            <Select
              allowClear
              placeholder="选择备用供应商"
              options={providerOptions.map((o) => ({ value: o.value, label: o.value }))}
            />
          </Form.Item>
          <Form.Item name="fallback_model" label="备用模型名（与备用供应商配套）">
            <Input placeholder="gpt-4o-mini" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button icon={<ApiOutlined />} loading={probing} onClick={() => void probeForm()}>
              测试连通
            </Button>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              保存
            </Button>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}

/* ---------- 提示词模板 ---------- */

function PromptsPane({
  composerOpen,
  setComposerOpen,
  composerInitial,
}: {
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  composerInitial: string;
}) {
  const queryClient = useQueryClient();
  const [scene, setScene] = useState<AiScene>('chat');
  const [form] = Form.useForm<{ system_prompt: string }>();
  const { data: prompts = [], isPending } = useQuery({
    queryKey: ['ai-prompts', scene],
    queryFn: () => AiAdminService.prompts(scene),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-prompts'] });

  const createMutation = useMutation({
    mutationFn: async (values: { system_prompt: string }) => {
      const nextVersion = Math.max(0, ...prompts.map((p) => p.version)) + 1;
      return AiAdminService.createPrompt({
        scene,
        version: nextVersion,
        system_prompt: values.system_prompt,
      });
    },
    onSuccess: () => {
      message.success('已提交，待顾问审核');
      setComposerOpen(false);
      void invalidate();
    },
    onError: (e) => message.error(`提交失败：${e.message}`),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Extract<AiReviewStatus, 'approved' | 'rejected'>;
    }) =>
      AiAdminService.reviewPrompt(id, status, status === 'approved' ? '审核通过' : '驳回待修改'),
    onSuccess: () => {
      message.success('已更新审核状态');
      void invalidate();
    },
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const enableMutation = useMutation({
    mutationFn: (row: AiPromptRow) => AiAdminService.enablePrompt(row),
    onSuccess: () => {
      message.success('已启用（旧版本自动停用）');
      void invalidate();
    },
    onError: (e) => message.error(`启用失败：${e.message}`),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Text strong>提示词模板 · {AI_SCENE_LABEL[scene]}</Typography.Text>
        <Select
          value={scene}
          onChange={(v) => setScene(v)}
          options={AI_SCENE_OPTIONS}
          style={{ width: 180 }}
        />
      </Space>
      <Table<AiPromptRow>
        rowKey="id"
        size="middle"
        loading={isPending}
        dataSource={prompts}
        pagination={false}
        columns={[
          { title: '版本', dataIndex: 'version', render: (v: number) => `v${v}` },
          {
            title: '审核状态',
            dataIndex: 'review_status',
            render: (s: AiReviewStatus) => (
              <Tag color={s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'orange'}>
                {AI_REVIEW_LABEL[s]}
              </Tag>
            ),
          },
          { title: '审核时间', dataIndex: 'reviewed_at', render: (v: string | null) => v ?? '—' },
          { title: '审核备注', dataIndex: 'review_note', render: (v: string | null) => v ?? '—' },
          {
            title: '启用',
            dataIndex: 'enabled',
            render: (enabled: boolean, row) =>
              enabled ? (
                <Tag color="green">启用中</Tag>
              ) : (
                <Popconfirm
                  title="启用该版本？同场景当前启用版本将自动停用"
                  disabled={row.review_status !== 'approved'}
                >
                  <Button
                    size="small"
                    type="link"
                    disabled={row.review_status !== 'approved'}
                    onClick={() => enableMutation.mutate(row)}
                  >
                    启用
                  </Button>
                </Popconfirm>
              ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, row) =>
              row.review_status === 'pending' ? (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => reviewMutation.mutate({ id: row.id, status: 'approved' })}
                  >
                    通过
                  </Button>
                  <Button
                    size="small"
                    onClick={() => reviewMutation.mutate({ id: row.id, status: 'rejected' })}
                  >
                    驳回
                  </Button>
                </Space>
              ) : (
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    // 版本不可变：以原文案为底稿新建下一版本（预置提示词同样由此编辑）
                    form.setFieldsValue({ system_prompt: row.system_prompt });
                    setComposerOpen(true);
                  }}
                >
                  依此编辑
                </Button>
              ),
          },
        ]}
        expandable={{
          expandedRowRender: (row) => (
            <Input.TextArea readOnly rows={6} value={row.system_prompt} />
          ),
        }}
      />
      <Typography.Text type="secondary">
        仅 approved 版本可启用；涉医学口径变更须经顾问审核（NFR-1）。启用新版自动停用旧版。
      </Typography.Text>
      <Modal
        title={`新建提示词版本 · ${AI_SCENE_LABEL[scene]}`}
        open={composerOpen}
        afterOpenChange={(open) => {
          if (open) {
            if (composerInitial) form.setFieldsValue({ system_prompt: composerInitial });
            else form.resetFields();
          }
        }}
        onCancel={() => setComposerOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item
            name="system_prompt"
            label="System Prompt（支持变量 {baby_nickname} {baby_age_months} {plan_day_label} {current_formula}）"
            rules={[{ required: true, message: '请输入提示词' }]}
          >
            <Input.TextArea rows={10} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

/* ---------- 补录队列 ---------- */

function QueuePane() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AiSubmissionRow['status'] | null>('pending');
  const { data: submissions = [], isPending } = useQuery({
    queryKey: ['ai-submissions', status],
    queryFn: () => AiAdminService.submissions(status),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-submissions'] });

  const transitionMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'processed' | 'dismissed' }) =>
      AiAdminService.transitionSubmission(id, next),
    onSuccess: () => {
      message.success('已处理');
      void invalidate();
    },
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const toProduct = useMutation({
    mutationFn: async (row: AiSubmissionRow) => {
      const payload = row.payload as {
        recognized?: { brand?: string; series?: string | null; stage?: number | null };
      };
      const r = payload.recognized ?? {};
      await MilkService.create({
        brand: r.brand ?? '待补充品牌',
        name: r.series ?? '待补充产品名',
        stage: (r.stage ?? 1) as 1 | 2 | 3 | 4,
        protein_type: 'intact',
        region: 'domestic',
        ingredients: {},
        status: 'off_shelf',
      });
      return AiAdminService.transitionSubmission(row.id, 'processed');
    },
    onSuccess: () => {
      message.success('已创建草稿 SKU（默认下架），请在奶粉库完善后上架');
      void invalidate();
    },
    onError: (e) => message.error(`转奶粉库失败：${e.message}`),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Select
        allowClear
        placeholder="全部状态"
        value={status}
        onChange={(v) => setStatus(v ?? null)}
        style={{ width: 160 }}
        options={[
          { value: 'pending', label: '待处理' },
          { value: 'processed', label: '已处理' },
          { value: 'dismissed', label: '已忽略' },
        ]}
      />
      <Table<AiSubmissionRow>
        rowKey="id"
        size="middle"
        loading={isPending}
        dataSource={submissions}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '来源', dataIndex: 'source', width: 100 },
          {
            title: '识别内容',
            key: 'payload',
            render: (_: unknown, row) => {
              const payload = row.payload as {
                recognized?: { brand?: string; stage?: number | null };
              };
              const r = payload.recognized ?? {};
              return `${r.brand ?? '未知品牌'}${r.stage ? ` · ${r.stage} 段` : ''}`;
            },
          },
          {
            title: '照片',
            dataIndex: 'image_path',
            render: (v: string | null) => (v ? '已附照片' : '无'),
          },
          { title: '提交时间', dataIndex: 'created_at' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (s: AiSubmissionRow['status']) =>
              s === 'pending' ? (
                <Tag color="orange">待处理</Tag>
              ) : (
                <Tag>{s === 'processed' ? '已处理' : '已忽略'}</Tag>
              ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, row) =>
              row.status === 'pending' ? (
                <Space>
                  <Popconfirm
                    title="以识别结果创建草稿 SKU 并置为已处理？"
                    onConfirm={() => toProduct.mutate(row)}
                  >
                    <Button size="small" type="primary">
                      转奶粉库
                    </Button>
                  </Popconfirm>
                  <Button
                    size="small"
                    onClick={() => transitionMutation.mutate({ id: row.id, next: 'dismissed' })}
                  >
                    忽略
                  </Button>
                </Space>
              ) : null,
          },
        ]}
      />
    </Space>
  );
}

/* ---------- 用量概览 ---------- */

function UsagePane() {
  const { data: usage = [], isPending } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => AiAdminService.usageRecent(7),
  });
  const { data: pending = [] } = useQuery({
    queryKey: ['ai-submissions', 'pending'],
    queryFn: () => AiAdminService.submissions('pending'),
  });

  const stats = useMemo(() => {
    const total = usage.length;
    const success = usage.filter((u) => u.success).length;
    const tokens = usage.reduce((sum, u) => sum + Number(u.tokens ?? 0), 0);
    const byScene = usage.reduce<Record<string, AiUsageRow[]>>((acc, u) => {
      (acc[u.scene] ??= []).push(u);
      return acc;
    }, {});
    return { total, success, tokens, byScene };
  }, [usage]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space size={16} wrap>
        <CardStat title="今日调用" value={stats.total} loading={isPending} />
        <CardStat
          title="成功率"
          value={stats.total ? `${((stats.success / stats.total) * 100).toFixed(1)}%` : '—'}
          loading={isPending}
        />
        <CardStat
          title="平均 Tokens"
          value={stats.total ? Math.round(stats.tokens / stats.total) : '—'}
          loading={isPending}
        />
        <CardStat title="待处理补录" value={pending.length} loading={isPending} />
      </Space>
      <Table
        rowKey="scene"
        size="middle"
        loading={isPending}
        pagination={false}
        dataSource={Object.entries(stats.byScene).map(([scene, list]) => {
          const success = list.filter((u) => u.success).length;
          return {
            scene: scene as AiScene,
            total: list.length,
            successRate: list.length ? `${((success / list.length) * 100).toFixed(1)}%` : '—',
            tokens: list.reduce((s, u) => s + Number(u.tokens ?? 0), 0),
          };
        })}
        columns={[
          { title: '场景', dataIndex: 'scene', render: (s: AiScene) => AI_SCENE_LABEL[s] },
          { title: '调用次数', dataIndex: 'total' },
          { title: '成功率', dataIndex: 'successRate' },
          { title: 'Tokens', dataIndex: 'tokens' },
        ]}
      />
    </Space>
  );
}

function CardStat({
  title,
  value,
  loading,
}: {
  title: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 180 }}>
      <Statistic title={title} value={value} loading={loading} />
    </div>
  );
}

/* ---------- 供应商注册表（FR-J7/K6/K8） ---------- */

function ProvidersPane() {
  const queryClient = useQueryClient();
  const { data: providers = [], isPending } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => AiProviderService.list(),
  });
  const [editing, setEditing] = useState<AiProviderRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastProbe, setLastProbe] = useState<string | null>(null);
  // 探针进行中的供应商名（行级 loading）；密钥状态按行查询（修复串行显示）
  const [probingName, setProbingName] = useState<string | null>(null);
  const { data: keyRows = [] } = useQuery({
    queryKey: ['ai-provider-keys'],
    queryFn: () => AiProviderService.keysOverview(),
  });
  const keyStatusMap = useMemo(() => {
    const map: Record<string, { configured: boolean; last4: string; source: 'database' }> = {};
    keyRows.forEach((r) => {
      map[r.provider] = { configured: true, last4: r.last4, source: 'database' };
    });
    return map;
  }, [keyRows]);
  const editingKeyStatus: AiKeyStatus | null = editing
    ? (keyStatusMap[editing.name] ?? { configured: false, last4: '', source: 'none' })
    : null;
  const [form] = Form.useForm<ProviderFormValues>();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    void queryClient.invalidateQueries({ queryKey: ['ai-provider-keys'] });
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setLastProbe(null);
    setDrawerOpen(true);
  };
  const openEdit = (row: AiProviderRow) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      base_url: row.base_url,
      note: row.note ?? '',
      enabled: row.enabled,
    });
    setLastProbe(null);
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: ProviderFormValues & { api_key?: string }) => {
      if (editing) {
        await AiProviderService.update(editing.id, {
          base_url: values.base_url,
          note: values.note || null,
          enabled: values.enabled,
        });
      } else {
        await AiProviderService.create({
          name: values.name,
          base_url: values.base_url,
          note: values.note || null,
          enabled: values.enabled,
        });
      }
      // API Key 留空 = 不修改；填写即加密落库（AES-256-GCM）
      if (values.api_key) {
        await AiProviderService.setProviderKey(values.name, values.api_key);
      }
    },
    onSuccess: () => {
      message.success('已保存');
      setDrawerOpen(false);
      invalidate();
    },
    onError: (e) => message.error(`保存失败：${e.message}`),
  });

  const clearKeyMutation = useMutation({
    mutationFn: (name: string) => AiProviderService.clearProviderKey(name),
    onSuccess: () => {
      message.success('已清除，调用将回退环境变量密钥');
      invalidate();
    },
    onError: (e) => message.error(`清除失败：${e.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (row: AiProviderRow) => AiProviderService.update(row.id, { enabled: !row.enabled }),
    onSuccess: () => void invalidate(),
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: (row: AiProviderRow) => AiProviderService.remove(row.id),
    onSuccess: () => {
      message.success('已删除');
      void invalidate();
    },
    onError: (e) => message.error(`删除失败：${e.message}`),
  });

  const probeMutation = useMutation({
    mutationFn: (input: { provider: string; model: string; base_url?: string | null }) =>
      AiProviderService.probe(input),
    onSuccess: (r) => {
      setLastProbe(
        r.ok ? `连通正常 · ${r.latency_ms}ms` : `连通失败：${r.error?.message ?? '未知错误'}`,
      );
      if (r.ok) message.success(`连通正常 · ${r.latency_ms}ms`);
      else message.error(`连通失败：${r.error?.message ?? '未知错误'}`);
    },
    onError: (e) => message.error(`探针失败：${(e as Error).message}`),
  });

  const probeRow = (row: AiProviderRow) => {
    message.loading({ content: '探针中…', key: 'probe', duration: 0 });
    probeMutation.mutate(
      { provider: row.name, model: '*', base_url: row.base_url },
      {
        onSuccess: () => message.destroy('probe'),
        onError: () => message.destroy('probe'),
      },
    );
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建供应商
        </Button>
        <Typography.Text type="secondary">
          供应商只登记名称与端点；密钥请配置后端环境变量 AI_&lt;名称大写&gt;_API_KEY
        </Typography.Text>
      </Space>
      <Table<AiProviderRow>
        rowKey="id"
        size="middle"
        loading={isPending}
        dataSource={providers}
        pagination={false}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
          },
          { title: '服务端点', dataIndex: 'base_url' },
          { title: '备注', dataIndex: 'note', render: (v: string | null) => v ?? '—' },
          {
            title: '密钥',
            key: 'key',
            render: (_: unknown, row) =>
              keyStatusMap[row.name]?.configured ? (
                <Typography.Text>已配置（****{keyStatusMap[row.name].last4}）</Typography.Text>
              ) : (
                <Typography.Text type="secondary">未配置</Typography.Text>
              ),
          },
          {
            title: '状态',
            dataIndex: 'enabled',
            render: (enabled: boolean) =>
              enabled ? <Tag color="green">启用中</Tag> : <Tag>已停用</Tag>,
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, row) => (
              <Space>
                <Button
                  size="small"
                  type="link"
                  icon={<ApiOutlined />}
                  loading={probingName === row.name}
                  onClick={() => probeRow(row)}
                >
                  测试
                </Button>
                <Button size="small" type="link" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                {row.enabled ? (
                  <Button size="small" type="link" onClick={() => toggleMutation.mutate(row)}>
                    停用
                  </Button>
                ) : (
                  <Popconfirm title="停用后引用它的场景将走降级路径，确认停用？">
                    <Button size="small" type="link" onClick={() => toggleMutation.mutate(row)}>
                      启用
                    </Button>
                  </Popconfirm>
                )}
                {!row.enabled && (
                  <Popconfirm
                    title="仅可删除已停用且无场景引用的供应商，确认删除？"
                    onConfirm={() => removeMutation.mutate(row)}
                  >
                    <Button size="small" type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Drawer
        title={editing ? `编辑供应商 · ${editing.name}` : '新建供应商'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Button
            icon={<ApiOutlined />}
            loading={probingName === form.getFieldValue('name')}
            onClick={() => {
              const name = form.getFieldValue('name');
              setProbingName(name);
              probeMutation.mutate({
                provider: name,
                model: '*',
                base_url: form.getFieldValue('base_url') || null,
              });
            }}
          >
            测试
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '请输入供应商名称' }]}
            extra={
              editing
                ? '名称创建后不可修改（场景按名称引用）'
                : '如 dashscope；密钥环境变量将按名称约定读取'
            }
          >
            <Input disabled={!!editing} placeholder="dashscope" />
          </Form.Item>
          <Form.Item
            name="base_url"
            label="服务端点（OpenAI 兼容 /v1 地址）"
            rules={[{ required: true, message: '请输入服务端点' }]}
          >
            <Input placeholder="https://…" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API Key"
            extra={
              editingKeyStatus?.configured
                ? `已配置（****${editingKeyStatus.last4}），留空保持不变；替换请直接输入新 Key`
                : '未配置：填写后将加密存储（AES-256-GCM），保存后不再显示'
            }
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                editingKeyStatus?.configured
                  ? `已配置（****${editingKeyStatus.last4}）`
                  : '输入供应商 API Key'
              }
              suffix={
                editingKeyStatus?.configured && editing ? (
                  <Typography.Link
                    onClick={() => editing && clearKeyMutation.mutate(editing.name)}
                    style={{ fontSize: 12 }}
                  >
                    清除
                  </Typography.Link>
                ) : undefined
              }
            />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          {lastProbe && (
            <Alert
              type={lastProbe.startsWith('连通正常') ? 'success' : 'error'}
              showIcon
              message={lastProbe}
            />
          )}
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
            保存
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
