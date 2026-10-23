import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const url = 'http://127.0.0.1:5173';
const out = '/home/user/bridgescope/qa/video';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: out, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.locator('.metric-card').first().waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Start Evidence Tour' }).click();
await page.locator('.tour-canvas canvas').waitFor({ state: 'attached', timeout: 10000 });
await page.waitForTimeout(45500);
await page.close();
await context.close();
await browser.close();

const outputs = readdirSync(out).filter(name => name.endsWith('.webm'));
if (!outputs.length) throw new Error('No tour recording was produced.');
const newest = outputs.map(name => join(out, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const finalPath = join(out, 'bridgescope-evidence-tour.webm');
if (basename(newest) !== basename(finalPath)) renameSync(newest, finalPath);
console.log(finalPath);
