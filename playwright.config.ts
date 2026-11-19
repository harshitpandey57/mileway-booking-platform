import {defineConfig,devices} from '@playwright/test';
import {randomBytes} from 'node:crypto';
process.env.E2E_SEED_PASSWORD ||= 'Mw-'+randomBytes(16).toString('hex');
const url='http://127.0.0.1:'+(process.env.E2E_PORT || '4137');
export default defineConfig({
 testDir:'./tests/e2e', workers:1, timeout:90000, reporter:'list',
 use:{baseURL:url,trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'node scripts/e2e-server.mjs',url:url+'/api/health',reuseExistingServer:false,timeout:120000}
});
