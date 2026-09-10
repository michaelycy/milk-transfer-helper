import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArticleService } from '../../services/article.service'
import { formatReadCount, formatRelativeTime } from '../../utils/format'
import type { ArticleRow } from '../../types'
import './index.scss'

/** 分类标签配色（V2-16/V2-17：转奶指南橙 · 奶粉知识蓝 · 常见问题绿，未登记分类走灰底） */
const CATEGORY_CLASS: Record<string, string> = {
  转奶指南: 'is-guide',
  奶粉知识: 'is-milk',
  常见问题: 'is-faq',
}

const RECOMMEND_LIMIT = 2

/**
 * 首页推荐文章（V2-16）：游客未建档态保留的可浏览模块。
 * 取最新 2 篇；articles 表暂无封面字段，缩略图用品牌占位图代替；
 * 拉取失败静默隐藏，不打断建档引导主流程。
 */
export function RecommendedArticles() {
  const [articles, setArticles] = useState<ArticleRow[]>([])

  useEffect(() => {
    let cancelled = false
    ArticleService.getArticles({ limit: RECOMMEND_LIMIT })
      .then((data) => {
        if (!cancelled) setArticles(data)
      })
      .catch(() => {
        if (!cancelled) setArticles([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (articles.length === 0) return null

  const openArticle = (id: string) => {
    Taro.navigateTo({ url: `/packages/article/pages/detail/index?id=${id}` })
  }

  return (
    <View className='rec-articles'>
      <Text className='rec-articles__title'>推荐文章</Text>
      <View className='rec-articles__card'>
        {articles.map((article) => (
          <View
            key={article.id}
            className='rec-articles__item'
            onClick={() => openArticle(article.id)}
          >
            <View className='rec-articles__thumb'>
              <Text>🍼</Text>
            </View>
            <View className='rec-articles__body'>
              <Text className='rec-articles__name'>{article.title}</Text>
              <View className='rec-articles__meta'>
                <Text className={`rec-articles__tag ${CATEGORY_CLASS[article.category] ?? ''}`}>
                  {article.category}
                </Text>
                <Text className='rec-articles__count'>
                  {formatReadCount(article.read_count)} 阅读 · {formatRelativeTime(article.created_at)}
                </Text>
              </View>
            </View>
            <Text className='rec-articles__chev'>›</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
