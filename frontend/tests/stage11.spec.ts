import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openMode, openSection } from './layout'

async function choose(page: Page, option: string) {
  await page.getByRole('combobox', { name: /^Cycle and layout/ }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('Stage 11 four-stroke layouts rebuild with matching summaries and cutaways', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Geometry')
  for (const [option, summary, cutaway, cylinders] of [
    ['Four-stroke inline-six', 'I6 · 1–5–3–6–2–4', 'INLINE SIX', 6],
    ['Four-stroke V6', 'V6 · 1–4–2–5–3–6', 'V6', 6],
    ['Four-stroke cross-plane V8', 'V8 · 1–8–4–3–6–5–7–2', 'CROSS-PLANE V8', 8],
    ['Four-stroke boxer-four', 'boxer-4 · 1–3–2–4', 'BOXER FOUR', 4],
  ] as const) {
    await choose(page, option)
    await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
    await expect(page.getByTestId('command-bar')).toContainText(summary)
    await openMode(page, 'Bench')
    await expect(page.getByTestId('engine-view')).toContainText(cutaway)
    await expect(page.getByRole('button', { name: new RegExp(`Inspect cylinder ${cylinders}$`) })).toBeVisible()
    await expect(page.getByRole('button', { name: `Inspect cylinder ${cylinders + 1}` })).toHaveCount(0)
    await openSection(page, 'Geometry')
  }
  expect(errors).toEqual([])
})

test('Stage 11 V8 and 90 degree V-twin run through the bench and dyno', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'GM LS3 6.2 V8', exact: true }).click()
  await expect(page.getByTestId('command-bar')).toContainText('V8 · 1–8–4–3–6–5–7–2')
  await openMode(page, 'Bench')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(async () => Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')), { timeout: 20000 }).toBeGreaterThan(500)
  await openMode(page, 'Dyno')
  await page.getByLabel('Start RPM', { exact: true }).fill('2000')
  await page.getByLabel('End RPM', { exact: true }).fill('6000')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE', { timeout: 60000 })

  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'Aprilia RS250', exact: true }).click()
  await expect(page.getByTestId('command-bar')).toContainText('two-stroke V-twin, 90°')
  await openMode(page, 'Bench')
  await expect(page.getByTestId('engine-view')).toContainText('90° V-TWIN')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(async () => Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, '')), { timeout: 20000 }).toBeGreaterThan(500)
  expect(errors).toEqual([])
})
