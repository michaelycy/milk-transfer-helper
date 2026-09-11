import { Text, View } from '@tarojs/components'
import '../shared.scss'

/** 关于我们（FR-H6）：版本、协议、反馈渠道 */
export default function About() {
  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>关于我们</Text>
      </View>
      <View className='card about-card'>
        <Text className='brand'>转奶日记</Text>
        <Text className='ver'>v1.1.0</Text>
        <Text className='para'>
          转奶日记是宝宝转奶期的记录与观察工具：三秒记奶、症状打卡、转奶计划与预警提示，
          帮助家庭平稳完成配方过渡。所有内容为提示与记录工具，不构成医学建议；
          如宝宝出现持续异常，请及时就医。
        </Text>
        <Text className='para'>用户协议与《隐私政策》：可在小程序资料页与隐私中心查看全文。</Text>
        <Text className='para'>反馈邮箱：feedback@milktransfer.example</Text>
      </View>
    </View>
  )
}
