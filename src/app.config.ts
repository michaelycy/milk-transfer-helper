export default defineAppConfig({
  pages: [
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
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '婴儿转奶助手',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#FF6B35',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tab-home.png',
        selectedIconPath: 'assets/tab-home-active.png',
      },
      {
        pagePath: 'pages/records/index',
        text: '记录',
        iconPath: 'assets/tab-record.png',
        selectedIconPath: 'assets/tab-record-active.png',
      },
      {
        pagePath: 'pages/articles/index',
        text: '知识',
        iconPath: 'assets/tab-article.png',
        selectedIconPath: 'assets/tab-article-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-profile.png',
        selectedIconPath: 'assets/tab-profile-active.png',
      },
    ],
  },
})
