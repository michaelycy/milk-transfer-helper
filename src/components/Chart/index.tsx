import React, { useEffect, useRef } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import type { ECharts } from 'echarts/core'
import './index.scss'

// 按需注册：只用折线图 + 网格/提示组件，显著减小小程序包体积
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

interface ChartProps {
  option: EChartsOption
  style?: React.CSSProperties
}

// 小程序 Canvas 的 id 不能含特殊字符，用自增序号保证唯一
let uid = 0

/**
 * 轻量 ECharts 封装：
 * - weapp：Canvas 2D 节点直接交给 echarts.init（官方小程序接入方式）
 * - h5：普通容器 div + echarts.init
 */
export const Chart: React.FC<ChartProps> = ({ option, style }) => {
  const isWeapp = process.env.TARO_ENV === 'weapp'
  const canvasId = useRef(`echarts-canvas-${++uid}`)
  const containerId = useRef(`echarts-container-${uid}`)
  const chartRef = useRef<ECharts | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option

  useEffect(() => {
    let disposed = false

    const applyOption = () => {
      if (!disposed) chartRef.current?.setOption(optionRef.current)
    }

    if (process.env.TARO_ENV === 'weapp') {
      const dpr = Taro.getWindowInfo?.().pixelRatio ?? 2
      Taro.createSelectorQuery()
        .select(`#${canvasId.current}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res?.[0]
          if (disposed || !info?.node) return
          const { node, width, height } = info as {
            node: HTMLCanvasElement
            width: number
            height: number
          }
          node.width = width * dpr
          node.height = height * dpr
          chartRef.current = echarts.init(node, undefined, {
            width,
            height,
            devicePixelRatio: dpr,
          })
          applyOption()
        })
    } else {
      const el = document.getElementById(containerId.current)
      if (el) {
        chartRef.current = echarts.init(el)
        applyOption()
      }
    }

    return () => {
      disposed = true
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  // option 变化时增量更新
  useEffect(() => {
    chartRef.current?.setOption(option)
  }, [option])

  return isWeapp ? (
    <Canvas type='2d' id={canvasId.current} style={style} />
  ) : (
    <View id={containerId.current} style={style} />
  )
}
