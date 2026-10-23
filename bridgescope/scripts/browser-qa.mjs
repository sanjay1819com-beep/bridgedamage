import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = 'http://127.0.0.1:5173';
const out = '/home/user/bridgescope/qa';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
page.on('console', msg => { if (msg.type() === 'error') failures.push(`console: ${msg.text()}`); });
page.on('pageerror', error => failures.push(`page error: ${error.message}`));
const expect = (condition, message) => { if (!condition) failures.push(`assertion: ${message}`); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.locator('.metric-card').first().waitFor({ timeout: 15000 });
await page.waitForFunction(() => !document.querySelector('.loading-workspace'), null, { timeout: 15000 });
await page.locator('.three-host canvas').waitFor({ state: 'attached', timeout: 5000 });
expect(await page.locator('.three-host canvas').count() === 1, '3D canvas should be attached');
expect((await page.locator('.three-host canvas').boundingBox())?.width > 500, '3D canvas should have a usable width');
expect((await page.locator('.metric-card').count()) === 4, 'overview should show four metrics');
await page.screenshot({ path: `${out}/01-overview.png`, fullPage: true });

await page.getByTitle('Inspect zone 3, 10–15 metres').click();
const zoneDetail = await page.locator('.zone-detail').innerText();
expect(zoneDetail.includes('Z03'), '3D fallback/map selection should show Z03');
await page.getByLabel('Toggle mode shape animation').click();
expect((await page.locator('.animation-note').count()) === 1, 'mode animation note should be visible');
await page.getByLabel('Expand bridge view').click();
expect((await page.locator('.bridge-scene.scene-expanded').count()) === 1, 'expanded 3D view should open');
await page.getByLabel('Expand bridge view').click();
expect((await page.locator('.bridge-scene.scene-expanded').count()) === 0, 'expanded 3D view should close');

await page.getByRole('button', { name: /Modal analysis/ }).click();
await page.getByText('Modal property comparison').waitFor();
expect((await page.locator('.modal-table tbody tr').count()) >= 3, 'at least three modal rows should be shown');
await page.getByLabel('Select mode shape').selectOption('2');
await page.screenshot({ path: `${out}/02-modal-analysis.png`, fullPage: true });

await page.getByRole('button', { name: /Signal explorer/ }).click();
await page.locator('.signal-toolbar select').waitFor();
await page.locator('.signal-toolbar select').selectOption('5');
const signalLabel = await page.locator('.plot').first().innerText();
expect(signalLabel.includes('S06'), 'channel selection should update the signal plot');

await page.getByRole('button', { name: /Scenario lab/ }).click();
const card = page.getByRole('button', { name: /A warmer day/ });
const recipeResponse = page.waitForResponse(response => response.url().includes('/api/simulate') && response.ok(), { timeout: 20000 });
await card.click();
await recipeResponse;
await page.getByText('Within tolerance').first().waitFor({ timeout: 10000 });
await page.screenshot({ path: `${out}/03-scenario-lab.png`, fullPage: true });

await page.getByRole('button', { name: /Data & integration/ }).click();
const rows = ['time_s,S01,S02'];
for (let t = 0; t < 4096; t++) {
  rows.push(`${(t / 100).toFixed(2)},${(0.02 * Math.sin(2 * Math.PI * 4.5 * t / 100)).toFixed(7)},${(0.015 * Math.sin(2 * Math.PI * 4.5 * t / 100 + 0.4)).toFixed(7)}`);
}
await page.setInputFiles('input[type="file"]', { name: 'qa-upload.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
await page.getByRole('button', { name: 'Analyze recording' }).click();
await page.getByText('Recording analysis complete').waitFor({ timeout: 15000 });
expect((await page.getByText('DAMAGE NOT ASSESSED').count()) > 0, 'upload should retain its not-assessed boundary');
await page.screenshot({ path: `${out}/04-data-integration.png`, fullPage: true });

await page.getByRole('button', { name: /Methods & validation/ }).click();
const validationResponse = page.waitForResponse(response => response.url().includes('/api/validate') && response.ok(), { timeout: 30000 });
await page.getByRole('button', { name: /Run 12 test cases/ }).click();
await validationResponse;
expect((await page.getByText('/ 8').count()) >= 2, 'validation should expose healthy-case denominators');
expect((await page.getByText('/ 4').count()) >= 2, 'validation should expose damaged-case denominators');
await page.screenshot({ path: `${out}/05-validation.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.metric-card').first().waitFor({ timeout: 15000 });
const widths = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
widths.threshold = 1;
expect(widths.body <= widths.viewport + 1 && widths.root <= widths.viewport + 1, `mobile horizontal overflow: ${JSON.stringify(widths)}`);
await page.getByLabel('Open navigation').click();
expect(await page.locator('aside.sidebar.open').isVisible(), 'mobile navigation should open');
await page.screenshot({ path: `${out}/06-mobile.png`, fullPage: true });
await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Desktop + mobile browser QA passed.');
