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
