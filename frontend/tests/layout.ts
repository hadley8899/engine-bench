import type { Page } from '@playwright/test'

/** Open a bench mode tab: Bench, Workshop, Maps, Dyno or Library. */
export async function openMode(page: Page, name: string) {
  await page
    .getByRole('tablist', { name: 'Bench modes' })
    .getByRole('tab', { name: new RegExp(`^${name}`) })
    .click()
}

/** Open a workshop section, for example 'Camshaft' or 'Parts and limits'. */
export async function openSection(page: Page, name: string) {
  await openMode(page, 'Workshop')
  await page
    .getByRole('tablist', { name: 'Workshop sections' })
    .getByRole('tab', { name: new RegExp(`^${name}`) })
    .click()
}

/** Open a telemetry tab on the bench. */
export async function openTelemetry(page: Page, name: string) {
  await openMode(page, 'Bench')
  await page
    .getByRole('tablist', { name: 'Telemetry' })
    .getByRole('tab', { name: new RegExp(`^${name}`) })
    .click()
}
