// Browser checks against a LOCAL stack only (backend on :4000 with the dev HS256 secret, `vite` on :5173 with
// VITE_DEV_AUTH=true, test database seeded by Database/tests/build_test_db.sh). Never point at production.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { SignJWT } = await import(new URL('../../../Backend/node_modules/jose/dist/webapi/index.js', import.meta.url).href);
const secret = new TextEncoder().encode('test-only-jwt-secret-that-is-at-least-32-chars');
const U = { admin: '01', cashier: '02', programHead: '03', sasStaff: '04', sasHead: '05', guidance: '06', library: '07', registrar: '08', ssgGovernor: '11', ssgTreasurer: '12', padcMayor: '13', padcTreasurer: '14', classOfficer: '15', bsit1: '21', bsit2: '22', beed: '23' };
const id = (n) => `a0000000-0000-4000-8000-0000000000${n}`;
const token = (who) => new SignJWT({ role: 'authenticated', aal: 'aal1' }).setProtectedHeader({ alg: 'HS256' }).setSubject(id(U[who])).setAudience('authenticated').setIssuer('http://localhost:54321/auth/v1').setIssuedAt().setExpirationTime('2h').sign(secret);

const pages = [
  [null, '/'], [null, '/sign-in'], [null, '/services'], [null, '/map'], [null, '/ask'],
  ['bsit1', '/student'], ['bsit1', '/student/queue'], ['bsit1', '/student/requests'], ['bsit1', '/student/clearance'], ['bsit1', '/student/penalties'], ['bsit1', '/student/receipts'], ['bsit1', '/student/payments'], ['bsit1', '/assistant'], ['bsit1', '/notifications'], ['bsit1', '/profile'], ['bsit1', '/campus-map'],
  ['bsit2', '/student/penalties'], ['bsit2', '/student/payments'],
  ['ssgTreasurer', '/org'], ['ssgTreasurer', '/org/receipts'], ['classOfficer', '/org/remittances'], ['ssgGovernor', '/org/violations'], ['ssgGovernor', '/org/penalties'], ['ssgTreasurer', '/org/payments'], ['ssgGovernor', '/approvals'],
  ['guidance', '/office'], ['guidance', '/office/queue'], ['registrar', '/office/requests'], ['guidance', '/office/guidance'], ['library', '/office/library'], ['sasStaff', '/office/clearance'], ['sasHead', '/reports'],
  ['programHead', '/department'], ['cashier', '/cashier'],
  ['admin', '/admin'], ['admin', '/admin/users'], ['admin', '/admin/config'], ['admin', '/admin/policies'], ['admin', '/admin/clearance'], ['admin', '/admin/ai'], ['admin', '/admin/automation'], ['admin', '/admin/gis'], ['admin', '/admin/audit'], ['admin', '/reports'],
  ['bsit1', '/admin'],
];
const widths = (process.argv[2] ?? '320,768,1440').split(',').map(Number);
const shoot = process.argv[3] === 'shots';
const browser = await chromium.launch();
const problems = [];
const fs = await import('node:fs');
const axeSrc = (process.env.AXE ? fs.readFileSync(process.env.AXE_PATH ?? 'node_modules/axe-core/axe.min.js', 'utf8') : '');
const axeIssues = new Map();
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('campusserve.splashShown', '1'); } catch {} });
  for (const [who, path] of pages) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|favicon/.test(m.text())) errs.push(`console: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400 && !(who === 'bsit1' && path === '/admin')) errs.push(`api ${r.status()} ${r.url().replace('http://localhost:5173', '')}`); });
    await page.goto('http://localhost:5173/');
    await page.evaluate((t) => { if (t) localStorage.setItem('campusserve.devToken', t); else localStorage.removeItem('campusserve.devToken'); }, who ? await token(who) : null);
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) errs.push(`horizontal overflow ${overflow}px`);
    const h1 = await page.locator('h1').first().textContent().catch(() => null);
    if (!h1) errs.push('no h1');
    if (errs.length) problems.push(`${w} ${who ?? 'anon'} ${path}: ${errs.join(' | ')}`);
    if (process.env.AXE) {
      await page.addScriptTag({ content: axeSrc });
      const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.flatMap((v) => v.id === 'color-contrast' ? v.nodes.map((n) => ({ id: v.id, impact: v.impact, target: `${n.any[0]?.data?.fgColor} on ${n.any[0]?.data?.bgColor} ratio ${n.any[0]?.data?.contrastRatio} size ${n.any[0]?.data?.fontSize}` })) : [{ id: v.id, impact: v.impact, target: v.nodes[0]?.target?.join(' ') }]));
      for (const v of r) { const k = v.id === 'color-contrast' ? v.target : `${v.id} (${v.impact})`; const e = axeIssues.get(k) ?? []; e.push(`${path} ${v.target}`); axeIssues.set(k, e); }
    }
    if (shoot) await page.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/${w}-${(who ?? 'anon')}-${path.replace(/\//g, '_') || 'root'}.png`, fullPage: true });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'NO PROBLEMS');
for (const [k, v] of axeIssues) console.log('AXE', k, v.length, 'pages, e.g.', v.slice(0, 3).join(' ; '));
console.log(`checked ${pages.length} pages x ${widths.length} widths`);
