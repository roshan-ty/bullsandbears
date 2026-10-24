import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useEffect, useState } from 'react'
import type { EChartsReactProps } from 'echarts-for-react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

export default function ChartRenderer(props: Omit<EChartsReactProps, 'echarts'>) {
  const readPalette = () => {
    const styles = getComputedStyle(document.documentElement)
    return Object.fromEntries(['muted', 'soft', 'panel', 'line'].map((name) => [name, styles.getPropertyValue(`--${name}`).trim()]))
  }
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  const styleAxes = (value: Record<string, unknown> | Record<string, unknown>[] | undefined): unknown => {
    if (!value) return value
    if (Array.isArray(value)) return value.map((axis) => styleAxes(axis))
    return { ...value, axisLabel: { ...value.axisLabel as object, color: palette.muted, fontFamily: 'Inter Variable' },
      axisLine: { ...value.axisLine as object, lineStyle: { color: palette.line } },
      splitLine: { ...value.splitLine as object, lineStyle: { color: palette.line, opacity: .6 } } }
  }
  const option = { ...props.option, textStyle: { ...props.option?.textStyle, fontFamily: 'Inter Variable', color: palette.soft },
    xAxis: styleAxes(props.option?.xAxis), yAxis: styleAxes(props.option?.yAxis),
    tooltip: { ...props.option?.tooltip, confine: true, backgroundColor: palette.panel, borderColor: palette.line, textStyle: { color: palette.soft, fontFamily: 'Inter Variable', fontSize: 12 } },
    ...(props.option?.legend ? { legend: { ...props.option.legend, textStyle: { ...props.option.legend.textStyle, color: palette.muted, fontFamily: 'Inter Variable' } } } : {}) }
  return <ReactEChartsCore {...props} option={option} echarts={echarts} />
}
