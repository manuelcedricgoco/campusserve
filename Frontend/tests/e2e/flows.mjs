// Browser checks against a LOCAL stack only (backend on :4000 with the dev HS256 secret, `vite` on :5173 with
// VITE_DEV_AUTH=true, test database seeded by Database/tests/build_test_db.sh). Never point at production.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { SignJWT } = await import(new URL('../../../Backend/node_modules/jose/dist/webapi/index.js', import.meta.url).href);
const tok = (n) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(`a0000000-0000-4000-8000-0000000000${n}`).setAudience('authenticated').setIssuer('http://localhost:54321/auth/v1').setExpirationTime('1h').sign(new TextEncoder().encode('test-only-jwt-secret-that-is-at-least-32-chars'));
const b = await chromium.launch();
const results = [];
let pages = [];
const step = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); for (const [i, p] of pages.entries()) await p.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/fail-${results.length}-${i}.png` }).catch(() => {}); } };
async function as(n, w = 390) {
  const ctx = await b.newContext({ viewport: { width: w, height: 860 } });
  await ctx.addInitScript((t) => { sessionStorage.setItem('campusserve.splashShown', '1'); localStorage.setItem('campusserve.devToken', t); }, await tok(n));
  const p = await ctx.newPage(); pages.push(p); return p;
}
const go = (p, path) => p.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' });

// Student books a queue slot through the UI.
const s = await as('23');
await step('student books a queue slot and sees the ticket', async () => {
  await go(s, '/student/queue');
  await s.getByRole('tab', { name: 'Book a slot' }).click();
  await s.getByLabel('Service').selectOption({ label: 'Guidance Office: Counseling appointment' });
  await s.locator('button:has-text("left")').first().click();
  await s.getByRole('button', { name: 'Reserve', exact: true }).click();
  await s.waitForURL(/\/student\/queue\/[0-9a-f-]{36}/);
  await s.getByText('Queue number').first().waitFor();
  await s.getByText(/Reserved\. Your number is \d+/).first().waitFor();
  await s.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/flow-ticket.png`, fullPage: true });
});
await step('student sends a request; validation blocks an empty purpose', async () => {
  await go(s, '/student/requests');
  await s.getByRole('button', { name: 'New request' }).first().click();
  await s.getByRole('button', { name: 'Send request' }).click();
  await s.getByText('Choose what you are requesting.').first().waitFor();
  await s.getByLabel('What do you need?').selectOption({ index: 1 });
  await s.getByLabel('Purpose').fill('Certificate of enrollment for a scholarship');
  await s.getByRole('button', { name: 'Send request' }).click();
  await s.waitForURL(/\/student\/requests\/[0-9a-f-]{36}/);
  await s.getByText(/Request REQ-\d+ sent/).first().waitFor();
});

// Admin enables the payment provider for the sandbox, SSG reports + verifies + assesses, student pays.
const admin = await as('01', 1280);
await step('admin edits the provider setting (with warning shown)', async () => {
  await go(admin, '/admin/config');
  await admin.getByRole('tab', { name: 'System settings' }).click();
  await admin.getByRole('row', { name: /payments\.enabled_providers/ }).getByRole('button', { name: 'Edit' }).click();
  await admin.getByText('Enable a provider only after real integration').first().waitFor();
  await admin.getByLabel('Value (JSON)').fill('["gcash"]');
  await admin.getByRole('button', { name: 'Save setting' }).click();
  await admin.getByText('Setting saved').first().waitFor();
});
const gov = await as('11', 1280);
await step('SSG governor reports, verifies and assesses a violation', async () => {
  await go(gov, '/org/violations');
  await gov.getByRole('button', { name: 'Report a violation' }).click();
  await gov.getByLabel('Policy').selectOption({ label: 'SSG: Event violation' }).catch(async () => gov.getByLabel('Policy').selectOption({ index: 1 }));
  await gov.locator('#student-search').fill('BEED');
  await gov.getByRole('button', { name: /Sample Student BEED/ }).click();
  await gov.getByLabel('What happened').fill('Absent at the General Assembly');
  await gov.getByRole('button', { name: 'Report violation' }).click();
  await gov.getByText('Violation reported. It counts only after review.').first().waitFor();
  await gov.getByRole('row', { name: /Sample Student BEED/ }).getByRole('button', { name: 'Verify' }).first().click();
  await gov.getByRole('dialog').getByRole('button', { name: 'Verify' }).click();
  await gov.getByText('Review saved').first().waitFor();
  await go(gov, '/org/penalties');
  await gov.getByRole('button', { name: 'Assess a penalty' }).click();
  await gov.getByLabel('Policy').selectOption({ index: 1 });
  await gov.locator('#student-search').fill('BEED');
  await gov.getByRole('button', { name: /Sample Student BEED/ }).click();
  await gov.getByRole('dialog').getByRole('button', { name: 'Assess' }).click();
  await gov.getByText(/Assessed: [0-9.]+ h or/).first().waitFor();
});
await step('student chooses payment and completes the sandbox checkout; penalty still waits for verification', async () => {
  await go(s, '/student/penalties');
  await s.getByRole('button', { name: /SSG/ }).first().click();
  await s.getByRole('button', { name: /^Pay ₱/ }).click();
  await s.getByRole('dialog').getByRole('button', { name: 'Confirm choice' }).click();
  await s.getByText('Test mode').first().waitFor();
  await s.getByRole('button', { name: /with GCash/ }).click();
  await s.waitForURL(/sandbox=1/);
  await s.getByText('Simulated checkout (development only)').waitFor();
  await s.getByRole('button', { name: 'Simulate a successful payment' }).click();
  await s.getByText('Test payment recorded').first().waitFor();
  await s.getByText('Waiting', { exact: true }).locator('visible=true').first().waitFor();
  await s.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/flow-payment.png`, fullPage: true });
});
const tr = await as('12', 1280);
await step('SSG treasurer verifies the payment; the penalty resolves', async () => {
  await go(tr, '/org/payments');
  await tr.getByRole('row', { name: /Sample Student BEED/ }).getByRole('button', { name: 'Verify' }).click();
  await tr.getByRole('dialog').getByRole('button', { name: 'Verify payment' }).click();
  await tr.getByText('Decision saved').first().waitFor();
  await go(s, '/student/penalties');
  await s.getByText('Resolved').locator('visible=true').first().waitFor();
});
await step('student cannot open the admin workspace', async () => {
  await go(s, '/admin/users');
  await s.getByText('This area is not part of your account').first().waitFor();
});
await b.close();
console.log(results.join('\n'));
