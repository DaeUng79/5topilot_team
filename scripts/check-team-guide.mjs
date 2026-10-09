import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const guidePath = resolve(root, 'docs/TEAM_GUIDE.html');
const output = resolve(root, 'artifacts/team-guide');
await mkdir(output, { recursive: true });
const source = await readFile(guidePath, 'utf8');
assert(!source.includes('\uFFFD'), 'HTML must not contain replacement characters');
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  const network = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) network.push(request.url());
  });
  await page.goto(pathToFileURL(guidePath).href);
  assert.equal(await page.locator('html').getAttribute('lang'), 'ko');
  assert.equal(await page.locator('h1').count(), 1);
  const problems = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    const missing = [...document.querySelectorAll('a[href^="#"]')]
      .map((el) => el.getAttribute('href').slice(1))
      .filter((id) => !document.getElementById(id));
    return { duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index), missing };
  });
  assert.deepEqual(problems, { duplicateIds: [], missing: [] });
  assert(await page.getByRole('heading', { name: 'A. DaeUng79가 할 일 — 팀원 초대' }).isVisible());
  for (const name of ['main-quality', 'main-integrator']) {
    const expected = JSON.parse(await readFile(resolve(root, `docs/github-rulesets/${name}.json`), 'utf8'));
    const embedded = JSON.parse(await page.locator(`#rules-${name}`).textContent());
    assert.deepEqual(embedded, expected, `${name}: embedded and repository JSON must match`);
    assert.equal(expected.enforcement, 'disabled', 'Templates must not be pre-activated');
    const downloadPromise = page.waitForEvent('download');
    await page.locator(`[data-download="${name}"]`).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `${name}.json`);
    await download.saveAs(resolve(output, download.suggestedFilename()));
    assert.deepEqual(JSON.parse(await readFile(resolve(output, download.suggestedFilename()), 'utf8')), expected);
  }
  const noOverflow = async (label) => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`);
  };
  await noOverflow('desktop');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve(output, 'desktop.png') });
  await page.getByRole('heading', { name: 'A. DaeUng79가 할 일 — 팀원 초대' }).evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.screenshot({ path: resolve(output, 'owner-steps.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await noOverflow('mobile');
  await page.screenshot({ path: resolve(output, 'mobile.png') });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  await noOverflow('print');
  assert.equal(await page.locator('nav').isVisible(), false);
  assert.deepEqual(errors, [], 'Browser script errors');
  assert.deepEqual(network, [], 'Guide must load without external requests');
  console.log('Team guide verified: UTF-8, headings, anchors, offline loading, JSON downloads, desktop/mobile/print layout.');
} finally {
  await browser.close();
}
