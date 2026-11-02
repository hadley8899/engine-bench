import type { Run, Sample } from '../sim/schema'

/** Samples at peak power and peak torque, or null for an empty run. */
export function peaks(run: Run) {
  if (!run.samples.length) return null
  let power: Sample = run.samples[0]
  let torque: Sample = run.samples[0]
  for (const s of run.samples) {
    if (s.power > power.power) power = s
    if (s.torque > torque.torque) torque = s
  }
  return { power, torque }
}

/**
 * Mean power (kW) between two speeds: the trapezoidal area under the
 * power curve divided by the band width. Null unless the run covers the band.
 */
export function bandPower(run: Run, [from, to]: [number, number]) {
  const samples = [...run.samples].sort((a, b) => a.rpm - b.rpm)
  if (
    to <= from ||
    samples.length < 2 ||
    samples[0].rpm > from + 50 ||
    samples.at(-1)!.rpm < to - 50
  )
    return null
  const at = (rpm: number) => {
    const i = samples.findIndex((s) => s.rpm >= rpm)
    if (i <= 0) return samples[i < 0 ? samples.length - 1 : 0].power
    const a = samples[i - 1]
    const b = samples[i]
    return a.power + ((b.power - a.power) * (rpm - a.rpm)) / (b.rpm - a.rpm)
  }
  const points = [
    { rpm: from, power: at(from) },
    ...samples.filter((s) => s.rpm > from && s.rpm < to),
    { rpm: to, power: at(to) },
  ]
  let area = 0
  for (let i = 1; i < points.length; i++)
    area +=
      ((points[i].power + points[i - 1].power) / 2) *
      (points[i].rpm - points[i - 1].rpm)
  return area / (to - from)
}

/**
 * Where a run knocked, from samples recorded by model 1.6.0 or later: the
 * RPM range with a knock index of 1 or more, the closest approach and the
 * most ECU retard. Null for runs without knock data.
 */
export function knockSummary(run: Run) {
  const samples = run.samples.filter((s) => s.knock !== undefined)
  if (!samples.length) return null
  const knocking = samples.filter((s) => s.knock! >= 1)
  const worst = samples.reduce((a, b) => (b.knock! > a.knock! ? b : a))
  return {
    from: knocking.length ? Math.min(...knocking.map((s) => s.rpm)) : null,
    to: knocking.length ? Math.max(...knocking.map((s) => s.rpm)) : null,
    worst: { rpm: worst.rpm, index: worst.knock! },
    retard: Math.max(...samples.map((s) => s.retard ?? 0)),
  }
}
