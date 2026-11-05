import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  // SwiftShader WebGL and several live engines make heavy tests run near
  // 45 s under full-suite load.
  timeout: 90000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BENCH_URL || 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.autoplay.default': 0,
            'media.autoplay.block-webaudio': false,
          },
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.BENCH_URL || 'http://127.0.0.1:5175',
    reuseExistingServer: process.env.BENCH_STORAGE_E2E !== '1',
    timeout: 30000,
  },
})
