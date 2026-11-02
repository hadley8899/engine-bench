import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export function Chart({
  title,
  labels,
  data,
  height = 180,
  markPeaks = false,
}: {
  title: string
  labels: string[]
  data: number[][]
  height?: number
  /** Ring each series' highest point. */
  markPeaks?: boolean
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
        hooks: markPeaks ? { draw: [drawPeaks] } : {},
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
  }, [title, height, labels, markPeaks])
  useEffect(() => {
    chart.current?.setData(data as uPlot.AlignedData)
  }, [data])
  return (
    <div className="bench-chart" role="img" aria-label={title} ref={host} />
  )
}

const colours = ['#f5b35d', '#63c5d7', '#b0a0e4']
/** Draws a ring at the maximum of each plotted series. */
function drawPeaks(u: uPlot) {
  const context = u.ctx
  for (let s = 1; s < u.series.length; s++) {
    const values = u.data[s] as (number | null)[]
    let best = -1
    for (let i = 0; i < values.length; i++)
      if (values[i] !== null && (best < 0 || values[i]! > values[best]!)) best = i
    if (best < 0) continue
    const x = u.valToPos(u.data[0][best], 'x', true)
    const y = u.valToPos(values[best]!, 'y', true)
    context.save()
    context.strokeStyle = colours[(s - 1) % 3]
    context.lineWidth = 2 * devicePixelRatio
    context.beginPath()
    context.arc(x, y, 5 * devicePixelRatio, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }
}
