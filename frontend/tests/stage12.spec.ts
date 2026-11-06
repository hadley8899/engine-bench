import { expect, test } from '@playwright/test'
import { openMode, openSection } from './layout'

async function quickTest(page: import('@playwright/test').Page) {
  await openMode(page, 'Dyno')
  await page.getByLabel('Start RPM', { exact: true }).fill('1800')
  await page.getByLabel('End RPM', { exact: true }).fill('2600')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', {
    timeout: 60000,
  })
}

test('Stage 12.1 pressure-wave tuning is explicit and runs through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Exhaust')
  const waves = page.getByRole('switch', {
    name: 'Simulate exhaust pressure waves',
  })
  await expect(waves).toBeChecked()
  await expect(page.getByText(/Primary length, collector layout and valve overlap/)).toBeVisible()

  // Capture the explicitly compatible, pressure-wave-off result first.
  await waves.uncheck()
  await expect(page.getByText(/without changing gas exchange or power/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await quickTest(page)

  // A tuned long tri-Y rebuilds and completes the same worker procedure.
  await openSection(page, 'Exhaust')
  await waves.check()
  await page.getByLabel('Header length (mm)').fill('1500')
  await page.getByRole('combobox', { name: 'Collector' }).click()
  await page.getByRole('option', { name: '4-2-1 (tri-Y)' }).click()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await quickTest(page)
  await expect(page.getByTestId('run-summary')).toContainText('vs Baseline')
  expect(errors).toEqual([])
})

test('Stage 12.2 heated-port K20 completes a low-speed worker pull', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page
    .getByRole('button', { name: 'Honda Civic Type R FD2 K20A', exact: true })
    .click()
  await expect(page.getByTestId('command-bar')).toContainText('K20A')

  await openMode(page, 'Dyno')
  await page.getByLabel('Start RPM', { exact: true }).fill('1500')
  await page.getByLabel('End RPM', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', {
    timeout: 60000,
  })
  expect(errors).toEqual([])
})

test('Stage 12.3 and 12.4 cam motion and valve relief run through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'GM LS3 6.2 V8', exact: true }).click()
  await openSection(page, 'Camshaft')

  await expect(page.getByRole('combobox', { name: 'Valve motion' })).toHaveText(
    'Performance polynomial',
  )
  await expect(page.getByLabel('Effective valve relief (mm)')).toHaveValue('4.7')
  await page.getByRole('combobox', { name: 'Valve motion' }).click()
  await page.getByRole('option', { name: 'Race polynomial' }).click()
  await page.getByLabel('Effective valve relief (mm)').fill('5.0')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()

  await quickTest(page)
  expect(errors).toEqual([])
})

test('Stage 12.5 tuned two-stroke charging runs through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'Yamaha YZ125', exact: true }).click()
  await openSection(page, 'Ports and pipe')

  await expect(page.getByRole('combobox', { name: 'Charging model' })).toHaveText(
    'Tuned racing',
  )
  await expect(page.getByLabel('Auxiliary width (mm)')).toHaveValue('20')
  await page.getByLabel('Auxiliary width (mm)').fill('19')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()

  await openMode(page, 'Dyno')
  await page.getByLabel('Start RPM', { exact: true }).fill('9000')
  await page.getByLabel('End RPM', { exact: true }).fill('12000')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', {
    timeout: 60000,
  })
  expect(errors).toEqual([])
})

test('Stage 12.6 torque-based Golf keeps real boost through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page
    .getByRole('button', { name: 'VW Golf GTI Mk5 2.0 TFSI', exact: true })
    .click()
  await openSection(page, 'Forced induction')
  await expect(page.getByLabel('Boost target (bar)', { exact: true })).toHaveValue(
    '0.9',
  )

  await openMode(page, 'Maps')
  await page.getByRole('tab', { name: 'Torque request' }).click()
  await expect(
    page.getByText(/electronic throttle closes as needed/i),
  ).toBeVisible()

  await quickTest(page)
  expect(errors).toEqual([])
})

test('Stage 12.7 representative turbo maps run through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'Turbo hot hatch', exact: true }).click()
  await openSection(page, 'Forced induction')
  await expect(page.getByRole('combobox', { name: 'Compressor map' })).toHaveText(
    'Representative speed lines',
  )
  await expect(page.getByRole('combobox', { name: 'Turbine map' })).toHaveText(
    'Representative radial map',
  )
  await page.getByRole('combobox', { name: 'Compressor map' }).click()
  await page.getByRole('option', { name: 'Legacy ellipse' }).click()
  await page.getByRole('combobox', { name: 'Turbine map' }).click()
  await page.getByRole('option', { name: 'Legacy nozzle' }).click()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await quickTest(page)
  expect(errors).toEqual([])
})

test('Stage 12.8 Japanese RON 100 combustion runs through the dyno worker', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page
    .getByRole('button', { name: 'Honda Civic Type R FD2 K20A', exact: true })
    .click()
  await openSection(page, 'Combustion')
  await expect(page.getByRole('combobox', { name: 'Fuel' })).toHaveText(
    'RON 100 Japanese premium',
  )
  await quickTest(page)
  expect(errors).toEqual([])
})
