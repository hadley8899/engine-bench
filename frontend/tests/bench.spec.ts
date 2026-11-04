import { expect, test } from '@playwright/test'
import type { Telemetry } from '../src/sim/core'
import { EngineCore } from '../src/sim/core'
import { DynoTest } from '../src/sim/dyno'
import {
  defaultProcedure,
  normalConditions,
  roadEngine,
} from '../src/sim/schema'

// Real Web Audio and workers: no simulation, browser or backend mocks.
test('guest starts, uses throttle/ignition and resets without an account', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start engine' })).toBeVisible()
  await page.getByRole('button', { name: 'Start engine' }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(2000)
  await page.keyboard.up('Space')
  await page.getByRole('switch', { name: 'Ignition', exact: true }).uncheck()
  await expect(
    page.getByRole('switch', { name: 'Ignition', exact: true }),
  ).not.toBeChecked()
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  await expect
    .poll(async () => (await page.getByTestId('rpm').innerText()).trim())
    .toBe('0 RPM')
  await expect(page.getByTestId('engine-view').locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
  if (test.info().project.name === 'chromium') {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: '/tmp/engine-bench-desktop.png' })
  }
})

test('quick and live pulls match and baseline survives a rebuild, navigation and reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('End RPM', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE')
  const baseline = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!)
        .baseline,
  )
  expect(baseline.samples.length).toBeGreaterThan(5)
  const node = new DynoTest(roadEngine, normalConditions, {
    ...defaultProcedure,
    endRpm: 2500,
  })
  while (node.run.status === 'running') node.advance(4800)
  expect(baseline.samples.length).toBe(node.run.samples.length)
  baseline.samples.forEach((sample: Record<string, number>, i: number) => {
    for (const key of [
      'rpm',
      'torque',
      'power',
      'time',
      'absorbedTorque',
    ] as const)
      expect(sample[key]).toBeCloseTo(node.run.samples[i][key], 7)
  })
  await page.getByRole('combobox', { name: 'Capture in' }).click()
  await page.getByRole('option', { name: 'Modified', exact: true }).click()
  await page.getByRole('button', { name: 'Live pull', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('RUNNING')
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', {
    timeout: 20000,
  })
  const modified = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!)
        .modified,
  )
  expect(modified.samples.length).toBe(baseline.samples.length)
  modified.samples.forEach((sample: Record<string, number>, i: number) => {
    for (const key of ['rpm', 'torque', 'power', 'time', 'absorbedTorque'])
      expect(sample[key]).toBeCloseTo(baseline.samples[i][key], 7)
  })
  await page.getByLabel('Bore (mm)', { exact: true }).fill('88')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByText('2092 cc')).toBeVisible()
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await page.goBack()
  await page.reload()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('88')
  await page
    .getByRole('button', { name: 'Restore baseline engine & conditions' })
    .click()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('86')
  const saved = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!)
        .baseline,
  )
  expect(saved.samples).toEqual(baseline.samples)
})

test('invalid input is rejected and a live emergency stop retains incomplete data', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Bore (mm)', { exact: true }).fill('400')
  await expect(
    page.getByRole('button', { name: 'Stop & rebuild engine' }),
  ).toBeDisabled()
  await expect(page.getByText('Supported range 20–300 mm')).toBeVisible()
  await expect(
    page
      .getByText("Can't rebuild until these fields are in range: Bore.")
      .first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Road 2.0', exact: true }).click()
  await page.getByRole('button', { name: 'Live pull', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('RUNNING')
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  await expect(page.getByTestId('run-summary')).toContainText('ABORTED')
  const value = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!)
        .baseline,
  )
  expect(value.status).toBe('aborted')
  expect(value.reason).toBe('Emergency stop')
})

test('recipe downloads/imports and portable input validation work', async ({
  page,
}) => {
  await page.goto('/')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download build recipe' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('engine-bench-recipe.json')
  await page.getByLabel('Import recipe file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"other"}'),
  })
  await expect(page.getByRole('alert')).toContainText('Recipe rejected')
  await page.getByLabel('Import recipe file').setInputFiles({
    name: 'good.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'engine-bench/1',
        engine: { ...roadEngine, name: 'Imported test engine', stroke: 0.09 },
        conditions: normalConditions,
      }),
    ),
  })
  await expect(
    page.getByRole('heading', { name: 'Imported test engine' }),
  ).toBeVisible()
})

test('the actual AudioWorklet and Worker produce Node-equivalent states and non-silent audio', async ({
  page,
}) => {
  await page.goto('/')
  const frames = 48000
  const expected = new EngineCore(roadEngine, normalConditions)
  expected.setControls({ ignition: true, starter: true, throttle: 0.5 })
  for (let i = 0; i < frames; i++) expected.step()
  const actual = await page.evaluate(
    async ({ engine, conditions, frames }) => {
      const ctx = new AudioContext({ sampleRate: 48000 })
      const modulePath = '/src/sim/engine.worklet.ts?worker&url'
      const { default: url } = await import(/* @vite-ignore */ modulePath)
      await ctx.audioWorklet.addModule(url)
      const node = new AudioWorkletNode(ctx, 'engine-bench', {
        outputChannelCount: [1],
      })
      const gain = ctx.createGain()
      gain.gain.value = 0
      node.connect(gain).connect(ctx.destination)
      await ctx.resume()
      const worker = new Worker(
        new URL('/src/sim/engine.worker.ts', location.href),
        { type: 'module' },
      )
      const request = {
        type: 'probe',
        engine,
        conditions,
        frames,
        controls: { ignition: true, starter: true, throttle: 0.5 },
      }
      const probe = (port: MessagePort | Worker) =>
        new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Host probe timed out')),
            10000,
          )
          port.onmessage = (event) => {
            if (event.data.type === 'probe') {
              clearTimeout(timeout)
              resolve(event.data.value)
            }
          }
          port.postMessage(request)
        })
      const [worklet, headless] = await Promise.all([
        probe(node.port),
        probe(worker),
      ])
      worker.terminate()
      await ctx.close()
      // Offline rendering exercises the same process callback and produces actual PCM.
      const offline = new OfflineAudioContext(1, 96000, 48000)
      await offline.audioWorklet.addModule(url)
      const source = new AudioWorkletNode(offline, 'engine-bench', {
        outputChannelCount: [1],
        processorOptions: {
          initial: { engine, conditions, throttle: 0.5, autostart: true },
        },
      })
      source.connect(offline.destination)
      const buffer = await offline.startRendering(),
        pcm = buffer.getChannelData(0)
      let energy = 0,
        peak = 0
      for (const sample of pcm) {
        energy += sample * sample
        peak = Math.max(peak, Math.abs(sample))
      }
      return { worklet, headless, energy, peak }
    },
    { engine: roadEngine, conditions: normalConditions, frames },
  )
  for (const [name, value] of Object.entries({
    worklet: actual.worklet,
    worker: actual.headless,
  })) {
    const t = value as Telemetry,
      reference = expected.telemetry()
    const error = {
      host: name,
      rpm: t.rpm - reference.rpm,
      angle: t.angle - reference.angle,
      torque: t.torque - reference.torque,
      maxPressureRelative: Math.max(
        ...t.pressures.map(
          (p, i) =>
            Math.abs(p - reference.pressures[i]) / reference.pressures[i],
        ),
      ),
      maxTraceRelative: Math.max(
        ...t.traces.flatMap((trace, c) =>
          trace.map(
            (p, i) =>
              Math.abs(p - reference.traces[c][i]) /
              Math.max(10000, reference.traces[c][i]),
          ),
        ),
      ),
    }
    console.log('Cross-host agreement', error)
    expect(Math.abs(t.rpm - reference.rpm)).toBeLessThan(0.01)
    expect(Math.abs(t.angle - reference.angle)).toBeLessThan(0.0003)
    expect(Math.abs(t.torque - reference.torque)).toBeLessThan(0.01)
    expect(error.maxPressureRelative).toBeLessThan(1e-4)
    expect(error.maxTraceRelative).toBeLessThan(0.001)
  }
  expect(actual.energy).toBeGreaterThan(1)
  expect(actual.peak).toBeLessThanOrEqual(0.650001)
})

test('bench remains usable on a narrow screen without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start engine' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
})

test('a loaded stall can be restarted and automatically unloads the dyno', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  await page.getByRole('slider', { name: /Dyno load/ }).focus()
  await page.keyboard.press('End')
  await expect(
    page.getByText(
      'Engine stalled. Press Start engine to unload the dyno and restart.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect(page.getByRole('slider', { name: /Dyno load/ })).toHaveValue('0')
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
})

test('a sustained limiter has a stable status and inspection/pressure controls work', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  await page.getByRole('slider', { name: /Throttle/ }).focus()
  await page.keyboard.press('End')
  const message = page.getByText('Rev limiter cycling', { exact: false })
  await expect(message).toBeVisible({ timeout: 15000 })
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(200)
    await expect(message).toBeVisible()
  }
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  await page.getByRole('switch', { name: 'Slow-motion inspection' }).check()
  await expect(
    page.getByText('INSPECTION · 15 RPM · sound muted'),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Inspect cylinder 3', exact: true })
    .click()
  await expect(
    page.getByRole('img', { name: 'Cylinder 3 pressure · latest cycle' }),
  ).toBeVisible()
})

test('steady-state quick tests settle, and unapplied edits survive authentication navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: /^Procedure/ }).click()
  await page
    .getByRole('option', { name: 'Steady-state steps', exact: true })
    .click()
  await page.getByLabel('End RPM', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE')
  const state = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!),
  )
  expect(
    state.baseline.samples.map((s: { rpm: number }) => Math.round(s.rpm)),
  ).toEqual([1500, 2000, 2500])
  await page.getByLabel('Bore (mm)', { exact: true }).fill('89')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('89')
  await expect(
    page.getByText('Unapplied changes.', { exact: false }),
  ).toBeVisible()
})

test('standard gamepad right trigger drives throttle and returns to idle', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { benchTestTrigger: number }
    state.benchTestTrigger = 0
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [
        {
          connected: true,
          buttons: Array.from({ length: 8 }, (_, i) => ({
            value: i === 7 ? state.benchTestTrigger : 0,
          })),
        },
      ],
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  await page.evaluate(() => {
    ;(window as unknown as { benchTestTrigger: number }).benchTestTrigger = 0.6
  })
  await expect(page.getByRole('slider', { name: /Throttle/ })).toHaveValue('60')
  await page.evaluate(() => {
    ;(window as unknown as { benchTestTrigger: number }).benchTestTrigger = 0
  })
  await expect(page.getByRole('slider', { name: /Throttle/ })).toHaveValue('0')
})

test('ignition and a held starter can start a stopped bench directly', async ({
  page,
}) => {
  await page.goto('/')
  const ignition = page.getByRole('switch', { name: 'Ignition', exact: true })
  await ignition.check()
  const starter = page.getByRole('button', {
    name: 'Hold starter',
    exact: true,
  })
  await expect(starter).toBeEnabled()
  await starter.scrollIntoViewIfNeeded()
  const box = await starter.boundingBox()
  if (!box) throw new Error('Starter button was not rendered')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(600)
  await page.mouse.up()
  await expect(
    page.getByRole('button', { name: 'Start engine', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Emergency stop', exact: true })
    .click()
})

test('restoring a previous build leaves new edits rebuildable and testable', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await page.getByLabel('Bore (mm)', { exact: true }).fill('88')
  await page
    .getByRole('button', { name: 'Stop & rebuild engine', exact: true })
    .click()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(600)
  await page
    .getByRole('button', { name: 'Restore previous build', exact: true })
    .click()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('86')
  await expect(page.getByTestId('rpm')).toContainText('0 RPM')
  await page.getByLabel('Bore (mm)', { exact: true }).fill('90')
  await page.getByLabel('Room temperature (°C)', { exact: true }).fill('30')
  await expect(
    page.getByRole('button', { name: 'Stop & rebuild engine', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Stop & rebuild engine', exact: true })
    .click()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('90')
  await page.getByLabel('End RPM', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE')
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('engine-bench:guest-experiment:1')!),
  )
  expect(saved.baseline.engine.bore).toBe(0.09)
  expect(saved.baseline.conditions.temperature).toBe(303.15)
  expect(errors).toEqual([])
})

test('a turbo build rebuilds, spools under throttle and shows boost', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Induction' }).click()
  await page.getByRole('option', { name: 'Turbocharger' }).click()
  await expect(page.getByLabel(/Boost target/)).toHaveValue('0.8')
  await page.getByLabel(/Boost target/).fill('9')
  await expect(page.getByText('Supported range 0–4 bar')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Stop & rebuild engine' }),
  ).toBeDisabled()
  await page.getByLabel(/Boost target/).fill('0.6')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  const boost = page.getByTestId('boost')
  await expect(boost).toContainText('TURBO SPEED')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect
    .poll(async () => {
      const text = await boost.innerText()
      return Number(/BOOST\s+(-?[\d.]+)/.exec(text)?.[1] ?? 0)
    })
    .toBeGreaterThan(0.15)
  await page.keyboard.up('Space')
  expect(errors).toEqual([])
})

test('a carburettor build validates its venturi and runs with mixture shown', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Fuel system' }).click()
  await page.getByRole('option', { name: 'Carburettor' }).click()
  await expect(page.getByLabel(/Venturi \(choke\)/)).toHaveValue('32')
  await page.getByLabel(/Venturi \(choke\)/).fill('5')
  await expect(page.getByText('Supported range 12–70 mm')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Stop & rebuild engine' }),
  ).toBeDisabled()
  await page.getByLabel(/Venturi \(choke\)/).fill('30')
  await expect(page.getByText('CUSTOM I4 · CARB')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  const fuel = page.getByTestId('fuel')
  await expect
    .poll(async () => {
      const text = await fuel.innerText()
      return Number(/λ\s*([\d.]+)/.exec(text)?.[1] ?? 0)
    })
    .toBeGreaterThan(0.9)
  await expect(fuel).toContainText('L/h')
  expect(errors).toEqual([])
})

test('live updates apply edits to the running engine without stopping it', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByLabel('Live updates').check()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  const rpm = async () =>
    Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, ''))
  await expect.poll(rpm).toBeGreaterThan(500)
  await page.getByLabel('Bore (mm)', { exact: true }).fill('92')
  // Applied without a rebuild: the stand shows the new capacity while running.
  await expect(page.getByText('2.29 L')).toBeVisible()
  expect(await rpm()).toBeGreaterThan(500)
  await expect(page.getByText('Engine rebuilt and stopped')).toHaveCount(0)
  // An invalid edit is held back and the engine keeps running unchanged.
  await page.getByLabel('Bore (mm)', { exact: true }).fill('900')
  await expect(page.getByText(/Can't rebuild until/).first()).toBeVisible()
  await expect(page.getByText('2.29 L')).toBeVisible()
  expect(await rpm()).toBeGreaterThan(500)
  // Restore returns to the build before the live edits, still running.
  await page.getByLabel('Bore (mm)', { exact: true }).fill('92')
  await page.getByRole('button', { name: 'Restore previous build' }).click()
  await expect(page.getByText('2.00 L')).toBeVisible()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('86')
  expect(await rpm()).toBeGreaterThan(500)
  // The preference persists across a reload.
  await page.reload()
  await expect(page.getByLabel('Live updates')).toBeChecked()
  expect(errors).toEqual([])
})

test('full reset returns a persisted edited build to a running Road engine', async ({
  page,
}) => {
  const rpm = async () =>
    Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, ''))
  await page.goto('/')
  await page.getByLabel('Bore (mm)', { exact: true }).fill('88')
  await page
    .getByRole('button', { name: 'Stop & rebuild engine', exact: true })
    .click()
  // A reload in the same tab keeps the edited build.
  await page.reload()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('88')
  await page.getByRole('button', { name: 'Start engine' }).click()
  await expect.poll(rpm).toBeGreaterThan(500)
  await page.getByRole('button', { name: 'Full reset' }).click()
  await page.getByRole('button', { name: 'Reset everything' }).click()
  await expect(page.getByLabel('Bore (mm)', { exact: true })).toHaveValue('86')
  await expect.poll(async () => (await page.getByTestId('rpm').innerText()).trim()).toBe('0 RPM')
  await expect(page.getByText('Full reset: the Road build')).toBeVisible()
  // The new audio host starts and revs the engine.
  await page.getByRole('button', { name: 'Start engine' }).click()
  await expect.poll(rpm).toBeGreaterThan(500)
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect.poll(rpm).toBeGreaterThan(2000)
  await page.keyboard.up('Space')
})

test('an overboosted unprotected engine fails, explains why and rebuilds', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Turbo hot hatch' }).click()
  await page.getByLabel('ECU knock control').uncheck()
  await page.getByLabel('Boost target (bar)').fill('1.6')
  await page.getByLabel('Pistons').click()
  await page.getByRole('option', { name: 'Cast' }).click()
  await page
    .getByRole('button', { name: 'Stop & rebuild engine', exact: true })
    .click()
  await expect(page.getByTestId('stress-turboSpeed')).toBeVisible()
  await page.getByRole('button', { name: 'Start engine' }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
  const hold = page.getByLabel('RPM hold (0 = free)')
  await hold.fill('4000')
  await hold.press('Enter')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect(page.getByTestId('failure')).toContainText('Cracked piston', {
    timeout: 20000,
  })
  await page.keyboard.up('Space')
  await page.getByTestId('failure').getByRole('button', { name: 'Rebuild' }).click()
  await expect(page.getByTestId('failure')).toHaveCount(0)
  await expect(page.getByText('Engine rebuilt with new parts')).toBeVisible()
})

test('push it raises timing in the worker and reports each step', async ({
  page,
}) => {
  await page.goto('/')
  const push = page.getByTestId('push')
  await push.getByLabel('Engine speed (RPM)').fill('3000')
  await push.getByLabel('Seconds per step').fill('0.8')
  await push.getByLabel('Step (° advance)').fill('5')
  await push.getByTestId('push-run').click()
  await expect(page.getByTestId('push-result')).not.toHaveText('Pushing…', {
    timeout: 60000,
  })
  await expect(push.locator('.push-results tbody tr')).not.toHaveCount(0)
  await expect(push.locator('.push-results tbody tr').first()).toContainText(
    '20.0° (+0.0)',
  )
})

test('the Golf GTI preset loads as stock, shows its edits and runs', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'VW Golf GTI Mk5 2.0 TFSI' }).click()
  const note = page.getByTestId('real-engine-note')
  await expect(note).toContainText('280 Nm at 1,800–4,700 RPM')
  await expect(note).toContainText('Stock.')
  await expect(page.getByLabel('Boost target (bar)')).toBeVisible()
  await expect(
    page.getByText('Not used: the boost map sets the target while maps are on'),
  ).toBeVisible()
  await page.getByLabel('Pistons').click()
  await page.getByRole('option', { name: 'Forged' }).click()
  await expect(page.getByTestId('stock-changes')).toContainText(
    'Pistons: Cast → Forged',
  )
  await page
    .getByRole('button', { name: 'Stop & rebuild engine', exact: true })
    .click()
  await page.getByRole('button', { name: 'Start engine' }).click()
  await expect
    .poll(async () =>
      Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(500)
})
