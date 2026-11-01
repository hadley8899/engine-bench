import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export function Chart({
  title,
  labels,
  data,
  height = 180,
}: {
  title: string
  labels: string[]
  data: number[][]
  height?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<uPlot | null>(null)
  useEffect(() => {
    const element = host.current!
    chart.current = new uPlot(
      {
        width: element.clientWidth || 400,
        height,
        title,
        scales: { x: { time: false } },
        axes: [
          { stroke: '#97aab4', grid: { stroke: '#25343e' } },
          { stroke: '#97aab4', grid: { stroke: '#25343e' } },
        ],
        series: [
          { label: labels[0] },
          ...labels
            .slice(1)
            .map((label, i) => ({
              label,
              stroke: ['#f5b35d', '#63c5d7', '#b0a0e4'][i % 3],
              width: 2,
              spanGaps: true,
            })),
        ],
        legend: { show: true },
        cursor: { drag: { x: true, y: false } },
      },
      [[], ...labels.slice(1).map(() => [])] as uPlot.AlignedData,
      element,
    )
    const resize = new ResizeObserver(() =>
      chart.current?.setSize({ width: element.clientWidth || 400, height }),
    )
    resize.observe(element)
    return () => {
      resize.disconnect()
      chart.current?.destroy()
      chart.current = null
    }
  }, [title, height, labels])
  useEffect(() => {
    chart.current?.setData(data as uPlot.AlignedData)
  }, [data])
  return (
    <div className="bench-chart" role="img" aria-label={title} ref={host} />
  )
}
