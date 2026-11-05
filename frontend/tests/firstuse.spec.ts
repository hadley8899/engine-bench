import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openMode, openSection } from './layout'

const rpm = async (page: Page) =>
  Number((await page.getByTestId('rpm').innerText()).replace(/[^\d]/g, ''))

// Stage 9: the bench reorganised by task. Real audio and workers.
test('a first-time path: start, change a build, test and compare from visible labels', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  // Start from the command bar and rev it from the Drive panel.
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page)).toBeGreaterThan(500)
  await expect(page.getByTestId('engine-status')).toHaveText('RUNNING')
  // Baseline on the Dyno tab.
  await openMode(page, 'Dyno')
  await page.getByLabel('End RPM', { exact: true }).fill('3000')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('COMPLETE')
  // Change one thing in the workshop: the pending marker and chip appear.
  await openSection(page, 'Geometry')
  await page.getByLabel('Compression ratio (:1)', { exact: true }).fill('11.5')
  await expect(page.getByTestId('pending-edits')).toHaveText('1 unapplied change')
  await expect(
    page
      .getByRole('tablist', { name: 'Workshop sections' })
      .getByRole('tab', { name: /^Geometry/ })
      .getByLabel('unapplied changes'),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await expect(page.getByTestId('pending-edits')).toHaveCount(0)
  // Modified run and the comparison.
  await openMode(page, 'Dyno')
  await page.getByRole('button', { name: 'Quick test', exact: true }).click()
  await expect(page.getByTestId('run-summary')).toContainText('vs Baseline')
  await expect(page.locator('.comparison-notes')).toContainText('Compression')
  expect(errors).toEqual([])
})

test('status messages appear on every tab and take you to the fix', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page)).toBeGreaterThan(500)
  await openSection(page, 'Parts')
  // Messages never move the page: the strip keeps one line's height.
  const tabsAt = () =>
    page
      .getByRole('tablist', { name: 'Bench modes' })
      .evaluate((e) => e.getBoundingClientRect().top + window.scrollY)
  const before = await tabsAt()
  await page.getByRole('slider', { name: /Throttle/ }).focus()
  await page.keyboard.press('End')
  await expect(page.getByTestId('status-limiter')).toContainText(
    'Rev limiter cycling',
    { timeout: 15000 },
  )
  expect(await tabsAt()).toBe(before)
  // The full messages open over the page.
  await page.getByTestId('status-strip').getByRole('button', { name: /Details|more/ }).click()
  await expect(page.getByRole('dialog', { name: 'Engine messages' })).toContainText('Rev limiter cycling')
  await page.keyboard.press('Escape')
  await page.getByRole('slider', { name: /Throttle/ }).press('Home')
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  // A starter too weak to turn the engine sends you to the setting.
  await openSection(page, 'Geometry')
  await page.getByLabel('Starter torque (Nm)', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Stop & rebuild engine' }).click()
  await openMode(page, 'Dyno')
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  const starter = page.getByTestId('status-starter')
  await expect(starter).toContainText("can't turn this engine over", {
    timeout: 15000,
  })
  await starter.getByRole('button', { name: 'Open geometry' }).click()
  await expect(page.getByLabel('Starter torque (Nm)', { exact: true })).toBeVisible()
})

test('tabs switch by keyboard, the gamepad drives from any tab, and controls are named', async ({
  page,
}) => {
  test.setTimeout(120000)
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
  const modes = page.getByRole('tablist', { name: 'Bench modes' })
  // Single-key shortcuts and arrow keys on the focused tab list.
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('w')
  await expect(modes.getByRole('tab', { name: /^Workshop/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await modes.getByRole('tab', { name: /^Workshop/ }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(modes.getByRole('tab', { name: /^Maps/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // The gamepad still drives the throttle away from the bench tab.
  await page.getByRole('button', { name: 'Start engine', exact: true }).click()
  await expect.poll(() => rpm(page)).toBeGreaterThan(500)
  await page.evaluate(() => {
    ;(window as unknown as { benchTestTrigger: number }).benchTestTrigger = 0.6
  })
  await expect(page.getByRole('slider', { name: /Throttle/ })).toHaveValue('60')
  await page.evaluate(() => {
    ;(window as unknown as { benchTestTrigger: number }).benchTestTrigger = 0
  })
  await page.getByRole('button', { name: 'Emergency stop' }).click()
  // Every visible control on every tab and workshop section has a name.
  const unnamed = async () =>
    page.evaluate(() => {
      const nameOf = (el: Element) => {
        const label = el.getAttribute('aria-label')
        if (label) return label
        const by = el.getAttribute('aria-labelledby')
        if (by)
          return by
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        const id = el.getAttribute('id')
        const forLabel = id && document.querySelector(`label[for="${id}"]`)
        if (forLabel) return forLabel.textContent
        if (el.closest('label')) return el.closest('label')!.textContent
        return el.textContent || el.getAttribute('title') || ''
      }
      return [
        ...document.querySelectorAll(
          'button, input:not([type=hidden]), [role=combobox], [role=switch], [role=tab], [role=slider], a[href]',
        ),
      ]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => !el.closest('[aria-hidden="true"]'))
        .filter((el) => !nameOf(el).trim())
        .map((el) => el.outerHTML.slice(0, 120))
    })
  for (const mode of ['Bench', 'Maps', 'Dyno', 'Library']) {
    await openMode(page, mode)
    expect(await unnamed(), mode).toEqual([])
  }
  for (const section of [
    'Starting build',
    'Geometry',
    'Fuel system',
    'Camshaft',
    'Combustion',
    'Forced induction',
    'Exhaust',
    'Parts',
    'Test cell',
  ]) {
    await openSection(page, section)
    expect(await unnamed(), section).toEqual([])
  }
})

test('on a phone the Drive panel leads with throttle and opens for the rest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const drive = page.getByRole('complementary', { name: 'Drive' })
  await expect(drive.locator('#throttle-label')).toBeInViewport()
  await expect(drive.getByRole('slider', { name: /Dyno load/ })).toBeHidden()
  await drive.getByRole('button', { name: 'More drive controls' }).click()
  await expect(drive.getByRole('slider', { name: /Dyno load/ })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
})

test('an out-of-range cam value blocks the rebuild instead of breaking the page', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openSection(page, 'Starting build')
  await page.getByRole('button', { name: 'Honda Civic Type R FD2 K20A' }).click()
  await openSection(page, 'Camshaft')
  await page.getByLabel('Switch speed (RPM)').fill('500')
  await expect(page.getByText(/Can't rebuild until.*Camshaft/).first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Stop & rebuild engine' }),
  ).toBeDisabled()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByLabel('Switch speed (RPM)').fill('5200')
  await expect(page.getByText(/Can't rebuild until/)).toHaveCount(0)
  expect(errors).toEqual([])
})
