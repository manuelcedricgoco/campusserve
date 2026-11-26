// Role-by-role QA through the UI on a LOCAL stack (see flows.mjs header). Run on a freshly built test database.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { SignJWT } = await import(new URL('../../../Backend/node_modules/jose/dist/webapi/index.js', import.meta.url).href);
const WEB = 'http://localhost:5173';
const API = 'http://localhost:4000/api/v1';
const secret = new TextEncoder().encode('test-only-jwt-secret-that-is-at-least-32-chars');
const id = (n) => (n.length > 2 ? n : `a0000000-0000-4000-8000-0000000000${n}`);
const tok = (n) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(id(n)).setAudience('authenticated').setIssuer('http://localhost:54321/auth/v1').setExpirationTime('1h').sign(secret);
const apiAs = async (n, method, path, body) => (await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${await tok(n)}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })).json();
const b = await chromium.launch();
const results = []; const pages = [];
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); for (const [i, p] of pages.entries()) await p.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/roles-fail-${results.length}-${i}.png` }).catch(() => {}); }
};
async function as(n, w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((t) => { sessionStorage.setItem('campusserve.splashShown', '1'); localStorage.setItem('campusserve.devToken', t); }, await tok(n));
  const p = await ctx.newPage(); pages.push(p); return p;
}
const go = (p, path) => p.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
const toast = (p, text) => p.getByText(text).locator('visible=true').first().waitFor();
const pickStudent = async (p, q, name) => { await p.locator('#student-search').fill(q); await p.getByRole('button', { name }).click(); };

const BSIT2 = /Sample Student BSIT 2/;
let clearanceUrl = '';

await step('SAS staff starts a clearance for BSIT 2', async () => {
  const p = await as('04');
  await go(p, '/office/clearance');
  await p.getByRole('button', { name: 'Start a clearance' }).click();
  await pickStudent(p, 'BSIT 2', BSIT2);
  await p.getByRole('dialog').getByRole('button', { name: 'Start clearance' }).click();
  await p.waitForURL(/\/clearances\/[0-9a-f-]{36}/);
  clearanceUrl = new URL(p.url()).pathname;
  await p.getByText('SSG Governor').first().waitFor();
});

await step('class officer remits the SSG fee for BSIT 2 and submits', async () => {
  const p = await as('15');
  await go(p, '/org/remittances');
  await p.getByRole('button', { name: 'New batch' }).click();
  await p.getByLabel('Fee').selectOption({ label: /SSG/ }).catch(async () => { const opts = await p.getByLabel('Fee').locator('option').allTextContents(); await p.getByLabel('Fee').selectOption({ label: opts.find((o) => o.startsWith('SSG')) }); });
  await p.getByLabel(/Total cash/).fill('50');
  await p.getByRole('dialog').getByRole('button', { name: 'Create batch' }).click();
  await toast(p, /Batch .* created/);
  await p.getByRole('link', { name: /^RB-|^REM-|^[A-Z]+-\d+/ }).first().click().catch(async () => { await p.getByRole('link', { name: 'Open' }).first().click(); });
  await p.waitForURL(/\/org\/remittances\/[0-9a-f-]{36}/);
  await pickStudent(p, 'BSIT 2', BSIT2);
  await p.getByRole('button', { name: /Add for/ }).click();
  await toast(p, 'Student added');
  await p.getByRole('button', { name: 'Submit to treasurer' }).click();
  await toast(p, 'Batch submitted to the treasurer');
});

await step('SSG treasurer reviews the batch: received cash, verifies BSIT 2, finishes', async () => {
  const p = await as('12');
  await go(p, '/org/remittances');
  await p.getByRole('row', { name: /Submitted/ }).getByRole('link', { name: 'Open' }).first().click();
  await p.getByLabel(/Cash actually received/).fill('50');
  await p.getByRole('button', { name: 'Start review' }).click();
  await toast(p, 'Review started');
  await p.getByRole('row', { name: BSIT2 }).getByRole('button', { name: 'Verify' }).click();
  await toast(p, 'Saved');
  await p.getByRole('button', { name: 'Finish review' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Finish review' }).click();
  await toast(p, 'Review finished');
});

await step('PADC treasurer records and verifies the department fee for BSIT 2', async () => {
  const p = await as('14');
  await go(p, '/org/receipts');
  await p.getByRole('button', { name: 'Record a receipt' }).click();
  const opts = await p.getByRole('dialog').getByLabel('Fee').locator('option').allTextContents();
  await p.getByRole('dialog').getByLabel('Fee').selectOption({ label: opts.find((o) => o.startsWith('PADC')) });
  await pickStudent(p, 'BSIT 2', BSIT2);
  await p.getByRole('dialog').getByRole('button', { name: 'Record receipt' }).click();
  await toast(p, 'Receipt recorded. It counts once verified.');
  await p.getByRole('row', { name: BSIT2 }).getByRole('button', { name: 'Verify' }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Verify' }).click();
  await toast(p, 'Decision saved');
});

await step('Guidance confirms teacher evaluations and issues the slip', async () => {
  const p = await as('06');
  await go(p, '/office/guidance');
  await pickStudent(p, 'BSIT 2', BSIT2);
  await p.getByRole('button', { name: 'Issue guidance slip' }).click();
  await p.getByText('Not saved').locator('visible=true').first().waitFor(); // evaluations must come first
  await p.getByRole('button', { name: 'Confirm teacher evaluations' }).click();
  await toast(p, 'Teacher evaluations confirmed');
  await p.getByRole('button', { name: 'Issue guidance slip' }).click();
  await toast(p, 'Guidance slip issued');
});

await step('Library validates the ID, checks the receipt, issues the slip', async () => {
  const p = await as('07');
  await go(p, '/office/library');
  await pickStudent(p, 'BSIT 2', BSIT2);
  await p.getByRole('button', { name: 'Validate library ID' }).click();
  await p.getByRole('dialog').getByLabel('Library ID number').fill('LIB-2026-0222');
  await p.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click();
  await toast(p, 'Library ID decision saved');
  await p.getByRole('button', { name: 'Check library receipt' }).click();
  await p.getByRole('dialog').getByLabel('Receipt number').fill('OR-22222');
  await p.getByRole('dialog').getByLabel(/Amount/).fill('20');
  await p.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click();
  await toast(p, 'Library receipt decision saved');
  await p.getByRole('button', { name: 'Issue library slip' }).click();
  await toast(p, 'Library slip issued');
});

for (const [who, label] of [['11', 'SSG Governor'], ['05', 'SAS Head'], ['13', 'PADC Mayor'], ['03', 'Program Head']]) {
  await step(`${label} signs from the clearance signing list`, async () => {
    const p = await as(who);
    await go(p, '/approvals');
    await p.getByRole('row', { name: BSIT2 }).getByRole('link', { name: 'Open' }).click();
    await p.waitForURL(/\/clearances\//);
    await p.getByRole('button', { name: 'Re-check requirements' }).click();
    await toast(p, 'Requirements re-checked');
    await p.getByRole('button', { name: 'Sign', exact: true }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Sign', exact: true }).click();
    await toast(p, 'Signed');
  });
}

await step('BSIT 2 sees the completed clearance with signer names (phone)', async () => {
  const p = await as('22', 390);
  await go(p, '/student/clearance');
  await p.getByText('Clearance complete').waitFor();
  const signed = await p.getByText(/Signed by Sample /).count();
  if (signed < 4) throw new Error(`only ${signed} signer names shown`);
  await p.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/roles-clearance-complete.png`, fullPage: true });
});

await step('Registrar processes a request: review, ready, released; the student is notified', async () => {
  const docSvc = (await (await fetch(`${API}/public/services`)).json()).data.find((s) => s.code === 'DOCUMENT_REQUEST').id;
  const req = (await apiAs('24', 'POST', '/requests', { serviceId: docSvc, purpose: 'Transcript for employment' })).data;
  const p = await as('08');
  await go(p, `/office/requests/${req.id}`);
  for (const action of ['Start review', 'Mark ready for release', 'Mark released']) {
    await p.getByRole('button', { name: action }).first().click();
    await p.getByRole('dialog').getByRole('button', { name: action }).click();
    await p.getByRole('dialog').waitFor({ state: 'detached' });
  }
  await p.getByText('Released').locator('visible=true').first().waitFor();
  const s = await as('24', 390);
  await go(s, '/notifications');
  await s.getByText(/released/i).first().waitFor();
});

await step('Guidance runs the queue board: call next, check in, serve, done', async () => {
  const slots = (await apiAs('24', 'GET', `/queue/services/${(await (await fetch(`${API}/public/services`)).json()).data.find((s) => s.code === 'COUNSELING').id}/slots`)).data;
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const slot = slots.find((s) => s.available > 0 && s.status === 'open' && (s.slot_date > today || s.start_time.slice(0, 5) > now));
  const t = await apiAs('24', 'POST', '/queue/tickets', { slotId: slot.id });
  if (!t.data) throw new Error(`reservation failed: ${JSON.stringify(t)}`);
  const p = await as('06');
  await go(p, `/office/queue`);
  await p.getByLabel('Day').fill(slot.slot_date);
  await p.getByRole('button', { name: 'Check in' }).first().waitFor();
  for (const action of ['Check in', 'Start serving']) { await p.getByRole('button', { name: action }).first().click(); await toast(p, /updated/); }
  await p.getByText('Now serving').waitFor();
  await p.getByRole('button', { name: 'Done' }).first().click();
  await toast(p, /updated/);
});

await step('a new self-registered account waits for activation; the admin activates it', async () => {
  const strangerId = 'd0000000-0000-4000-8000-000000000077';
  const { execSync } = await import('node:child_process');
  execSync(`psql -h /var/tmp/cspg -p 54329 -U postgres -d campusserve_test -qAt -c "insert into auth.users (id, email, raw_user_meta_data) values ('${strangerId}', 'newcomer@campusserve.test', '{\\"full_name\\":\\"New Comer\\"}') on conflict do nothing"`);
  const s = await as(strangerId, 390);
  await go(s, '/home');
  await s.getByText('Your account is not active yet').waitFor();
  const a = await as('01');
  await go(a, '/admin/users');
  await a.getByLabel('Search').fill('newcomer');
  await a.getByText('New Comer').first().click();
  await a.getByRole('button', { name: 'Activate account' }).click();
  await toast(a, 'Account activated');
  await go(s, '/home');
  await s.getByText('Your account is not set up yet').waitFor();
});

await step('keyboard: skip link, dialog open/close with Escape, focus returns', async () => {
  const p = await as('22', 1280);
  await go(p, '/student/requests');
  await p.keyboard.press('Tab');
  const skip = await p.evaluate(() => document.activeElement?.textContent);
  if (skip !== 'Skip to content') throw new Error(`first Tab focused "${skip}"`);
  const btn = p.getByRole('button', { name: 'New request' }).first();
  await btn.focus(); await p.keyboard.press('Enter');
  await p.getByRole('dialog').waitFor();
  const inDialog = await p.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')));
  if (!inDialog) throw new Error('focus did not move into the dialog');
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  const back = await p.evaluate(() => document.activeElement?.textContent);
  if (!back?.includes('New request')) throw new Error(`focus returned to "${back}"`);
});

await b.close();
console.log(results.join('\n'));
