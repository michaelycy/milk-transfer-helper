import { useEffect, useState } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Cell, Empty, Search, Tabs } from '@taroify/core'
import { LoginGate } from '../../components/LoginGate'
import { useAuth } from '../../store/auth'
import { ArticleService } from '../../services/article.service'
import { toastError } from '../../utils/error'
import type { ArticleRow } from '../../types'
import './index.scss'

const TAB_LIST = [
  { title: '全部' },
  { title: '转奶指南' },
  { title: '奶粉知识' },
  { title: '常见问题' },
]

const SEARCH_DEBOUNCE_MS = 300

export default function Articles() {
  const { authed } = useAuth()
  const [currentTab, setCurrentTab] = useState(0)
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [searchVal, setSearchVal] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authed) {
      setArticles([])
      setLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(
      async () => {
        setLoading(true)
        try {
          const category = currentTab > 0 ? TAB_LIST[currentTab].title : undefined
          const data = await ArticleService.getArticles({
            category,
            keyword: searchVal.trim() || undefined,
          })
          if (!cancelled) setArticles(data)
        } catch (error) {
          if (!cancelled) toastError(error, '获取文章失败')
        } finally {
          if (!cancelled) setLoading(false)
        }
      },
      searchVal ? SEARCH_DEBOUNCE_MS : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [currentTab, searchVal])

  const handleArticleClick = (id: string) => {
    Taro.navigateTo({ url: `/packages/article/pages/detail/index?id=${id}` })
  }

  const renderArticleList = () => (
    <Cell.Group>
      {articles.map((article) => (
        <Cell
          key={article.id}
          title={article.title}
          brief={`${article.content.substring(0, 30)}...`}
          extra={`${article.read_count}阅读`}
          isLink
          clickable
          onClick={() => handleArticleClick(article.id)}
        />
      ))}
    </Cell.Group>
  )

  return (
    <LoginGate>
    <View className='articles-page'>
      <Search
        value={searchVal}
        placeholder='搜索文章标题'
        onChange={(e) => setSearchVal(e.detail.value)}
      />
      <Tabs value={currentTab} onChange={(value) => setCurrentTab(Number(value))}>
        {TAB_LIST.map((tab) => (
          <Tabs.TabPane key={tab.title} title={tab.title}>
            <View className='tab-content'>
              {articles.length === 0 && !loading ? (
                <Empty>
                  <Empty.Description>暂无相关文章</Empty.Description>
                </Empty>
              ) : (
                renderArticleList()
              )}
            </View>
          </Tabs.TabPane>
        ))}
      </Tabs>
    </View>
    </LoginGate>
  )
}
