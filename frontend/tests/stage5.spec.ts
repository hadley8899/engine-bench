import { expect, test } from '@playwright/test'
import { openMode, openSection } from './layout'
import type { Page } from '@playwright/test'

// Stage 5: sound controls, limiter cut, quick fixes, road load and shortcuts.
// Real Web Audio and workers, as in bench.spec.ts.
const rpm = async (page: Page) =>
  Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, ''))
async function startEngine(page: Page) {
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page)).toBeGreaterThan(500)
}
async function choose(page: Page, field: string, option: string) {
  await page.getByRole('combobox', { name: field }).click()
  await page.getByRole('option', { name: option }).click()
}

test('a spark-cut limiter and straight pipe afterfire; a fuel cut shows LIMITER CUT', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openSection(page, 'Exhaust')
  await choose(page, 'Silencer', 'Straight-through (no silencer)')
  await page.getByRole('switch', { name: 'Catalytic converter' }).uncheck()
  await choose(page, 'Rev limiter cuts', 'Spark (ignition cut)')
  await expect(page.getByText('Fuel keeps flowing unburned')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await openMode(page, 'Bench')
  await startEngine(page)
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect(page.getByTestId('fuel')).toContainText('SPARK CUT', {
    timeout: 10000,
  })
  // The header has to heat before unburned fuel can light.
  await expect(page.getByTestId('afterfire')).toBeVisible({ timeout: 20000 })
  await page.keyboard.up('Space')

  await openSection(page, 'Exhaust')
  await choose(page, 'Rev limiter cuts', 'Fuel (injection stops)')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await startEngine(page)
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect(page.getByTestId('fuel')).toContainText('LIMITER CUT', {
    timeout: 10000,
  })
  await page.keyboard.up('Space')
  expect(errors).toEqual([])
})

test('a quick test leaves the engine idling, then protects the baseline', async ({
  page,
}) => {
  await page.goto('/')
  await startEngine(page)
  await openMode(page, 'Dyno')
  await page.getByLabel('End RPM', { exact: true }).fill('2500')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE')
  // The engine kept running through the calculation.
  expect(await rpm(page)).toBeGreaterThan(500)
  await expect(page.getByRole('combobox', { name: 'Capture in' })).toHaveText(
    'Modified',
  )
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('vs Baseline')
  // Modified now holds a run; another test asks before replacing it.
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace the Modified run?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('band-power')).toContainText(
    'covers 1,5',
  )
  await page.getByLabel('Band from (RPM)').fill('1600')
  await page.getByLabel('to (RPM)').fill('2400')
  await page.getByLabel('to (RPM)').press('Enter')
  await expect(page.getByTestId('band-power')).toContainText('vs Baseline')
})

test('road load launches a car, changes gear and shows road speed', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await startEngine(page)
  await page
    .getByRole('switch', { name: /Road load/ })
    .check()
  await expect(page.getByTestId('gear')).toHaveText('1')
  await expect(page.getByRole('slider', { name: /Dyno load/ })).toBeDisabled()
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect
    .poll(async () =>
      Number((await page.getByTestId('road-speed').innerText()).replace(/[^\d]/g, '')),
    )
    .toBeGreaterThan(20)
  await page.keyboard.press('e')
  await expect(page.getByTestId('gear')).toHaveText('2')
  await page.keyboard.up('Space')
  await page.keyboard.press('n')
  await expect(page.getByTestId('gear')).toHaveText('N')
  expect(errors).toEqual([])
})

test('shortcuts, listening position and units are discoverable and remembered', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toContainText('Change up (road load)')
  await help.getByRole('button', { name: 'Close' }).click()
  await expect(help).toBeHidden()
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('v')
  await expect(page.getByRole('combobox', { name: /Listen from/ })).toHaveText(
    'Engine bay',
  )
  // Typing in a field must not trigger shortcuts.
  await openSection(page, 'Starting build')
  await page.getByLabel('Build name').fill('vvv')
  await expect(page.getByRole('combobox', { name: /Listen from/ })).toHaveText(
    'Engine bay',
  )
  await choose(page, 'Power', 'hp')
  await openMode(page, 'Bench')
  await expect(page.locator('.stats-strip').first()).toContainText('hp')
  await page.reload()
  await expect(page.getByRole('combobox', { name: /Listen from/ })).toHaveText(
    'Engine bay',
  )
  await expect(page.getByRole('combobox', { name: 'Power' })).toHaveText('hp')
  await startEngine(page)
})

test('every starting build loads and runs on the bench', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  for (const name of ['Turbo hot hatch', 'Torquey long-stroke', 'Screaming 9k']) {
    await page.getByRole('button', { name, exact: true }).click()
    await startEngine(page)
  }
  await expect(page.getByLabel('Build name')).toHaveValue('Workshop 1.8 • 9k')
  expect(errors).toEqual([])
})
