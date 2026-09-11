import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/page-header';
import { MilkService } from '../../services/milk.service';
import {
  PROTEIN_TYPE_LABEL,
  PROTEIN_TYPE_OPTIONS,
  type MilkProductRow,
  type MilkStatus,
} from '../../types';
import { downloadMilkCsvTemplate, parseMilkCsv } from '../../utils/csv';

export const Route = createFileRoute('/_auth/milk')({
  component: MilkPage,
});

const INGREDIENT_OPTIONS = ['OPO', '乳铁蛋白', '益生菌', 'DHA/ARA', '含蔗糖', '含香精'];

interface MilkFormValues {
  brand: string;
  name: string;
  stage: number;
  protein_type: string;
  region: 'domestic' | 'overseas';
  reg_no?: string;
  mix_ratio?: string;
  price_range?: string;
  ingredients: string[];
  status: 'on_shelf' | 'off_shelf';
}

function MilkPage() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [stage, setStage] = useState<number | null>(null);
  const [proteinType, setProteinType] = useState<string | null>(null);
  const [status, setStatus] = useState<MilkStatus | null>(null);

  const { data: products = [], isPending } = useQuery({
    queryKey: ['milk', keyword, stage, proteinType, status],
    queryFn: () => MilkService.list({ keyword, stage, proteinType, status }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['milk'] });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MilkProductRow | null>(null);
  const [form] = Form.useForm<MilkFormValues>();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };
  const openEdit = (row: MilkProductRow) => {
    setEditing(row);
    form.setFieldsValue({
      brand: row.brand,
      name: row.name,
      stage: row.stage,
      protein_type: row.protein_type,
      region: row.region,
      reg_no: row.reg_no ?? '',
      mix_ratio: row.mix_ratio ?? '',
      price_range: row.price_range ?? '',
      ingredients: Object.entries(row.ingredients as Record<string, unknown>)
        .filter(([k, v]) => v === true && INGREDIENT_OPTIONS.includes(k))
        .map(([k]) => k),
      status: row.status,
    });
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: MilkFormValues) => {
      const ingredients = Object.fromEntries(
        values.ingredients.filter((k) => INGREDIENT_OPTIONS.includes(k)).map((k) => [k, true]),
      );
      // TY 注册号自动补特医标记（与 CSV 导入口径一致）
      if (values.reg_no?.startsWith('TY')) ingredients['须在医生指导下使用'] = true;
      const payload = {
        brand: values.brand,
        name: values.name,
        stage: values.stage,
        protein_type: values.protein_type,
        region: values.region,
        reg_no: values.reg_no || null,
        mix_ratio: values.mix_ratio || null,
        price_range: values.price_range || null,
        ingredients,
        status: values.status,
      };
      if (editing) return MilkService.update(editing.id, payload);
      return MilkService.create(payload);
    },
    onSuccess: () => {
      message.success(editing ? '已保存' : '已创建');
      setDrawerOpen(false);
      void invalidate();
    },
    onError: (e) => message.error(`保存失败：${e.message}`),
  });

  const toggleStatus = useMutation({
    mutationFn: (row: MilkProductRow) =>
      MilkService.update(row.id, { status: row.status === 'on_shelf' ? 'off_shelf' : 'on_shelf' }),
    onSuccess: () => {
      message.success('已更新上下架状态');
      void invalidate();
    },
    onError: (e) => message.error(`操作失败：${e.message}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => MilkService.remove(id),
    onSuccess: () => {
      message.success('已删除');
      void invalidate();
    },
    onError: (e) => message.error(`删除失败：${e.message}`),
  });

  // ---- CSV 导入 ----
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    count: number;
    errors: string[];
    text: string;
  } | null>(null);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    void file.text().then((text) => {
      const { rows, errors } = parseMilkCsv(text);
      setImportPreview({ count: rows.length, errors, text });
    });
    return false; // 阻止自动上传，仅本地解析
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importPreview) throw new Error('请先选择文件');
      const { rows } = parseMilkCsv(importPreview.text);
      return MilkService.importRows(rows);
    },
    onSuccess: (count) => {
      message.success(`已导入 ${count} 条（重复 SKU 已覆盖）`);
      setImportOpen(false);
      setImportPreview(null);
      void invalidate();
    },
    onError: (e) => message.error(`导入失败：${e.message}`),
  });

  const columns = useMemo(
    () => [
      { title: '品牌', dataIndex: 'brand', width: 120 },
      { title: '产品名', dataIndex: 'name', ellipsis: true },
      { title: '段位', dataIndex: 'stage', width: 60, align: 'center' as const },
      {
        title: '蛋白类型',
        dataIndex: 'protein_type',
        width: 100,
        render: (v: string) => PROTEIN_TYPE_LABEL[v] ?? v,
      },
      {
        title: '版本',
        dataIndex: 'region',
        width: 80,
        render: (v: string) => (v === 'overseas' ? '海外' : '国行'),
      },
      {
        title: '注册号',
        dataIndex: 'reg_no',
        width: 150,
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '成分标记',
        dataIndex: 'ingredients',
        render: (v: Record<string, unknown>) =>
          Object.entries(v ?? {})
            .filter(([, val]) => val === true)
            .map(([k]) => (
              <Tag key={k} style={{ marginInlineEnd: 4 }}>
                {k}
              </Tag>
            )),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 80,
        render: (v: string) => (v === 'on_shelf' ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>),
      },
      {
        title: '操作',
        key: 'actions',
        width: 200,
        render: (_: unknown, row: MilkProductRow) => (
          <Space>
            <a onClick={() => openEdit(row)}>编辑</a>
            <a onClick={() => toggleStatus.mutate(row)}>
              {row.status === 'on_shelf' ? '下架' : '上架'}
            </a>
            <Popconfirm title="确认删除该 SKU？" onConfirm={() => remove.mutate(row.id)}>
              <a style={{ color: '#cf1322' }}>删除</a>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleStatus, remove],
  );

  return (
    <div>
      <PageHeader
        title="奶粉库"
        description="FR-B1 运营维护，客户端只读、中性呈现；特医配方（TY）自动标记「须在医生指导下使用」"
        extra={
          <Space>
            <Button
              icon={<UploadOutlined />}
              onClick={() => {
                setImportPreview(null);
                setImportOpen(true);
              }}
            >
              CSV 导入
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建 SKU
            </Button>
          </Space>
        }
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="品牌 / 产品名"
            allowClear
            style={{ width: 220 }}
            onSearch={setKeyword}
          />
          <Select
            placeholder="段位"
            allowClear
            style={{ width: 100 }}
            options={[1, 2, 3, 4].map((s) => ({ value: s, label: `${s} 段` }))}
            onChange={setStage}
          />
          <Select
            placeholder="蛋白类型"
            allowClear
            style={{ width: 130 }}
            options={PROTEIN_TYPE_OPTIONS}
            onChange={setProteinType}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            options={[
              { value: 'on_shelf', label: '上架' },
              { value: 'off_shelf', label: '下架' },
            ]}
            onChange={(v) => setStatus((v as MilkStatus | undefined) ?? null)}
          />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          loading={isPending}
          columns={columns}
          dataSource={products}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Drawer
        title={editing ? '编辑 SKU' : '新建 SKU'}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Button type="primary" loading={saveMutation.isPending} onClick={() => form.submit()}>
            保存
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ region: 'domestic', status: 'on_shelf', ingredients: [] }}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item name="brand" label="品牌" rules={[{ required: true }]}>
            <Input placeholder="如 爱他美" />
          </Form.Item>
          <Form.Item name="name" label="产品名" rules={[{ required: true }]}>
            <Input placeholder="如 卓萃幼儿配方奶粉 3 段" />
          </Form.Item>
          <Space size="large">
            <Form.Item
              name="stage"
              label="段位"
              rules={[{ required: true }]}
              style={{ width: 100 }}
            >
              <Select options={[1, 2, 3, 4].map((s) => ({ value: s, label: `${s} 段` }))} />
            </Form.Item>
            <Form.Item
              name="protein_type"
              label="蛋白类型"
              rules={[{ required: true }]}
              style={{ width: 160 }}
            >
              <Select options={PROTEIN_TYPE_OPTIONS} />
            </Form.Item>
          </Space>
          <Form.Item name="region" label="版本">
            <Radio.Group
              options={[
                { value: 'domestic', label: '国行' },
                { value: 'overseas', label: '海外' },
              ]}
            />
          </Form.Item>
          <Form.Item name="reg_no" label="注册号（国食注字 YP/TY，海外版留空）">
            <Input placeholder="YP2024000000" />
          </Form.Item>
          <Form.Item name="mix_ratio" label="冲调比例（按罐体标注）">
            <Input placeholder="如 30ml/平勺" />
          </Form.Item>
          <Form.Item name="price_range" label="参考价区间（非实时）">
            <Input placeholder="如 200–260 元" />
          </Form.Item>
          <Form.Item name="ingredients" label="成分标记（小程序端按标签原样呈现）">
            <Select
              mode="multiple"
              options={INGREDIENT_OPTIONS.map((k) => ({ value: k, label: k }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group
              options={[
                { value: 'on_shelf', label: '上架' },
                { value: 'off_shelf', label: '下架' },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="CSV 批量导入"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={() => importMutation.mutate()}
        okText="确认导入"
        okButtonProps={{
          disabled: !importPreview || importPreview.count === 0 || importPreview.errors.length > 0,
        }}
        confirmLoading={importMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="重复 SKU（品牌+产品名+段位+版本）以后到者覆盖；注册号 TY 开头自动加特医标记"
          />
          <Upload.Dragger
            accept=".csv"
            maxCount={1}
            beforeUpload={beforeUpload}
            onRemove={() => setImportPreview(null)}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到此处</p>
          </Upload.Dragger>
          <Button type="link" onClick={downloadMilkCsvTemplate} style={{ padding: 0 }}>
            下载导入模板（含示例行）
          </Button>
          {importPreview && importPreview.errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              message={`解析失败：${importPreview.errors.length} 处错误，请修正后重试`}
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {importPreview.errors.slice(0, 10).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          )}
          {importPreview && importPreview.errors.length === 0 && (
            <Alert type="success" showIcon message={`解析成功：${importPreview.count} 条待导入`} />
          )}
        </Space>
      </Modal>
    </div>
  );
}
