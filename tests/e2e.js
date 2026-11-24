// Prueba de punta a punta en MODO DEMO (sin Firebase), en tamaño celular:
// compra con Bre-B, "Ya pagué", el bar confirma, QR en vivo, puerta, rechazo, entrada gratis,
// reporte de comisión, administración (crear bar y marcar comisión pagada) y crear un evento.
//   npm run test:e2e        (SHOTS=carpeta para guardar capturas)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const env = { ...process.env };
for (const k of Object.keys(env)) if (k.startsWith('VITE_')) delete env[k];
// Vacías a propósito: así el sitio arranca en modo demo aunque exista un .env con Firebase.
env.VITE_FIREBASE_API_KEY = '';
env.VITE_FIREBASE_PROJECT_ID = '';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  env,
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + '/');
      if (r.ok) return;
    } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('El servidor de Vite no arrancó');
}

const errors = [];
let step = 0;
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true });
}
const log = (m) => console.log('✓', m);

function watch(page, who) {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${who}: ${m.text()}`);
  });
}

async function login(page, email, pass, next) {
  await page.goto(`${BASE}/entrar?next=${encodeURIComponent(next)}`);
  await page.fill('#in-email', email);
  await page.fill('#in-pass', pass);
  await page.click('#f-in button.btn-primary');
  await page.waitForURL((u) => u.pathname === next.split('?')[0], { timeout: 8000 });
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });

  // ---------- cliente: cartelera y evento ----------
  const a = await ctx.newPage();
  watch(a, 'cliente');
  await a.goto(BASE + '/');
  await a.waitForSelector('.ev');
  assert.ok(await a.locator('.ev', { hasText: 'Azúcar y timbal' }).count(), 'la cartelera muestra el evento');
  assert.equal(await a.locator('.ev', { hasText: 'Bolero y ron' }).count(), 0, 'los eventos pasados no salen en la cartelera');
  await shot(a, 'portada');
  log('cartelera');

  await a.locator('.ev', { hasText: 'Azúcar y timbal' }).click();
  await a.waitForSelector('h1:has-text("Azúcar y timbal")');
  assert.ok(await a.locator('a[href*="google.com/maps"]').count(), 'hay enlace a Google Maps');
  await a.locator('.tk', { hasText: 'General' }).click();
  await a.locator('#side [data-qty="1"]').click();
  assert.match(await a.locator('#side .box-t').innerText(), /70\.000/);
  await shot(a, 'evento');
  await a.locator('#side [data-act="buy"]').click();
  log('evento y selección de 2 entradas generales ($70.000)');

  // ---------- cliente: crear cuenta y volver a la compra ----------
  await a.waitForURL(/\/entrar/);
  await a.click('[data-tab="up"]');
  await a.fill('#up-name', 'Ana Prueba');
  await a.fill('#up-email', 'ana@prueba.co');
  await a.fill('#up-pass', 'clave123');
  await shot(a, 'crear-cuenta');
  await a.click('#f-up button.btn-primary');
  await a.waitForSelector('#co', { timeout: 8000 });
  assert.equal(await a.inputValue('#co-name'), 'Ana Prueba');
  await a.click('#co-go');
  assert.match(await a.locator('#co-err').innerText(), /WhatsApp/);
  await a.fill('#co-phone', '300 123 4567');
  await a.click('#co-go');
  assert.match(await a.locator('#co-err').innerText(), /autoriza/);
  await a.check('#co-ok');
  await shot(a, 'datos-compra');
  await a.click('#co-go');
  await a.waitForURL(/\/t\/PRCH-/);
  const code = a.url().split('/t/')[1];
  log(`reserva creada con código ${code}`);

  await a.waitForSelector('.pay');
  const pay = await a.locator('.pay').innerText();
  assert.match(pay, /70\.000/);
  assert.match(pay, /@lasucursal/);
  assert.match(pay, /La Sucursal Bar SAS/);
  assert.ok(pay.includes(code));
  await shot(a, 'pagar-bre-b');
  await a.fill('#payer', 'Ana María Prueba');
  await a.click('#claim button');
  await a.waitForSelector('.waiting');
  await shot(a, 'esperando-confirmacion');
  log('instrucciones de Bre-B y "Ya pagué"');

  // ---------- bar: confirmar el pago ----------
  const b = await ctx.newPage();
  watch(b, 'bar');
  await login(b, 'bar@lasucursal.co', 'demo1234', '/panel');
  await b.waitForSelector(`[data-act="confirm"][data-code="${code}"]`);
  const card = await b.locator('.oc', { hasText: code }).innerText();
  assert.match(card, /Ana María Prueba/);
  assert.match(card, /Dice que ya pagó/);
  assert.equal(await b.locator('#badge').innerText(), '3');
  await shot(b, 'panel-pagos');
  await b.click(`[data-act="confirm"][data-code="${code}"]`);
  await b.waitForSelector(`[data-code="${code}"]`, { state: 'detached' });
  log('el bar ve el aviso y confirma el pago');

  // ---------- cliente: el QR aparece solo ----------
  await a.bringToFront();
  await a.waitForSelector('.qrbox svg', { timeout: 6000 });
  assert.ok((await a.locator('.ticket').innerText()).includes(code));
  await shot(a, 'entrada-qr');
  log('el QR aparece en vivo');

  // ---------- bar: puerta ----------
  await b.bringToFront();
  await b.click('[data-tab="puerta"]');
  await b.fill('#door-code', code.slice(5).toLowerCase());
  await b.click('#door-f button');
  await b.waitForSelector('.door.ok');
  assert.match(await b.locator('.door.ok').innerText(), /Puede entrar[\s\S]*2 personas/);
  await shot(b, 'puerta-puede-entrar');
  await b.click('[data-act="checkin"]');
  await b.waitForSelector('.door.ok:has-text("Adentro")');
  await b.fill('#door-code', code);
  await b.click('#door-f button');
  await b.waitForSelector('.door.bad:has-text("Ya entró")');
  await shot(b, 'puerta-ya-entro');
  await b.fill('#door-code', 'PRCH-ZZZZZZ');
  await b.click('#door-f button');
  await b.waitForSelector('.door.bad:has-text("no encontrado")');
  log('puerta: entra una vez, el segundo escaneo se rechaza, un código falso no pasa');

  await a.bringToFront();
  await a.waitForSelector('.stamp-used', { timeout: 6000 });
  log('el cliente ve "Ya entraste"');

  // ---------- bar: rechazar un pago que no llegó ----------
  await b.bringToFront();
  await b.click('[data-tab="pagos"]');
  await b.click('[data-act="reject"][data-code="PRCH-DEMYA2"]');
  await b.click('[data-ans="yes"]');
  await b.waitForSelector('[data-code="PRCH-DEMYA2"]', { state: 'detached' });
  log('pago no recibido: se rechaza y libera el cupo');

  // ---------- cliente: entrada gratis (lista de invitados) ----------
  await a.bringToFront();
  await a.goto(BASE + '/e/azucar-y-timbal');
  await a.locator('.tk', { hasText: 'Lista de invitados' }).click();
  await a.locator('#side [data-act="buy"]').click();
  await a.waitForSelector('#co');
  await a.check('#co-ok');
  await a.click('#co-go');
  await a.waitForSelector('.qrbox svg');
  log('la entrada gratis queda confirmada de una vez');
  await a.goto(BASE + '/mis-entradas');
  await a.waitForSelector('.oitem');
  assert.equal(await a.locator('.oitem').count(), 2);
  await shot(a, 'mis-entradas');

  // ---------- bar: ventas y comisión ----------
  await b.bringToFront();
  await b.click('[data-tab="ventas"]');
  await b.waitForSelector('.rep');
  const azucar = await b.locator('.rep', { hasText: 'Azúcar y timbal' }).innerText();
  assert.match(azucar, /120\.000/, 'vendido: preventa $50.000 + general $70.000');
  assert.match(azucar, /9\.600/, '8% de $120.000');
  const salsa = await b.locator('.rep', { hasText: 'Salsa y son' }).innerText();
  assert.match(salsa, /8\.000/);
  assert.match(salsa, /por pagar/i);
  assert.match(await b.locator('.rep', { hasText: 'Bolero y ron' }).innerText(), /sin comisión/i);
  await shot(b, 'panel-ventas');
  log('reporte: 3 eventos gratis, $8.000 por pagar de "Salsa y son", $9.600 en curso');

  // ---------- bar: crear y publicar un evento ----------
  await b.click('[data-tab="eventos"]');
  await b.click('a:has-text("Nuevo evento")');
  await b.waitForSelector('#ef');
  await b.fill('#ef-title', 'Jueves de prueba');
  await b.fill('#ef-about', 'Evento creado en la prueba automática.');
  await b.locator('.ttype [data-f="price"]').fill('20.000');
  await b.locator('.ttype [data-f="capacity"]').fill('50');
  await b.click('[data-status="published"]');
  await shot(b, 'nuevo-evento');
  await b.click('#ef-save');
  await b.waitForSelector('.erow:has-text("Jueves de prueba")');
  await shot(b, 'panel-eventos');
  log('el bar crea y publica un evento');

  // ---------- administración ----------
  const c = await ctx.newPage();
  watch(c, 'admin');
  await login(c, 'admin@parchese.co', 'demo1234', '/admin');
  await c.waitForSelector('.erow:has-text("La Sucursal")');
  await c.click('a:has-text("Nuevo bar")');
  await c.waitForSelector('#bf');
  await c.fill('#bf-name', 'Bar de Prueba');
  assert.equal(await c.inputValue('#bf-id'), 'bar-de-prueba');
  await c.fill('#bf-zone', 'Galerías');
  await c.fill('#bf-address', 'Cl. 53 #24-40');
  await c.fill('#bf-key', '@barprueba');
  await c.fill('#bf-holder', 'Bar de Prueba SAS');
  await c.fill('#bf-staff', 'equipo@barprueba.co');
  await shot(c, 'admin-nuevo-bar');
  await c.click('#bf-save');
  await c.waitForSelector('.erow:has-text("Bar de Prueba")');
  log('administración crea un bar con su llave y su personal');

  await c.click('[data-tab="comisiones"]');
  await c.selectOption('#rep-bar', 'la-sucursal');
  await c.waitForSelector('[data-act="settle"]');
  await c.click('[data-act="settle"]');
  await c.click('[data-ans="yes"]');
  await c.waitForSelector('.rep:has-text("Salsa y son") .tag:has-text("Comisión pagada")');
  await shot(c, 'admin-comisiones');
  log('administración marca la comisión de "Salsa y son" como pagada');

  // ---------- la cartelera muestra el evento nuevo ----------
  await a.bringToFront();
  await a.goto(BASE + '/');
  await a.waitForSelector('.ev:has-text("Jueves de prueba")');
  log('el evento nuevo aparece en la cartelera');

  // ---------- escritorio ----------
  await a.setViewportSize({ width: 1280, height: 860 });
  await a.goto(BASE + '/e/azucar-y-timbal');
  await a.waitForSelector('#side .tk');
  await shot(a, 'evento-escritorio');

  assert.deepEqual(errors, [], 'sin errores en la consola');
  console.log('\nTodo bien: flujo completo en modo demo.');
} catch (e) {
  console.error('\nFALLÓ:', e.message);
  if (errors.length) console.error('Errores de consola:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
