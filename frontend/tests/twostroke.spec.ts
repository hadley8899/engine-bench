import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openMode, openSection, openTelemetry } from './layout'

// Stage 10: two-stroke engines through the workshop, cutaway, sound and dyno.
const rpm = async (page: Page) =>
  Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, ''))
async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole('combobox', { name: field }).click()
  await page.getByRole('option', { name: option }).click()
}

test('a two-stroke single runs, shows its ports and pipe, and pulls on the dyno', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: '125 race two-stroke', exact: true }).click()
  await expect(page.getByTestId('command-bar')).toContainText('125 cc')
  await expect(page.getByTestId('command-bar')).toContainText('two-stroke single')
  // Camshaft and forced induction give way to ports and pipe.
  const sections = page.getByRole('tablist', { name: 'Workshop sections' })
  await expect(sections.getByRole('tab', { name: /^Camshaft/ })).toHaveCount(0)
  await expect(sections.getByRole('tab', { name: /^Forced induction/ })).toHaveCount(0)
  await openSection(page, 'Ports and pipe')
  const timing = page.getByTestId('port-timing')
  await expect(timing).toContainText('83° ATDC · 193°')
  await expect(page.getByTestId('tuned-rpm')).toContainText('RPM')
  // A higher exhaust port opens earlier: the derived timing follows.
  await page.getByLabel('Top edge below deck (mm)').first().fill('25.5')
  await expect(timing).toContainText('79° ATDC')
  await expect(page.getByTestId('pending-edits')).toHaveText('1 unapplied change')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()

  // The cutaway and scavenging readouts.
  await openTelemetry(page, 'Engine data')
  await expect(page.getByTestId('engine-view')).toContainText('TWO-STROKE SINGLE')
  await expect(page.getByTestId('engine-view').locator('canvas')).toHaveCount(1)
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page), { timeout: 20000 }).toBeGreaterThan(800)
  await expect(page.getByTestId('scavenging')).toContainText('DELIVERY RATIO')
  await page.getByRole('slider', { name: /Throttle/ }).focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp')
  await expect.poll(() => rpm(page), { timeout: 20000 }).toBeGreaterThan(4000)
  await page.getByTestId('engine-view').screenshot({ path: 'test-results/two-stroke-cutaway.png' })
  await page.getByRole('button', { name: 'Overview camera view' }).click()
  await page.getByTestId('engine-view').screenshot({ path: 'test-results/two-stroke-overview.png' })
  await page.getByRole('slider', { name: /Throttle/ }).press('Home')

  await openMode(page, 'Dyno')
  await page.getByLabel('Start RPM', { exact: true }).fill('5000')
  await page.getByLabel('End RPM', { exact: true }).fill('12000')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', { timeout: 60000 })
  expect(errors).toEqual([])
})

test('a four-stroke becomes a two-stroke twin and back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openSection(page, 'Geometry')
  await choose(page, /^Cycle and layout/, 'Two-stroke twin, 180° crank')
  await expect(page.getByLabel('Intake effective area (mm²)')).toHaveCount(0)
  await openSection(page, 'Ports and pipe')
  await expect(page.getByTestId('two-stroke-editor')).toBeVisible()
  await choose(page, /^Intake control/, 'Rotary disc valve')
  await expect(page.getByTestId('port-timing')).toContainText('130° BTDC to 70° ATDC')
  await choose(page, /^Pipe/, 'Straight pipe')
  await expect(page.getByTestId('tuned-rpm')).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByTestId('command-bar')).toContainText('two-stroke twin, 180°')
  await expect(page.getByTestId('command-bar')).toContainText('disc valve')
  await openMode(page, 'Bench')
  await expect(page.getByRole('button', { name: 'Inspect cylinder 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inspect cylinder 3' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page), { timeout: 20000 }).toBeGreaterThan(500)
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  // Back to the inline-four: its valves and camshaft return.
  await openSection(page, 'Geometry')
  await choose(page, /^Cycle and layout/, 'Four-stroke inline-four')
  await page.getByRole('button', { name: 'Show 10 advanced parameters' }).click()
  await expect(page.getByLabel('Intake effective area (mm²)')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByTestId('command-bar')).toContainText('I4')
  expect(errors).toEqual([])
})
