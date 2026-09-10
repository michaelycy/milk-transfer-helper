import { useEffect, useState } from 'react'
import { RichText, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Loading } from '@taroify/core'
import { ArticleService } from '../../../../services/article.service'
import { formatDate } from '../../../../utils/date'
import { toast } from '../../../../utils/error'
import type { ArticleRow } from '../../../../types'
import './index.scss'

export default function ArticleDetail() {
  const router = useRouter()
  const { id } = router.params
  const [article, setArticle] = useState<ArticleRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    const fetchArticle = async () => {
      try {
        const data = await ArticleService.getArticleById(id)
        if (!cancelled) setArticle(data)
        // 阅读计数属统计性质，失败不影响展示
        ArticleService.incrementReadCount(id).catch(() => {})
      } catch (error) {
        if (!cancelled) toast('加载失败，请稍后重试', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchArticle()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <View className='loading-container'>
        <Loading size={30}>加载中...</Loading>
      </View>
    )
  }

  if (!article) {
    return <View className='error-container'>文章不存在</View>
  }

  return (
    <View className='article-detail'>
      <View className='header'>
        <Text className='title'>{article.title}</Text>
        <View className='meta'>
          <Text className='author'>{article.author || '转奶助手'}</Text>
          <Text className='date'>{formatDate(article.created_at)}</Text>
          <Text className='read-count'>阅读 {article.read_count}</Text>
        </View>
      </View>

      <View className='content'>
        <RichText nodes={article.content} />
      </View>
    </View>
  )
}
