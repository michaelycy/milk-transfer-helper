import Taro from '@tarojs/taro'

/**
 * 自定义 tabBar 选中态同步：
 * tab 页面在 useDidShow 里调用 selectTabbar(index)，
 * custom-tab-bar 组件监听事件更新高亮。
 */
export const TABBAR_CHANGE_EVENT = 'tabbar:change'

export const TABBAR_TABS = [
  { path: '/pages/index/index', text: '首页' },
  { path: '/pages/records/index', text: '记录' },
  { path: '/pages/articles/index', text: '知识' },
  { path: '/pages/profile/index', text: '我的' },
] as const

export function selectTabbar(index: number): void {
  Taro.eventCenter.trigger(TABBAR_CHANGE_EVENT, index)
}
