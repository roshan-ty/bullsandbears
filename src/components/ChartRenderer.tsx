import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useEffect, useState } from 'react'
import type { EChartsReactProps } from 'echarts-for-react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, CandlestickChart, ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, CandlestickChart, ScatterChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

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
    return { ...value, nameTextStyle: { color: palette.muted, ...value.nameTextStyle as object }, axisLabel: { color: palette.muted, fontFamily: 'Satoshi, Inter Variable, sans-serif', ...value.axisLabel as object },
      axisLine: { ...value.axisLine as object, lineStyle: { color: palette.line } },
      splitLine: { ...value.splitLine as object, lineStyle: { color: palette.line, opacity: .6, ...(value.splitLine as { lineStyle?: object })?.lineStyle } } }
  }
  const option = { ...props.option, textStyle: { ...props.option?.textStyle, fontFamily: 'Satoshi, Inter Variable, sans-serif', color: palette.soft },
    xAxis: styleAxes(props.option?.xAxis), yAxis: styleAxes(props.option?.yAxis),
    tooltip: { ...props.option?.tooltip, confine: true, backgroundColor: palette.panel, borderColor: palette.line, textStyle: { color: palette.soft, fontFamily: 'Satoshi, Inter Variable, sans-serif', fontSize: 12 } },
    ...(props.option?.legend ? { legend: { ...props.option.legend, textStyle: { ...props.option.legend.textStyle, color: palette.muted, fontFamily: 'Satoshi, Inter Variable, sans-serif' } } } : {}) }
  return <ReactEChartsCore {...props} option={option} echarts={echarts} />
}
