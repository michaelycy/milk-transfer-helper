import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Button } from '@taroify/core';
import { useAuth } from '../../../../store/auth';
import { useBaby } from '../../../../store/baby';
import {
  FamilyService,
  type FamilyInvite,
  type FamilyMember,
} from '../../../../services/family.service';
import { track } from '../../../../services/analytics.service';
import { toastError } from '../../../../utils/error';
import { formatDateTime } from '../../../../utils/date';
import type { BabyRow } from '../../../../types';
import '../shared.scss';

const MEMBER_CAP = 5;

const ROLE_LABEL: Record<FamilyMember['role'], string> = {
  owner: '创建者',
  editor: '可编辑',
  viewer: '只读',
};

/** 家庭共享管理（FR-H3/V2-19）：成员名册、邀请/撤销、角色调整、移除与退出 */
export default function Family() {
  const { isWechat } = useAuth();
  const { babies, loading: babiesLoading, reload: reloadBabies } = useBaby();
  const [babyId, setBabyId] = useState<string | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [membersFailed, setMembersFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [activeInvite, setActiveInvite] = useState<FamilyInvite | null>(null);
  const [creating, setCreating] = useState(false);

  const baby: BabyRow | null = babies.find((b) => b.id === babyId) ?? babies[0] ?? null;
  const me = members.find((m) => m.is_self) ?? null;
  const isOwner = me?.role === 'owner';

  useEffect(() => {
    if (!isWechat || babiesLoading) return;
    if (babyId && babies.some((b) => b.id === babyId)) return;
    setBabyId(babies[0]?.id ?? null);
  }, [isWechat, babiesLoading, babies, babyId]);

  const loadMembers = useCallback(async () => {
    if (!baby) return;
    setMembersFailed(false);
    try {
      const list = await FamilyService.listMembers(baby.id);
      setMembers(list);
      if (list.find((m) => m.is_self)?.role === 'owner') {
        setInvites(await FamilyService.listInvites(baby.id));
      } else {
        setInvites([]);
      }
    } catch (error) {
      setMembersFailed(true);
      toastError(error, '获取成员失败');
    }
  }, [baby]);

  useEffect(() => {
    if (!isWechat || !baby) return;
    void loadMembers();
  }, [isWechat, baby, loadMembers]);

  useShareAppMessage(() => {
    if (baby && activeInvite) {
      return {
        title: `邀请你加入「${baby.nickname || '宝宝'}」的共享档案`,
        path: `/packages/user/pages/family-accept/index?code=${activeInvite.invite_code}`,
      };
    }
    return { title: '转奶日记 · 一起记录宝宝的转奶期', path: '/pages/index/index' };
  });

  const createInvite = () => {
    if (!baby || creating) return;
    setCreating(true);
    void FamilyService.createInvite(baby.id, inviteRole)
      .then((invite) => {
        setActiveInvite(invite);
        setInvites((prev) => [invite, ...prev]);
        track('family_invite_created', { role: inviteRole });
      })
      .catch((err) => toastError(err, '邀请生成失败'))
      .finally(() => setCreating(false));
  };

  const revokeInvite = (invite: FamilyInvite) => {
    void Taro.showModal({
      title: '撤销邀请',
      content: `撤销后短码 ${invite.invite_code} 立即失效，确定撤销吗？`,
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return;
        void FamilyService.revokeInvite(invite.id)
          .then(() => {
            setInvites((prev) => prev.filter((it) => it.id !== invite.id));
            if (activeInvite?.id === invite.id) setActiveInvite(null);
            Taro.showToast({ title: '已撤销', icon: 'none' });
          })
          .catch((err) => toastError(err, '撤销失败'));
      },
    });
  };

  const manageMember = (member: FamilyMember) => {
    if (!isOwner || member.role === 'owner') return;
    const nextRole = member.role === 'editor' ? 'viewer' : 'editor';
    const roleLabel = nextRole === 'editor' ? '设为可编辑' : '设为只读';
    void Taro.showActionSheet({
      itemList: [roleLabel, '移除成员'],
      success: (res) => {
        if (!baby) return;
        if (res.tapIndex === 0) {
          void FamilyService.updateRole(baby.id, member.id, nextRole)
            .then(() => void loadMembers())
            .catch((err) => toastError(err, '调整失败'));
        }
        if (res.tapIndex === 1) {
          void Taro.showModal({
            title: '移除成员',
            content: `移除后「${member.nickname || '家庭成员'}」将立即失去访问；其历史记录保留在宝宝时间线。`,
            confirmColor: '#FF6B35',
            success: (m) => {
              if (!m.confirm) return;
              void FamilyService.removeMember(baby.id, member.id)
                .then(() => void loadMembers())
                .catch((err) => toastError(err, '移除失败'));
            },
          });
        }
      },
    }).catch(() => undefined);
  };

  const leaveFamily = () => {
    if (!baby || !me) return;
    void Taro.showModal({
      title: '退出共享',
      content: '退出后你将立即失去该宝宝的数据访问；你的历史记录保留在宝宝时间线。',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return;
        void FamilyService.removeMember(baby.id, me.id)
          .then(() => reloadBabies())
          .then(() => {
            setMembers([]);
            setBabyId(null);
            Taro.showToast({ title: '已退出共享', icon: 'none' });
          })
          .catch((err) => toastError(err, '退出失败'));
      },
    });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setActiveInvite(null);
  };

  const pendingInvites = invites.filter((it) => it.status === 'pending');

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>家庭共享</Text>
      </View>

      {!isWechat && (
        <View className='card'>
          <Text className='para'>
            游客模式不能发起或加入家庭共享。请先升级微信登录（数据将无损迁移到正式账号）。
          </Text>
          <Button
            className='primary-btn'
            variant='contained'
            color='primary'
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
          >
            去登录
          </Button>
        </View>
      )}

      {isWechat && !babiesLoading && !baby && (
        <View className='card'>
          <Text className='para'>还没有宝宝档案。先创建宝宝档案，再邀请家人共同记录吧。</Text>
          <Button
            className='primary-btn'
            variant='contained'
            color='primary'
            onClick={() => Taro.navigateTo({ url: '/packages/baby/pages/create/index' })}
          >
            去建档
          </Button>
        </View>
      )}

      {isWechat && baby && (
        <View>
          {babies.length > 1 && (
            <View className='baby-tabs'>
              {babies.map((b) => (
                <Text
                  key={b.id}
                  className={`baby-tab${b.id === baby.id ? ' baby-tab-active' : ''}`}
                  onClick={() => {
                    setBabyId(b.id);
                    setActiveInvite(null);
                  }}
                >
                  {b.nickname || '宝宝'}
                </Text>
              ))}
            </View>
          )}

          <View className='card baby-card'>
            <Text className='baby-name'>{baby.nickname || '宝宝'}</Text>
            <Text className='hint'>
              我的角色：{me ? ROLE_LABEL[me.role] : '…'} · 成员 {members.length}/{MEMBER_CAP}（记录与计划共享，收藏等个人数据各自独立）
            </Text>
          </View>

          {membersFailed && (
            <Text className='empty' onClick={() => void loadMembers()}>
              成员加载失败，轻触重试
            </Text>
          )}
          {!membersFailed && !me && !members.length && <Text className='empty'>成员加载中…</Text>}

          {!!members.length && (
            <View className='card member-list'>
              {members.map((m) => (
                <View className='member-row' key={m.id}>
                  <View className='member-avatar'>
                    {m.avatar ? (
                      <Image className='avatar-img' src={m.avatar} mode='aspectFill' />
                    ) : (
                      <Text className='avatar-placeholder'>{(m.nickname || '家').slice(0, 1)}</Text>
                    )}
                  </View>
                  <View className='member-col'>
                    <View className='member-nick-row'>
                      <Text className='member-nick'>{m.nickname || '家庭成员'}</Text>
                      {m.is_self && <Text className='tag tag-gray'>我</Text>}
                    </View>
                    <Text className='member-joined'>{formatDateTime(m.joined_at)} 加入</Text>
                  </View>
                  <Text className={`tag ${m.role === 'owner' ? 'tag-green' : 'tag-gray'}`}>
                    {ROLE_LABEL[m.role]}
                  </Text>
                  {isOwner && m.role !== 'owner' && (
                    <Text className='member-manage' onClick={() => manageMember(m)}>
                      管理
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {isOwner && (
            <View className='card'>
              <Text className='sec-title'>待处理的邀请（{pendingInvites.length}）</Text>
              {!pendingInvites.length && <Text className='hint'>暂无待接受邀请。邀请短码 24 小时有效且仅可使用一次。</Text>}
              {pendingInvites.map((it) => (
                <View className='invite-row' key={it.id}>
                  <View className='invite-col'>
                    <Text className='invite-code'>{it.invite_code}</Text>
                    <Text className='hint'>
                      {it.role === 'editor' ? '可编辑' : '只读'} · {formatDateTime(it.expires_at)} 前有效
                    </Text>
                  </View>
                  <Text className='invite-revoke' onClick={() => revokeInvite(it)}>
                    撤销
                  </Text>
                </View>
              ))}
              <Button
                className='primary-btn'
                variant='contained'
                color='primary'
                onClick={() => {
                  setActiveInvite(null);
                  setSheetOpen(true);
                }}
              >
                邀请成员
              </Button>
            </View>
          )}

          {me && !isOwner && (
            <Button className='primary-btn leave-btn' variant='outlined' color='danger' onClick={() => leaveFamily()}>
              退出共享
            </Button>
          )}
        </View>
      )}

      {sheetOpen && (
        <View className='sheet-mask' onClick={() => closeSheet()}>
          <View className='sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='sheet-title'>邀请成员加入「{baby?.nickname || '宝宝'}」</Text>
            {!activeInvite ? (
              <>
                <View className='seg'>
                  <Text
                    className={`seg-item${inviteRole === 'editor' ? ' seg-active' : ''}`}
                    onClick={() => setInviteRole('editor')}
                  >
                    可编辑（记录/计划）
                  </Text>
                  <Text
                    className={`seg-item${inviteRole === 'viewer' ? ' seg-active' : ''}`}
                    onClick={() => setInviteRole('viewer')}
                  >
                    只读
                  </Text>
                </View>
                <Button
                  className='sheet-btn'
                  variant='contained'
                  color='primary'
                  disabled={creating}
                  onClick={() => createInvite()}
                >
                  {creating ? '生成中…' : '生成一次性邀请短码'}
                </Button>
                <Text className='sheet-note'>短码 24 小时有效、仅可使用一次；家人需为微信登录账号</Text>
              </>
            ) : (
              <>
                <View className='code-card'>
                  <Text className='code-val'>{activeInvite.invite_code}</Text>
                  <Text className='code-exp'>{formatDateTime(activeInvite.expires_at)} 前有效 · 仅可使用一次</Text>
                </View>
                <Button className='sheet-btn' variant='contained' color='primary' openType='share'>
                  微信分享给家人
                </Button>
                <Button className='sheet-btn' variant='outlined' color='primary' onClick={() => closeSheet()}>
                  完成
                </Button>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
