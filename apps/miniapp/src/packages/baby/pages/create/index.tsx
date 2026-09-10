import { useState } from 'react'
import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@taroify/core'
import { BabyService } from '../../../../services/baby.service'
import { track } from '../../../../services/analytics.service'
import { useBaby } from '../../../../store/baby'
import { calcAge } from '../../../../utils/baby'

/** 宝宝建档（FR-A1 / V2-13）：昵称/出生日期/性别 + 隐私单独同意（不收集照片） */
export default function BabyCreate() {
  const { setCurrentBaby } = useBaby()
  const [nickname, setNickname] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'unknown'>('unknown')
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)

  const ageText = birthDate ? calcAge(birthDate)?.text : null

  const submit = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先同意隐私政策', icon: 'none' })
      return
    }
    if (!birthDate) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const baby = await BabyService.create({
        nickname: nickname.trim() || '宝宝',
        birth_date: birthDate,
        gender,
      })
      setCurrentBaby(baby)
      track('baby_created', {})
      Taro.showToast({ title: '建档完成', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (error) {
      Taro.showToast({ title: '建档失败，请重试', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='baby-create'>
      <View className='baby-create__logo'>
        <View className='baby-create__logo-ic'>
          <Text>🍼</Text>
        </View>
        <Text className='baby-create__logo-name'>转奶日记</Text>
      </View>

      <Text className='baby-create__h'>创建宝宝档案</Text>
      <Text className='baby-create__sub'>建档后即可记录喂养、打卡并创建转奶计划</Text>

      <View className='baby-create__form'>
        <View className='baby-create__row'>
          <Text className='baby-create__label'>昵称</Text>
          <Input
            placeholder='宝宝昵称'
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
          />
        </View>
        <View className='baby-create__hair' />
        <View className='baby-create__row'>
          <Text className='baby-create__label'>出生日期</Text>
          <Picker mode='date' value={birthDate} onChange={(e) => setBirthDate(e.detail.value)}>
            <Text className={`baby-create__picker ${birthDate ? '' : 'is-placeholder'}`}>
              {birthDate || '请选择'}
            </Text>
          </Picker>
        </View>
        <View className='baby-create__hair' />
        <View className='baby-create__row'>
          <Text className='baby-create__label'>性别</Text>
          <View
            className={`baby-create__gender ${gender === 'male' ? 'is-on' : ''}`}
            onClick={() => setGender('male')}
          >
            <Text>男宝</Text>
          </View>
          <View
            className={`baby-create__gender ${gender === 'female' ? 'is-on' : ''}`}
            onClick={() => setGender('female')}
          >
            <Text>女宝</Text>
          </View>
        </View>
      </View>

      {ageText && <Text className='baby-create__age'>月龄：{ageText}（自动计算）</Text>}

      <View className='baby-create__privacy'>
        <View className='baby-create__privacy-row' onClick={() => setAgreed(!agreed)}>
          <View className={`baby-create__check ${agreed ? 'is-on' : ''}`}>
            {agreed && <Text>✓</Text>}
          </View>
          <Text className='baby-create__privacy-t1'>已阅读并同意《隐私政策》</Text>
        </View>
        <Text className='baby-create__privacy-t2'>
          仅收集昵称、出生日期、性别；不收集宝宝照片。撤销同意可注销并删除全部数据。
        </Text>
      </View>

      <View className='baby-create__footer'>
        <Button color='primary' shape='round' block loading={saving} onClick={() => void submit()}>
          完成建档
        </Button>
      </View>
    </View>
  )
}
