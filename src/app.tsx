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
import { ensureSession } from './utils/auth'
import { toastError } from './utils/error'
import { track } from './services/analytics.service'
import { BabyProvider } from './store/baby'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  // 应用启动即建立匿名会话（FR-H0），后续页面可直接读写数据
  useLaunch(() => {
    ensureSession()
      .then(() => track('app_launch', { scene: Taro.getLaunchOptionsSync()?.scene }))
      .catch((error) => toastError(error, '初始化失败，请检查网络后重启小程序'))
  })

  // children 是将要渲染的页面；BabyProvider 提供全局宝宝状态（FR-A2）
  return <BabyProvider>{children}</BabyProvider>
}

export default App
