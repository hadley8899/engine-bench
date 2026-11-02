/**
 * Renders fixed bench scenarios to 48 kHz mono WAV files for listening
 * checks: `npm run sounds -- <output directory>`. The engine core is
 * advanced exactly as on the live bench; nothing is recorded or sampled.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EngineCore } from '../src/sim/core'
import type { Controls } from '../src/sim/core'
import type { Listener } from '../src/sim/acoustics'
import {
  exhaustDefaults,
  inductionDefaults,
  normalConditions,
  roadEngine,
  sportEngine,
} from '../src/sim/schema'
import type { EngineDefinition } from '../src/sim/schema'
import { starterBuilds } from '../src/bench/builds'
type Step = { at: number; controls: Partial<Controls> }

const out = process.argv[2] ?? 'sounds'
mkdirSync(out, { recursive: true })

/** Throttle blips, a free rev onto the limiter and a lift-off coast. */
const freeRev: Step[] = [
  { at: 0, controls: { ignition: true, starter: true } },
  { at: 1.2, controls: { starter: false } },
  { at: 3, controls: { throttle: 0.5 } },
  { at: 3.25, controls: { throttle: 0 } },
  { at: 4.5, controls: { throttle: 1 } },
  { at: 6, controls: { throttle: 0 } },
  { at: 8, controls: { ignition: false } },
  { at: 9, controls: { ignition: true } },
]
/** A full-throttle dyno sweep from 2,000 to 6,200 RPM, then lift-off. */
const pull: Step[] = [
  { at: 0, controls: { ignition: true, starter: true } },
  { at: 1.2, controls: { starter: false } },
  ...Array.from({ length: 121 }, (_, i) => ({
    at: 2 + i * 0.05,
    controls: { throttle: 1, holdRpm: 2000 + i * 35 },
  })),
  { at: 8.1, controls: { throttle: 0, holdRpm: null } },
]

/** Build boost at 5,000 RPM, lift off, repeat: the blow-off valve. */
const blowOff: Step[] = [
  { at: 0, controls: { ignition: true, starter: true } },
  { at: 1.2, controls: { starter: false } },
  { at: 2, controls: { throttle: 1, holdRpm: 5000 } },
  { at: 4.5, controls: { throttle: 0, holdRpm: null } },
  { at: 6.5, controls: { throttle: 1, holdRpm: 5000 } },
  { at: 9, controls: { throttle: 0, holdRpm: null } },
]

function render(
  name: string,
  engine: EngineDefinition,
  steps: Step[],
  seconds: number,
  listener?: Listener,
) {
  const core = new EngineCore(engine, normalConditions)
  if (listener) core.setListener(listener)
  const frames = Math.round(seconds * 48000)
  const pcm = new Int16Array(frames)
  let next = 0
  for (let i = 0; i < frames; i++) {
    while (next < steps.length && steps[next].at * 48000 <= i)
      core.setControls(steps[next++].controls)
    const sample = core.step()
    pcm[i] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(48000, 24)
  header.writeUInt32LE(96000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.byteLength, 40)
  const file = join(out, `${name}.wav`)
  writeFileSync(file, Buffer.concat([header, Buffer.from(pcm.buffer)]))
  console.log(file)
}

const turbo = {
  ...roadEngine,
  compression: 9,
  induction: inductionDefaults.turbo,
}
render('road-free-rev', roadEngine, freeRev, 11)
render('road-pull', roadEngine, pull, 10)
render('sport-free-rev', sportEngine, freeRev, 11)
render('turbo-pull', turbo, pull, 10)
render('turbo-blow-off', turbo, blowOff, 11.5)
for (const build of starterBuilds.slice(2)) {
  const slug = build.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  render(`build-${slug}-free-rev`, build.engine, freeRev, 11)
  render(`build-${slug}-pull`, build.engine, pull, 10)
}
render(
  'road-straight-pipe-free-rev',
  {
    ...roadEngine,
    exhaust: { ...exhaustDefaults, catalyst: false, silencer: 'straight' },
  },
  freeRev,
  11,
)
for (const listener of ['bay', 'cell'] as const)
  render(`road-free-rev-${listener}`, roadEngine, freeRev, 11, listener)
render(
  'turbo-no-blow-off-pull',
  { ...turbo, induction: { ...inductionDefaults.turbo, blowOff: false } },
  pull,
  10,
)
