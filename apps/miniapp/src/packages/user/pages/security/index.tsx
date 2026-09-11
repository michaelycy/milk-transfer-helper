import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Button, Cell, Checkbox } from '@taroify/core';
import { useAuth } from '../../../../store/auth';
import { UsersService, type UserProfile } from '../../../../services/users.service';
import { AccountService } from '../../../../services/account.service';
import { toastError } from '../../../../utils/error';
import '../shared.scss';

/** 账号与安全（FR-H7/V2-20）：手机号快捷绑定（单独同意）+ 注销账号；手机号一律脱敏展示 */
export default function Security() {
  const { isWechat, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (!isWechat) return;
    let cancelled = false;
    void UsersService.getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isWechat]);

  const openBindSheet = () => {
    setConsent(false);
    setSheetOpen(true);
  };

  const handleGetPhoneNumber = (e: { detail: { code?: string; errMsg?: string } }) => {
    const { code, errMsg } = e.detail;
    // 用户拒绝授权或获取 code 失败：静默关闭弹层，不打断使用
    if (!consent || errMsg !== 'getPhoneNumber:ok' || !code) {
      setSheetOpen(false);
      return;
    }
    setBinding(true);
    void AccountService.bindPhone(code)
      .then(({ phone_masked }) => {
        setProfile((prev) => (prev ? { ...prev, phone_masked } : prev));
        setSheetOpen(false);
        Taro.showToast({ title: '绑定成功', icon: 'success' });
      })
      .catch((err) => toastError(err, '绑定失败，请稍后重试'))
      .finally(() => setBinding(false));
  };

  const unbindPhone = () => {
    void Taro.showModal({
      title: '解绑手机号',
      content: '解绑后将无法通过手机号找回账号，确定解绑吗？',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return;
        void AccountService.unbindPhone()
          .then(() => {
            setProfile((prev) => (prev ? { ...prev, phone_masked: null } : prev));
            Taro.showToast({ title: '已解绑', icon: 'success' });
          })
          .catch((err) => toastError(err, '解绑失败'));
      },
    });
  };

  const handlePhoneCell = () => {
    if (!isWechat) {
      void Taro.showModal({
        title: '游客模式',
        content: '绑定手机号需先升级微信登录，是否前往？',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) Taro.navigateTo({ url: '/pages/login/index' });
        },
      });
      return;
    }
    if (profile?.phone_masked) {
      void Taro.showActionSheet({
        itemList: ['换绑手机号', '解绑手机号'],
        success: (res) => {
          if (res.tapIndex === 0) openBindSheet();
          if (res.tapIndex === 1) unbindPhone();
        },
      }).catch(() => undefined);
      return;
    }
    openBindSheet();
  };

  const deactivate = () => {
    void Taro.showModal({
      title: '注销账号',
      content:
        '注销将级联删除全部数据（宝宝档案、喂养/症状/体重记录、转奶计划等），操作不可恢复。确定注销吗？',
      confirmText: '确认注销',
      confirmColor: '#EE0A24',
      success: (res) => {
        if (!res.confirm) return;
        void AccountService.deactivate()
          .then(() => logout())
          .then(() => {
            Taro.showToast({ title: '账号已注销', icon: 'none' });
            setTimeout(() => Taro.reLaunch({ url: '/pages/login/index' }), 600);
          })
          .catch((err) => toastError(err, '注销失败'));
      },
    });
  };

  const phoneExtra = isWechat ? profile?.phone_masked || '未绑定' : '游客不可绑定';

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>账号与安全</Text>
      </View>

      <View className='menu-card'>
        <Cell.Group>
          <Cell title='微信账号' extra={isWechat ? profile?.nickname || '微信用户' : '游客'} />
          <Cell title='手机号' extra={phoneExtra} isLink clickable onClick={() => handlePhoneCell()} />
        </Cell.Group>
      </View>

      <View className='card note-card'>
        <Text className='sec-title'>手机号用于做什么</Text>
        <Text className='para'>
          手机号仅用于账号安全与找回：后端加密存储，任何页面只显示脱敏号码（如 138****5678），
          不用于营销触达。绑定/换绑前需单独同意并留痕；解绑后密文与指纹同步清除。
        </Text>
      </View>

      <View className='menu-card'>
        <Cell title='注销账号' titleClass='danger-title' clickable onClick={() => deactivate()} />
      </View>

      {sheetOpen && (
        <View className='sheet-mask' onClick={() => !binding && setSheetOpen(false)}>
          <View className='sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='sheet-title'>{profile?.phone_masked ? '换绑手机号' : '绑定手机号'}</Text>
            <View className='consent-row'>
              <Checkbox checked={consent} onChange={(checked) => setConsent(checked)}>
                <Text className='consent-text'>我同意将手机号用于账号安全与找回（政策版本 2026-09）</Text>
              </Checkbox>
            </View>
            <Button
              className='sheet-btn'
              variant='contained'
              color='primary'
              openType='getPhoneNumber'
              disabled={!consent || binding}
              onGetPhoneNumber={handleGetPhoneNumber}
            >
              {binding ? '绑定中…' : '微信手机号快捷绑定'}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
