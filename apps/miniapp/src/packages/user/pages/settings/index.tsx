import { useEffect, useState } from 'react'
import { Button, Cell, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Avatar } from '@taroify/core'
import { useAuth } from '../../../../store/auth'
import { UsersService, type UserProfile } from '../../../../services/users.service'
import { track } from '../../../../services/analytics.service'
import { toastError } from '../../../../utils/error'
import '../shared.scss'

const NICKNAME_MAX = 20

/** 设置（FR-H6/V2-18）：资料编辑（头像昵称填写能力）+ 隐私中心/账号安全/关于聚合 + 退出登录 */
export default function Settings() {
  const { isWechat, logout } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [nickname, setNickname] = useState('')
  const [savingAvatar, setSavingAvatar] = useState(false)

  useEffect(() => {
    if (!isWechat) return
    let cancelled = false
    void UsersService.getProfile()
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setNickname(p?.nickname ?? '')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isWechat])

  /** 微信官方头像填写能力：临时文件 → base64 → 后端上传并落库；失败保留原头像 */
  const handleChooseAvatar = (e: { detail: { avatarUrl?: string } }) => {
    const tempPath = e.detail.avatarUrl
    if (!tempPath || savingAvatar) return
    if (process.env.TARO_ENV !== 'weapp') {
      Taro.showToast({ title: '请在微信小程序内更换头像', icon: 'none' })
      return
    }
    setSavingAvatar(true)
    try {
      const base64 = Taro.getFileSystemManager().readFileSync(tempPath, 'base64') as string
      void UsersService.uploadAvatar(base64)
        .then((url) => {
          setProfile((prev) => (prev ? { ...prev, avatar: url } : prev))
          Taro.showToast({ title: '头像已更新', icon: 'success' })
          track('profile_updated', { field: 'avatar' })
        })
        .catch((err) => toastError(err, '头像上传失败，已保留原头像'))
        .finally(() => setSavingAvatar(false))
    } catch (error) {
      setSavingAvatar(false)
      toastError(error, '读取图片失败')
    }
  }

  const saveNickname = () => {
    const next = nickname.trim()
    if (!profile || next === (profile.nickname ?? '')) return
    if (!next) {
      setNickname(profile.nickname ?? '')
      return
    }
    void UsersService.updateNickname(next)
      .then(() => {
        setProfile((prev) => (prev ? { ...prev, nickname: next } : prev))
        Taro.showToast({ title: '昵称已保存', icon: 'success' })
        track('profile_updated', { field: 'nickname' })
      })
      .catch((err) => {
        toastError(err, '昵称保存失败')
        setNickname(profile.nickname ?? '')
      })
  }

  const handleLogout = () => {
    void Taro.showModal({
      title: '退出登录',
      content: '退出后将返回登录页；游客模式的数据仅保存在本设备。',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return
        void logout().then(() => Taro.reLaunch({ url: '/pages/login/index' }))
      },
    })
  }

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>设置</Text>
      </View>

      <View className='card profile-card'>
        <View className='avatar-wrap'>
          {isWechat ? (
            <Button
              className='native-btn avatar-btn'
              openType='chooseAvatar'
              disabled={savingAvatar}
              onChooseAvatar={handleChooseAvatar}
            >
              {profile?.avatar ? (
                <image className='avatar-img' src={profile.avatar} mode='aspectFill' />
              ) : (
                <text className='avatar-placeholder'>{profile?.nickname?.slice(0, 1) || '用'}</text>
              )}
            </Button>
          ) : (
            <text className='avatar-placeholder'>客</text>
          )}
        </View>
        <View className='profile-col'>
          {isWechat ? (
            <View className='nick-row'>
              <Input
                className='nick-input'
                type='nickname'
                value={nickname}
                maxlength={NICKNAME_MAX}
                placeholder='填写昵称'
                onInput={(e) => setNickname(e.detail.value)}
                onBlur={() => saveNickname()}
              />
            </View>
          ) : (
            <View className='nick-row'>
              <Text className='nick'>游客</Text>
              <Text className='tag tag-gray'>游客模式</Text>
            </View>
          )}
          <Text className='hint'>
            {isWechat ? '微信登录 · 数据云端同步\n点击头像或昵称可直接修改' : '数据仅保存在本设备\n升级微信登录后数据不丢失'}
          </Text>
          {!isWechat && (
            <Button
              className='upgrade-btn'
              variant='outlined'
              color='primary'
              size='mini'
              onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
            >
              升级微信登录
            </Button>
          )}
        </View>
      </View>

      <View className='menu-card'>
        <Cell.Group>
          <Cell
            title='隐私中心'
            brief='导出我的数据 · 政策说明'
            isLink
            clickable
            onClick={() => Taro.navigateTo({ url: '/packages/user/pages/privacy/index' })}
          />
          <Cell
            title='账号与安全'
            brief='手机号绑定 · 注销账号'
            isLink
            clickable
            onClick={() => Taro.navigateTo({ url: '/packages/user/pages/security/index' })}
          />
          <Cell
            title='关于我们'
            isLink
            clickable
            onClick={() => Taro.navigateTo({ url: '/packages/user/pages/about/index' })}
          />
        </Cell.Group>
      </View>

      <View className='logout-section'>
        <Cell title='退出登录' clickable onClick={() => void handleLogout()} />
      </View>

      <Text className='foot-hint'>头像与昵称遵循微信官方填写能力，无强制授权弹窗</Text>
    </View>
  )
}
