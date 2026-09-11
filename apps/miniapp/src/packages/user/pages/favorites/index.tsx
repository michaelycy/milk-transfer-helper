import { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ArticleService, type FavoriteItem } from '../../../../services/article.service';
import { toastError } from '../../../../utils/error';
import { formatDate } from '../../../../utils/date';
import '../shared.scss';

/** 我的收藏（FR-H6）：已收藏文章列表，走 favorites 既有数据通道 */
export default function Favorites() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // useDidShow 回刷兜底：从文章页返回时可看到最新收藏状态
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ArticleService.getFavorites();
      // 文章被删或未过审的收藏行不再展示（article 为 null）
      setItems(data.filter((it) => it.article));
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toastError(error, '获取收藏失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  useDidShow(() => {
    setReloadNonce((n) => n + 1);
  });

  const openArticle = (articleId: string) => {
    Taro.navigateTo({ url: `/packages/article/pages/detail/index?id=${articleId}` });
  };

  const removeFavorite = (item: FavoriteItem) => {
    const title = item.article?.title || '该文章';
    void Taro.showModal({
      title: '取消收藏',
      content: `不再收藏「${title}」？`,
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return;
        void ArticleService.removeFavorite(item.article!.id)
          .then(() => {
            setItems((prev) => prev.filter((it) => it.id !== item.id));
            Taro.showToast({ title: '已取消收藏', icon: 'none' });
          })
          .catch((e) => toastError(e, '操作失败，请重试'));
      },
    });
  };

  return (
    <View className='user-page'>
      <View className='page-header'>
        <Text className='page-title'>我的收藏</Text>
      </View>

      {loading && !items.length && <Text className='empty'>加载中…</Text>}

      {!loading && !items.length && (
        <Text className='empty'>{loadFailed ? '加载失败，请稍后重试' : '还没有收藏的文章，去知识页看看吧'}</Text>
      )}

      {!!items.length && (
        <View className='card fav-list'>
          {items.map((item) => (
            <View
              className='fav-item'
              key={item.id}
              onClick={() => openArticle(item.article!.id)}
            >
              <View className='fav-main'>
                <Text className='fav-title'>{item.article!.title}</Text>
                <Text className='fav-meta'>
                  {item.article!.category} · {item.article!.read_count}阅读 · 收藏于 {formatDate(item.created_at)}
                </Text>
              </View>
              <Text
                className='fav-remove'
                onClick={(e) => {
                  e.stopPropagation();
                  removeFavorite(item);
                }}
              >
                取消收藏
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
