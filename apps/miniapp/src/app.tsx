import type { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
// taroify 按组件引入样式（1.0.6 的全量 index.css 引用了缺失的字体文件，不能整包引入）
import '@taroify/core/avatar/style'
import '@taroify/core/button/style'
import '@taroify/core/cell/style'
import '@taroify/core/checkbox/style'
import '@taroify/core/divider/style'
import '@taroify/core/empty/style'
import '@taroify/core/field/style'
import '@taroify/core/floating-bubble/style'
import '@taroify/core/form/style'
import '@taroify/core/input/style'
import '@taroify/core/loading/style'
import '@taroify/core/popup/style'
import '@taroify/core/search/style'
import '@taroify/core/tabs/style'
import '@taroify/core/textarea/style'
import { track } from './services/analytics.service'
import { AuthProvider } from './store/auth'
import { BabyProvider } from './store/baby'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  // 开屏页负责登录态路由；这里只在冷启动埋点（FR-H4）
  useLaunch(() => {
    track('app_launch', { scene: Taro.getLaunchOptionsSync()?.scene })
  })

  // AuthProvider → BabyProvider：宝宝数据仅在已登录（guest/wechat）时加载
  return (
    <AuthProvider>
      <BabyProvider>{children}</BabyProvider>
    </AuthProvider>
  )
}

export default App
