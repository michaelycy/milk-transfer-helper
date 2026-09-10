import { Button, Drawer, Form, Input, Select, App } from 'antd';
import { useEffect } from 'react';
import { ArticleService } from '../services/article.service';
import { ARTICLE_CATEGORIES, type ArticleRow } from '../types';

interface ArticleDrawerProps {
  open: boolean;
  /** null = 新建（默认 pending，走审核流后可见） */
  record: ArticleRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ArticleFormValues {
  title: string;
  category: string;
  author?: string;
  content: string;
}

/** 文章新建/编辑抽屉（FR-J3/G1；审核流转在列表行操作，抽屉只管内容） */
export function ArticleDrawer({ open, record, onClose, onSaved }: ArticleDrawerProps) {
  const [form] = Form.useForm<ArticleFormValues>();
  const { message } = App.useApp();

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (record) {
        form.setFieldsValue({
          title: record.title,
          category: record.category,
          author: record.author ?? undefined,
          content: record.content,
        });
      }
    }
  }, [open, record, form]);

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (record) {
        await ArticleService.update(record.id, values);
        message.success('已保存');
      } else {
        await ArticleService.create({ ...values, review_status: 'pending' });
        message.success('已创建，待审核');
      }
      onSaved();
      onClose();
    } catch (e) {
      message.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Drawer
      title={record ? '编辑文章' : '新建文章'}
      width={560}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Button type="primary" onClick={() => void save()}>
          保存
        </Button>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="文章标题" />
        </Form.Item>
        <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
          <Select
            options={ARTICLE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            placeholder="选择分类"
          />
        </Form.Item>
        <Form.Item name="author" label="作者">
          <Input placeholder="作者 / 团队名" />
        </Form.Item>
        <Form.Item
          name="content"
          label="正文"
          rules={[{ required: true, message: '请输入正文' }]}
          extra="纯文本；发布前须完成顾问审核与法务口径检查（G1）"
        >
          <Input.TextArea rows={14} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
