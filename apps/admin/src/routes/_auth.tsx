import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router';
import { Button, Layout, Menu, Typography, App } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  ShopOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { AuthService } from '../services/auth.service';

/** 登录守卫 + 后台框架布局（无会话或非管理员一律重定向 /login） */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    const session = await AuthService.getSession();
    if (!session) throw redirect({ to: '/login' });
    if (!(await AuthService.isAdmin())) {
      await AuthService.signOut();
      throw redirect({ to: '/login', search: { error: 'forbidden' } });
    }
  },
  component: AuthLayout,
});

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '数据看板' },
  { key: '/milk', icon: <ShopOutlined />, label: '奶粉库' },
  { key: '/articles', icon: <FileTextOutlined />, label: '文章管理' },
  { key: '/templates', icon: <ScheduleOutlined />, label: '转奶模板' },
];

function AuthLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { message } = App.useApp();

  const logout = async () => {
    await AuthService.signOut();
    message.success('已退出登录');
    await navigate({ to: '/login' });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="dark" width={200}>
        {/* logo 区（对应画板 A-02 侧栏 logo-row） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 16px' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#FF6B35',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            奶
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 14 }}>
              转奶助手
            </Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
              管理后台
            </Typography.Text>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0 16px 12px' }} />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate({ to: key })}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingInline: 24,
          }}
        >
          <Button type="text" icon={<LogoutOutlined />} onClick={logout}>
            退出登录
          </Button>
        </Layout.Header>
        <Layout.Content style={{ margin: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
