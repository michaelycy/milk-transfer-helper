export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/login/index',
    'pages/index/index',
    'pages/records/index',
    'pages/articles/index',
    'pages/profile/index',
  ],
  subPackages: [
    {
      root: 'packages/plan',
      pages: ['pages/wizard/index', 'pages/detail/index'],
    },
    {
      root: 'packages/record',
      pages: ['pages/symptom/index'],
    },
    {
      root: 'packages/baby',
      pages: ['pages/create/index'],
    },
    {
      root: 'packages/milk',
      pages: ['pages/search/index', 'pages/compare/index'],
    },
    {
      root: 'packages/report',
      pages: ['pages/review/index'],
    },
    {
      root: 'packages/alert',
      pages: ['pages/detail/index'],
    },
    {
      root: 'packages/article',
      pages: ['pages/detail/index'],
    },
    {
      root: 'packages/user',
      pages: [
        'pages/settings/index',
        'pages/favorites/index',
        'pages/about/index',
        'pages/privacy/index',
        'pages/security/index',
        'pages/family/index',
        'pages/family-accept/index',
      ],
    },
    {
      root: 'packages/ai',
      pages: [
        'pages/chat/index',
        'pages/bottle/index',
        'pages/poop/index',
        'pages/can/index',
      ],
    },
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '转奶日记',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    // 自定义 tabBar：ui.pen home-tabbar 设计（lucide 图标 + 安全区），见 src/custom-tab-bar
    custom: true,
    color: '#999999',
    selectedColor: '#FF6B35',
    backgroundColor: '#ffffff',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/records/index', text: '记录' },
      { pagePath: 'pages/articles/index', text: '知识' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
})
