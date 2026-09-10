import { useEffect, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { TABBAR_CHANGE_EVENT, TABBAR_TABS } from '../utils/tabbar'
import homeIcon from '../assets/tab-home.png'
import homeActiveIcon from '../assets/tab-home-active.png'
import recordIcon from '../assets/tab-record.png'
import recordActiveIcon from '../assets/tab-record-active.png'
import articleIcon from '../assets/tab-article.png'
import articleActiveIcon from '../assets/tab-article-active.png'
import profileIcon from '../assets/tab-profile.png'
import profileActiveIcon from '../assets/tab-profile-active.png'
import './index.scss'

const ICONS = [
  { icon: homeIcon, activeIcon: homeActiveIcon },
  { icon: recordIcon, activeIcon: recordActiveIcon },
  { icon: articleIcon, activeIcon: articleActiveIcon },
  { icon: profileIcon, activeIcon: profileActiveIcon },
]

/** 自定义 tabBar（ui.pen home-tabbar 设计：50pt 内容高 + 安全区，lucide 线性图标） */
export default function CustomTabBar() {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const onChange = (index: number) => setSelected(index)
    Taro.eventCenter.on(TABBAR_CHANGE_EVENT, onChange)
    return () => {
      Taro.eventCenter.off(TABBAR_CHANGE_EVENT, onChange)
    }
  }, [])

  const handleClick = (index: number, path: string): void => {
    setSelected(index)
    Taro.switchTab({ url: path })
  }

  return (
    <View className='tabbar'>
      {TABBAR_TABS.map((tab, index) => (
        <View
          key={tab.path}
          className='tabbar__item'
          onClick={() => handleClick(index, tab.path)}
        >
          <Image
            className='tabbar__icon'
            src={selected === index ? ICONS[index].activeIcon : ICONS[index].icon}
          />
          <Text className={`tabbar__label ${selected === index ? 'is-active' : ''}`}>
            {tab.text}
          </Text>
        </View>
      ))}
    </View>
  )
}
