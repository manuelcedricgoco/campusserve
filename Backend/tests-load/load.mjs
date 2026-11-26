// Load test against a LOCAL stack only (API on :4000 with the test HS256 secret, synthetic LOAD-* students).
import { SignJWT } from 'jose';
const API = process.env.API ?? 'http://localhost:4000/api/v1';
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'test-only-jwt-secret-that-is-at-least-32-chars');
const tok = (n) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(`c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
  .setAudience('authenticated').setIssuer('http://localhost:54321/auth/v1').setExpirationTime('30m').sign(secret);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const tokens = await Promise.all(Array.from({ length: 300 }, (_, i) => tok(i + 1)));

// 1) Burst: 300 different students reserve the same 5-place slot at once.
const slotId = process.argv[2];
let t0 = performance.now();
const burst = await Promise.all(tokens.map(async (t) => {
  const s = performance.now();
  const r = await fetch(`${API}/queue/tickets`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId }) });
  const body = await r.json();
  return { status: r.status, code: body.error?.code, n: body.data?.queue_number, ms: performance.now() - s };
}));
const ok = burst.filter((b) => b.status === 201);
const by = burst.reduce((m, b) => ((m[`${b.status} ${b.code ?? ''}`.trim()] = (m[`${b.status} ${b.code ?? ''}`.trim()] ?? 0) + 1), m), {});
console.log(`BURST 300 concurrent reservations for one 5-place slot in ${Math.round(performance.now() - t0)} ms:`, by);
console.log('  queue numbers issued:', ok.map((b) => b.n).sort((a, b) => a - b).join(','), '| p50', Math.round(pct(burst.map((b) => b.ms), 50)), 'ms p95', Math.round(pct(burst.map((b) => b.ms), 95)), 'ms');

// 2) Sustained mixed reads: 50 concurrent users for 15 s.
const svc = (await (await fetch(`${API}/public/services`)).json()).data.find((s) => s.code === 'COUNSELING').id;
const paths = ['/me', `/queue/services/${svc}/slots`, '/queue/tickets/mine', '/notifications', '/requests', '/clearances'];
const lat = []; let errors = 0; let count = 0;
const until = Date.now() + 15000;
t0 = performance.now();
await Promise.all(Array.from({ length: 50 }, async (_, i) => {
  while (Date.now() < until) {
    const p = paths[count % paths.length]; count++;
    const s = performance.now();
    const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${tokens[i]}` } });
    await r.arrayBuffer();
    lat.push(performance.now() - s);
    if (r.status >= 400) errors++;
  }
}));
const secs = (performance.now() - t0) / 1000;
console.log(`SUSTAINED 50 users x 15 s: ${lat.length} requests, ${Math.round(lat.length / secs)} req/s, errors ${errors}, p50 ${Math.round(pct(lat, 50))} ms, p95 ${Math.round(pct(lat, 95))} ms, p99 ${Math.round(pct(lat, 99))} ms`);
