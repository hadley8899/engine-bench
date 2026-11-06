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
