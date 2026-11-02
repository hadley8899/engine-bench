import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Stage 6: fuel grades, knock reporting and ECU knock control.
// MUI names a select by its label and current value.
async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole('combobox', { name: field }).click()
  await page.getByRole('option', { name: option }).click()
}

test('low octane makes the hot hatch knock and the ECU pull timing', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Turbo hot hatch', exact: true }).click()
  await expect(page.getByTestId('knock')).toContainText('RON 98 super')
  await expect(page.getByTestId('knock')).toContainText('Knock control on')
  await choose(page, /^Fuel RON/, 'RON 91 regular')
  await expect(page.getByText('Lowest knock resistance.')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByTestId('knock')).toContainText('RON 91 regular')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  const summary = page.getByTestId('knock-summary')
  await expect(summary).toContainText('Knocked from', { timeout: 30000 })
  await expect(summary).toContainText('The ECU pulled up to')

  // Without protection the knock is still reported, but nothing acts on it.
  await page.getByRole('switch', { name: 'ECU knock control' }).uncheck()
  await expect(page.getByText('Without knock control nothing protects')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByTestId('knock')).toContainText('Unprotected')
  expect(errors).toEqual([])
})

test('engine maps drive the timing, and small injectors run out of fuel', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Road 2.0', exact: true }).click()
  await page.getByRole('switch', { name: 'Use engine-management maps' }).check()
  const maps = page.getByTestId('map-editor')
  await expect(maps).toBeVisible()
  await page.getByRole('button', { name: /Show \d+ advanced parameters/ }).click()
  await expect(page.getByLabel('Ignition advance (° BTDC)')).toBeDisabled()
  // Whole table one degree up, then one cell typed in.
  await maps.getByRole('button', { name: '+1°' }).click()
  // Far from idle, so the idle timing is the whole-table value alone.
  const cell = maps.getByLabel('Ignition advance at 6000 RPM, 100 kPa')
  await cell.fill('25')
  await cell.press('Enter')
  await expect(cell).toHaveValue('25.0')
  await expect(page.getByText('Unapplied changes.')).toBeVisible()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect(page.getByTestId('ecu')).toContainText('TIMING · MAP')
  await expect(page.getByTestId('ecu')).toContainText('21.0')
  await expect(page.getByTestId('map-live')).toContainText('Running at')

  // Starve the engine: tiny injectors cannot keep up at full throttle.
  await page.getByLabel('Injector flow, each (cc/min)').fill('60')
  await page.getByLabel('Injector flow, each (cc/min)').blur()
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect(page.getByTestId('ecu')).toContainText('INJECTOR DUTY')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.down('Space')
  await expect(page.getByTestId('fuel-limited')).toBeVisible({ timeout: 10000 })
  await page.keyboard.up('Space')
  expect(errors).toEqual([])
})
