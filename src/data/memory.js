// MODO DEMO: la misma interfaz que firestore.js, pero los datos viven en el navegador
// (localStorage) y se sincronizan entre pestañas. Sirve para mostrar el sitio sin
// Firebase y para las pruebas de punta a punta. Repite las validaciones de firestore.rules.
import { newOrderCode, slugify, fromBogota, bogotaParts } from '../lib/format.js';

export const mode = 'demo';

const KEY = 'parchese-demo-v1';
const SESSION = 'parchese-demo-user';
const DATE_KEY = /(At|startsAt|eventStartsAt|signedAt)$/;
const LATENCY = 60;

let state = null;
const watchers = new Set();
const authListeners = new Set();
let channel = null;

const sleep = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x), reviver));
const err = (code, msg = code) => Object.assign(new Error(msg), { code });

function reviver(k, v) {
  return typeof v === 'string' && DATE_KEY.test(k) && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw, reviver);
  } catch { /* sin almacenamiento */ }
  return null;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
  try { channel?.postMessage('changed'); } catch { /* sin canal */ }
  fire();
}

function fire() {
  for (const w of watchers) w();
}

function reloadFromStorage() {
  const s = read();
  if (s) state = s;
  fire();
  emitAuth();
}

export async function init() {
  state = read() || seed();
  if (!read()) persist();
  try {
    channel = new BroadcastChannel('parchese-demo');
    channel.onmessage = reloadFromStorage;
  } catch { /* navegador sin BroadcastChannel */ }
  window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromStorage(); });
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(SESSION); } catch { /* nada */ }
}

// ---------- sesión ----------

function currentUid() {
  try { return sessionStorage.getItem(SESSION); } catch { return null; }
}

function me() {
  const uid = currentUid();
  const u = uid && state.users[uid];
  return u ? { uid: u.uid, email: u.email, emailVerified: !!u.emailVerified, name: u.name || '', provider: u.provider } : null;
}

function emitAuth() {
  const u = me();
  for (const cb of authListeners) cb(u);
}

function setSession(uid) {
  try {
    if (uid) sessionStorage.setItem(SESSION, uid);
    else sessionStorage.removeItem(SESSION);
  } catch { /* nada */ }
  emitAuth();
}

export function onUser(cb) {
  authListeners.add(cb);
  setTimeout(() => cb(me()), 0);
  return () => authListeners.delete(cb);
}

const findByEmail = (email) => Object.values(state.users).find((u) => u.email === String(email).trim().toLowerCase());

export async function signInEmail(email, pass) {
  await sleep();
  const u = findByEmail(email);
  if (!u || u.pass !== pass) throw err('auth/invalid-credential');
  setSession(u.uid);
  return me();
}

export async function signUpEmail(name, email, pass) {
  await sleep();
  email = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
  if (String(pass).length < 6) throw err('auth/weak-password');
  if (findByEmail(email)) throw err('auth/email-already-in-use');
  const uid = 'u' + Math.random().toString(36).slice(2, 10);
  state.users[uid] = { uid, email, pass, name: String(name).trim(), emailVerified: false, provider: 'password' };
  persist();
  setSession(uid);
  return me();
}

// En el sitio real esto abre la ventana de Google. En el demo se simula con nombre y correo.
export async function signInGoogle() {
  throw err('demo/google');
}

export async function demoGoogle(name, email) {
  await sleep();
  email = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
  let u = findByEmail(email);
  if (!u) {
    const uid = 'g' + Math.random().toString(36).slice(2, 10);
    u = state.users[uid] = { uid, email, pass: null, name: String(name).trim() || email, emailVerified: true, provider: 'google' };
  } else {
    u.emailVerified = true;
  }
  persist();
  setSession(u.uid);
  return me();
}

export async function resetPassword() {
  await sleep();
}

export async function signOutUser() {
  setSession(null);
}

export async function sendVerification() {
  await sleep();
  const u = state.users[currentUid()];
  if (u) { u.verifySent = true; persist(); }
}

// En el demo, "verificar" ocurre apenas se pide el correo de verificación.
export async function refreshUser() {
  await sleep();
  const u = state.users[currentUid()];
  if (u && u.verifySent) { u.emailVerified = true; persist(); }
  emitAuth();
  return me();
}

// ---------- roles ----------

function isAdminNow() {
  const u = me();
  return !!u && u.emailVerified && state.admins.includes(u.email);
}

function isStaffOf(barId) {
  const u = me();
  const p = state.barsPrivate[barId];
  return !!u && u.emailVerified && !!p && p.staffEmails.includes(u.email);
}

const canManage = (barId) => isStaffOf(barId) || isAdminNow();

export async function checkAdmin() {
  await sleep(10);
  return isAdminNow();
}

export async function listMyBars() {
  await sleep();
  const ids = isAdminNow()
    ? Object.keys(state.bars)
    : Object.keys(state.barsPrivate).filter((id) => isStaffOf(id));
  return ids.map((id) => ({ id, ...clone(state.bars[id]) })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- bares ----------

const withId = (coll, id) => (coll[id] ? { id, ...clone(coll[id]) } : null);

export async function listActiveBars() {
  await sleep();
  return Object.keys(state.bars).filter((id) => state.bars[id].active).map((id) => withId(state.bars, id));
}

export async function getBar(id) {
  await sleep(20);
  const b = state.bars[id];
  if (!b || (!b.active && !canManage(id))) return null;
  return withId(state.bars, id);
}

export async function getBarPrivate(id) {
  await sleep(20);
  if (!canManage(id)) throw err('permission-denied');
  return withId(state.barsPrivate, id);
}

export async function listAllBars() {
  await sleep();
  if (!isAdminNow()) throw err('permission-denied');
  return Object.keys(state.bars).map((id) => withId(state.bars, id));
}

export async function saveBar(id, pub, priv) {
  await sleep();
  if (!isAdminNow()) throw err('permission-denied');
  if (!pub.name) throw err('invalid-argument', 'Falta el nombre del bar');
  state.bars[id] = { ...(state.bars[id] || {}), ...clone(pub), updatedAt: new Date() };
  state.barsPrivate[id] = { ...(state.barsPrivate[id] || {}), ...clone(priv), updatedAt: new Date() };
  persist();
  return id;
}

// ---------- eventos ----------

const SIX_HOURS = 6 * 3600e3;
const evList = (pred) =>
  Object.keys(state.events)
    .map((id) => withId(state.events, id))
    .filter(pred)
    .sort((a, b) => a.startsAt - b.startsAt);

export async function listUpcomingEvents() {
  await sleep();
  const from = Date.now() - SIX_HOURS;
  return evList((e) => e.status === 'published' && e.startsAt.getTime() >= from);
}

export async function listBarPublishedEvents(barId) {
  await sleep();
  return evList((e) => e.barId === barId && e.status === 'published');
}

export async function getEvent(id) {
  await sleep(30);
  const e = state.events[id];
  if (!e || (e.status !== 'published' && !canManage(e.barId))) return null;
  return withId(state.events, id);
}

export async function listBarEvents(barId) {
  await sleep();
  if (!canManage(barId)) throw err('permission-denied');
  return evList((e) => e.barId === barId);
}

const EDITABLE = ['title', 'about', 'startsAt', 'status', 'genres', 'lineup', 'ticketTypes', 'barName', 'barZone', 'barAddress'];

export async function saveEvent(id, data) {
  await sleep();
  const barId = id ? state.events[id]?.barId : data.barId;
  if (!barId || !canManage(barId)) throw err('permission-denied');
  const fields = {};
  for (const k of EDITABLE) if (k in data) fields[k] = clone(data[k]);
  if (id) {
    state.events[id] = { ...state.events[id], ...fields, updatedAt: new Date() };
  } else {
    const base = slugify(data.title) + '-' + bogotaDate(new Date(data.startsAt));
    id = base;
    for (let n = 2; state.events[id]; n++) id = base + '-' + n;
    state.events[id] = { barId, ...fields, sold: {}, createdAt: new Date(), updatedAt: new Date() };
  }
  persist();
  return id;
}

function bogotaDate(d) {
  const p = bogotaParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export async function deleteEvent(id) {
  await sleep();
  const e = state.events[id];
  if (!e || !canManage(e.barId) || e.status !== 'draft') throw err('permission-denied');
  delete state.events[id];
  persist();
}

// ---------- pedidos ----------

export async function createOrder({ event, typeId, qty, name, phone, barName }) {
  await sleep(120);
  const u = me();
  if (!u) throw err('unauthenticated');
  const ev = state.events[event.id];
  if (!ev || ev.status !== 'published' || Date.now() > new Date(ev.startsAt).getTime() + SIX_HOURS) throw err('event-closed');
  const tt = ev.ticketTypes[typeId];
  if (!tt) throw err('invalid-argument');
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw err('invalid-argument');
  if (String(name).trim().length < 2 || String(phone).replace(/\D/g, '').length < 7) throw err('invalid-argument');
  const sold = ev.sold[typeId] || 0;
  if (tt.capacity > 0 && sold + qty > tt.capacity) throw err('sold-out');
  let code = newOrderCode();
  while (state.orders[code]) code = newOrderCode();
  const total = tt.price * qty;
  state.orders[code] = {
    uid: u.uid, code, eventId: event.id, barId: ev.barId, typeId, typeName: tt.name, qty,
    unitPrice: tt.price, total, status: total === 0 ? 'confirmado' : 'pendiente',
    name: String(name).trim(), phone: String(phone).trim(), email: u.email, consent: true,
    createdAt: new Date(), eventTitle: ev.title, eventStartsAt: ev.startsAt, barName: barName || '',
  };
  ev.sold[typeId] = sold + qty;
  ev.lastOrderId = code;
  persist();
  return code;
}

function readableOrder(code) {
  const o = state.orders[code];
  const u = me();
  if (!o || !u) return null;
  if (o.uid !== u.uid && !canManage(o.barId)) return null;
  return withId(state.orders, code);
}

function watch(fn) {
  watchers.add(fn);
  setTimeout(fn, LATENCY);
  return () => watchers.delete(fn);
}

export function watchOrder(code, cb) {
  return watch(() => cb(readableOrder(code)));
}

export async function getOrder(code) {
  await sleep();
  return readableOrder(code);
}

export async function claimPaid(code, payerName) {
  await sleep();
  const o = state.orders[code];
  const u = me();
  if (!o || !u || o.uid !== u.uid || o.status !== 'pendiente') throw err('permission-denied');
  o.paidClaimAt = new Date();
  o.payerName = String(payerName || '').slice(0, 60);
  persist();
}

export async function listMyOrders() {
  await sleep();
  const u = me();
  if (!u) return [];
  return Object.keys(state.orders)
    .filter((c) => state.orders[c].uid === u.uid)
    .map((c) => withId(state.orders, c))
    .sort((a, b) => b.createdAt - a.createdAt);
}

const barOrders = (barId) =>
  Object.keys(state.orders).filter((c) => state.orders[c].barId === barId).map((c) => withId(state.orders, c));

export function watchBarOrders(barId, cb, onError) {
  return watch(() => {
    if (!canManage(barId)) { onError?.(err('permission-denied')); return; }
    cb(barOrders(barId));
  });
}

export async function listBarOrders(barId) {
  await sleep();
  if (!canManage(barId)) throw err('permission-denied');
  return barOrders(barId);
}

function transition(code, from, to, extra) {
  const o = state.orders[code];
  if (!o || !canManage(o.barId) || o.status !== from) throw err('permission-denied');
  Object.assign(o, { status: to }, extra);
  return o;
}

export async function confirmPayment(code) {
  await sleep();
  transition(code, 'pendiente', 'confirmado', { confirmedAt: new Date(), confirmedBy: me().email });
  persist();
}

export async function checkIn(code) {
  await sleep();
  transition(code, 'confirmado', 'usado', { usedAt: new Date(), usedBy: me().email });
  persist();
}

function close(order, from, to) {
  const o = transition(order.code, from, to, { closedAt: new Date(), closedBy: me().email });
  const ev = state.events[o.eventId];
  if (ev) ev.sold[o.typeId] = Math.max(0, (ev.sold[o.typeId] || 0) - o.qty);
}

export async function rejectOrder(order) {
  await sleep();
  close(order, 'pendiente', 'rechazado');
  persist();
}

export async function refundOrder(order) {
  await sleep();
  close(order, 'confirmado', 'reembolsado');
  persist();
}

// ---------- perfil ----------

export async function getProfile() {
  await sleep(20);
  const u = me();
  return u ? clone(state.profiles[u.uid] || null) : null;
}

export async function saveProfile({ name, phone }) {
  const u = me();
  if (!u) return;
  state.profiles[u.uid] = { name, phone, updatedAt: new Date() };
  persist();
}

// ---------- comisiones liquidadas ----------

export async function listSettlements(barId) {
  await sleep();
  if (!canManage(barId)) throw err('permission-denied');
  return Object.values(state.settlements).filter((s) => s.barId === barId).map(clone);
}

export async function markSettled({ barId, eventId, amount }) {
  await sleep();
  if (!isAdminNow()) throw err('permission-denied');
  state.settlements[eventId] = { barId, eventId, amount, paidAt: new Date(), by: me().email };
  persist();
}

export async function unmarkSettled(eventId) {
  await sleep();
  if (!isAdminNow()) throw err('permission-denied');
  delete state.settlements[eventId];
  persist();
}

// ---------- datos de ejemplo ----------

function seed() {
  const now = new Date();
  const today = bogotaParts(now);
  const at = (daysFromToday, hh, mm = 0) => fromBogota(today.y, today.m, today.d + daysFromToday, hh, mm);
  // Próximo sábado con al menos dos días de margen.
  const weekday = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
  let toSat = (6 - weekday + 7) % 7;
  if (toSat < 2) toSat += 7;

  const users = {};
  const addUser = (uid, email, name, extra = {}) => {
    users[uid] = { uid, email, pass: 'demo1234', name, emailVerified: true, provider: 'password', ...extra };
  };
  addUser('admin', 'admin@parchese.co', 'Administración Párchese');
  addUser('staff1', 'bar@lasucursal.co', 'Equipo La Sucursal');
  addUser('staff2', 'bar@terrazalunar.co', 'Equipo Terraza Lunar');
  const people = [
    ['c1', 'Laura Giraldo'], ['c2', 'Andrés Peña'], ['c3', 'Mariana López'], ['c4', 'Camilo Rojas'],
    ['c5', 'Daniela Soto'], ['c6', 'Sofía Martínez'], ['c7', 'Mateo Herrera'], ['c8', 'Valentina Cruz'],
  ];
  for (const [uid, name] of people) addUser(uid, slugify(name).replace("-", ".") + "@ejemplo.com", name);

  const bars = {
    'la-sucursal': {
      name: 'La Sucursal', zone: 'Chapinero', address: 'Cra. 13 #54-21', city: 'Bogotá',
      about: 'Salsateca brava en el corazón de Chapinero. Son cubano, timba y guaguancó en vinilo, con orquesta en vivo los sábados.',
      hours: 'Jueves a domingo, de 7:00 p. m. a 3:00 a. m.',
      rules: ['Ingreso solo para mayores de 18 con cédula', 'Vestimenta casual: sin gorras ni pantalonetas', 'La mesa se guarda 30 minutos después de la hora reservada'],
      whatsapp: '', brebKey: '@lasucursal', brebName: 'La Sucursal Bar SAS', active: true, updatedAt: now,
    },
    'terraza-lunar': {
      name: 'Terraza Lunar', zone: 'Zona T', address: 'Cl. 83 #12-30, piso 7', city: 'Bogotá',
      about: 'Rooftop con vista a los cerros. Tardeo con DJ, atardecer y coctelería de autor.',
      hours: 'Miércoles a domingo, de 4:00 p. m. a 2:00 a. m.',
      rules: ['Ingreso solo para mayores de 18 con cédula', 'No se permite el ingreso de alimentos ni bebidas'],
      whatsapp: '', brebKey: '3001234567', brebName: 'Terraza Lunar SAS', active: true, updatedAt: now,
    },
  };
  const barsPrivate = {
    'la-sucursal': { staffEmails: ['bar@lasucursal.co'], commissionRate: 0.08, freeEvents: 3, freeWindowDays: 60, signedAt: at(-30, 12), updatedAt: now },
    'terraza-lunar': { staffEmails: ['bar@terrazalunar.co'], commissionRate: 0.08, freeEvents: 3, freeWindowDays: 60, signedAt: at(-5, 12), updatedAt: now },
  };

  const sucursal = { barId: 'la-sucursal', barName: 'La Sucursal', barZone: 'Chapinero', barAddress: 'Cra. 13 #54-21' };
  const lunar = { barId: 'terraza-lunar', barName: 'Terraza Lunar', barZone: 'Zona T', barAddress: 'Cl. 83 #12-30, piso 7' };
  const salsaTypes = {
    lista: { name: 'Lista de invitados', desc: 'Gratis si llegas antes de las 9:30 p. m.', price: 0, capacity: 40, order: 0 },
    preventa: { name: 'Preventa', desc: 'Ingreso hasta las 10:00 p. m.', price: 25000, capacity: 120, order: 1 },
    general: { name: 'General', desc: 'Ingreso toda la noche', price: 35000, capacity: 200, order: 2 },
    parejas: { name: 'Combo parejas', desc: '2 entradas y 2 cocteles', price: 80000, capacity: 30, order: 3 },
  };
  const ev = (base, title, startsAt, about, genres, lineup, ticketTypes, status = 'published') => ({
    ...base, title, startsAt, about, genres, lineup, ticketTypes, status, sold: {}, createdAt: now, updatedAt: now,
  });
  const events = {
    'noche-de-vinilo': ev(sucursal, 'Noche de vinilo', at(-28, 20), 'Salsa clásica en vinilo toda la noche.', ['Salsa'], ['DJ Son Caribe'], { general: { name: 'General', desc: '', price: 20000, capacity: 150, order: 0 } }),
    'timba-en-vivo': ev(sucursal, 'Timba en vivo', at(-21, 20), 'Orquesta en vivo y timba cubana.', ['Salsa'], ['Orquesta La Clave'], { general: { name: 'General', desc: '', price: 30000, capacity: 150, order: 0 } }),
    'bolero-y-ron': ev(sucursal, 'Bolero y ron', at(-14, 20), 'Boleros, son y ron añejo.', ['Bolero'], ['Trío invitado'], { general: { name: 'General', desc: '', price: 20000, capacity: 120, order: 0 } }),
    'salsa-y-son': ev(sucursal, 'Salsa y son', at(-4, 20), 'Son cubano y salsa brava.', ['Salsa'], ['DJ Son Caribe'], { general: { name: 'General', desc: '', price: 25000, capacity: 150, order: 0 } }),
    'azucar-y-timbal': ev(sucursal, 'Azúcar y timbal', at(toSat, 20), 'Noche de salsa dura con orquesta en vivo y los clásicos que no pasan de moda.', ['Salsa', 'Son'], ['Orquesta en vivo a las 11:00 p. m.', 'DJ Son Caribe'], salsaTypes),
    'viernes-de-son': ev(sucursal, 'Viernes de son', at(toSat + 6, 20), 'Son cubano para arrancar el fin de semana.', ['Son'], ['Sexteto invitado'], { general: { name: 'General', desc: 'Ingreso toda la noche', price: 20000, capacity: 150, order: 0 } }),
    'tardeo-lunar': ev(lunar, 'Tardeo Lunar', at(toSat, 16), 'Tardeo en el rooftop: atardecer sobre los cerros, coctelería y crossover suave.', ['Rooftop', 'Crossover'], ['DJ set al atardecer', 'Saxofón en vivo'], { cover: { name: 'Cover consumible', desc: 'Se abona completo a tu cuenta', price: 35000, capacity: 150, order: 0 } }),
  };

  const orders = {};
  let n = 0;
  const addOrder = (eventId, typeId, qty, person, status, minutesAgo, extra = {}) => {
    const e = events[eventId];
    const tt = e.ticketTypes[typeId];
    const code = 'PRCH-' + ['DEMQ', 'DEMR', 'DEMS', 'DEMT', 'DEMU', 'DEMV', 'DEMW', 'DEMX', 'DEMY', 'DEMZ', 'DMQA', 'DMQB', 'DMQC'][n++] + 'A2';
    const created = new Date(Math.min(now.getTime(), e.startsAt.getTime()) - minutesAgo * 60000);
    const u = users[person];
    orders[code] = {
      uid: person, code, eventId, barId: e.barId, typeId, typeName: tt.name, qty, unitPrice: tt.price, total: tt.price * qty,
      status, name: u.name, phone: '30' + String(10000000 + n * 7919).slice(0, 8), email: u.email, consent: true,
      createdAt: created, eventTitle: e.title, eventStartsAt: e.startsAt, barName: e.barName, ...extra,
    };
    if (status !== 'rechazado' && status !== 'reembolsado') e.sold[typeId] = (e.sold[typeId] || 0) + qty;
  };
  addOrder('noche-de-vinilo', 'general', 4, 'c1', 'usado', 600);
  addOrder('noche-de-vinilo', 'general', 2, 'c2', 'usado', 500);
  addOrder('timba-en-vivo', 'general', 3, 'c3', 'usado', 700);
  addOrder('bolero-y-ron', 'general', 2, 'c6', 'usado', 800);
  addOrder('salsa-y-son', 'general', 2, 'c4', 'usado', 400);
  addOrder('salsa-y-son', 'general', 2, 'c5', 'confirmado', 300);
  addOrder('azucar-y-timbal', 'preventa', 2, 'c6', 'confirmado', 900);
  addOrder('azucar-y-timbal', 'general', 4, 'c7', 'pendiente', 25, { paidClaimAt: new Date(now.getTime() - 20 * 60000), payerName: 'Mateo Herrera' });
  addOrder('azucar-y-timbal', 'parejas', 1, 'c8', 'pendiente', 8);
  addOrder('tardeo-lunar', 'cover', 2, 'c1', 'confirmado', 200);

  return {
    v: 1,
    admins: ['admin@parchese.co'],
    users, bars, barsPrivate, events, orders,
    settlements: {},
    profiles: {},
  };
}
