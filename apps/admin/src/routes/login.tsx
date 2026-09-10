import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { AuthService } from '../services/auth.service';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate({ from: '/login' });
  const { error } = useSearch({ from: '/login' });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<{ email: string; password: string }>();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await AuthService.signIn(values.email, values.password);
      // 登录成功但不在 admins 白名单 → 视为无权限
      if (!(await AuthService.isAdmin())) {
        await AuthService.signOut();
        message.error('该账号不在管理员白名单，请联系数据库管理员添加');
        return;
      }
      await navigate({ to: '/' });
    } catch (e) {
      message.error(`登录失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card style={{ width: 380 }}>
        <Typography.Title level={4} style={{ textAlign: 'center', marginTop: 0 }}>
          管理后台 · 转奶日记
        </Typography.Title>
        {error === 'forbidden' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="会话已失效或账号无管理权限，请重新登录"
          />
        )}
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入管理员邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="admin@example.com" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
