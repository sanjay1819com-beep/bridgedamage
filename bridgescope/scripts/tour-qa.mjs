import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = 'http://127.0.0.1:5173';
const out = '/home/user/bridgescope/qa/tour';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
page.on('console', msg => { if (msg.type() === 'error') failures.push(`console: ${msg.text()}`); });
page.on('pageerror', error => failures.push(`page error: ${error.message}`));
const expect = (condition, message) => { if (!condition) failures.push(`assertion: ${message}`); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.locator('.metric-card').first().waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Start Evidence Tour' }).click();
await page.locator('.tour-canvas canvas').waitFor({ state: 'attached', timeout: 10000 });
await page.locator('.tour-copy h1').waitFor({ timeout: 5000 });
expect(await page.locator('.tour-canvas canvas').count() === 1, 'tour canvas should be attached');
expect((await page.locator('.tour-canvas canvas').boundingBox())?.width > 900, 'tour canvas should fill the presentation viewport');
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/01-structure.png` });

const checkpoints = [
  [/Go to section 2/i, /Twelve synchronized sensors listen\./, '02-observation.png'],
  [/Go to section 3/i, /Temperature and traffic can change the same signal\./, '03-context.png'],
  [/Go to section 4/i, /The unexplained part becomes evidence\./, '04-residual.png'],
  [/Go to section 5/i, /maps to a suspected zone\./, '05-localization.png'],
  [/Go to section 6/i, /not a blind decision\./, '06-decision.png'],
];
for (const [name, heading, file] of checkpoints) {
  await page.getByRole('button', { name }).click();
  await page.getByRole('heading', { name: heading }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1150);
  if (file.includes('localization')) expect((await page.locator('.tour-zone-card').count()) > 0, 'localization stage should show the suspected-zone card');
  if (file.includes('decision')) expect((await page.locator('.tour-endcard').count()) > 0, 'decision stage should complete with an export call to action');
  await page.screenshot({ path: `${out}/${file}` });
}
await page.getByLabel('Close presentation').click();
await page.locator('.presentation-tour').waitFor({ state: 'detached', timeout: 5000 });
await page.locator('.overview-main').waitFor({ timeout: 5000 });
await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Cinematic Evidence Tour QA passed.');
