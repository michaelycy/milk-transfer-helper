import { App, Button, Drawer, Form, Input, Select, Switch } from 'antd';
import { useEffect } from 'react';
import type { PlanDaySpec } from '@milk-transfer/shared';
import { TemplateService, type TemplatePatch } from '../services/template.service';
import { DaysEditor } from './days-editor';
import type { PlanTemplateRow } from '../types';

interface TemplateDrawerProps {
  open: boolean;
  record: PlanTemplateRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface TemplateFormValues {
  name: string;
  method: 'mixed' | 'interval';
  days: PlanDaySpec[];
  enabled: boolean;
  isDefault: boolean;
}

const METHOD_OPTIONS = [
  { value: 'mixed', label: '混合法（同顿按比例混合）' },
  { value: 'interval', label: '隔顿法（按顿替换）' },
];

/** 模板编辑抽屉（FR-J4/C2）：内容变更由服务端自动 version+1，进行中计划锁定创建时版本 */
export function TemplateDrawer({ open, record, onClose, onSaved }: TemplateDrawerProps) {
  const [form] = Form.useForm<TemplateFormValues>();
  const { message } = App.useApp();

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (record) {
        form.setFieldsValue({
          name: record.name,
          method: record.method,
          days: (record.days as unknown as PlanDaySpec[]) ?? [],
          enabled: record.enabled,
          isDefault: record.is_default,
        });
      }
    }
  }, [open, record, form]);

  const save = async () => {
    const values = await form.validateFields();
    const patch: TemplatePatch = {
      name: values.name,
      method: values.method,
      days: values.days,
      enabled: values.enabled,
      isDefault: values.isDefault,
    };
    try {
      if (record) {
        await TemplateService.update(record.id, patch);
        message.success('已保存；进行中计划仍按创建时版本执行');
      } else {
        await TemplateService.create({
          name: values.name,
          method: values.method,
          days: values.days,
          enabled: values.enabled,
          is_default: values.isDefault,
          version: 1,
        });
        message.success('已创建');
      }
      onSaved();
      onClose();
    } catch (e) {
      message.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Drawer
      title={record ? '编辑模板' : '新建模板'}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Button type="primary" onClick={() => void save()}>
          保存
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ method: 'mixed', enabled: true, isDefault: false, days: [] }}
      >
        <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如 七日标准节奏" />
        </Form.Item>
        <Form.Item name="method" label="转奶方法" rules={[{ required: true }]}>
          <Select options={METHOD_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="逐日节奏"
          required
          extra={record ? '保存后版本号自动 +1；进行中的计划按创建时版本锁定' : undefined}
        >
          <DaysEditor />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="isDefault" label="设为该方法默认模板" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
