// Utilidades de formato: texto seguro, plata, fechas en hora de Bogotá, códigos y enlaces.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');

const pad = (n) => String(n).padStart(2, '0');

// ---------- fechas (Bogotá es UTC-5 todo el año, sin horario de verano) ----------

const TZ = 'America/Bogota';
const fmt = (opts) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, ...opts });

export const dateLong = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const dateShort = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d);
export const timeShort = (d) => fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
export const dayNum = (d) => fmt({ day: 'numeric' }).format(d);
export const dayShort = (d) => fmt({ weekday: 'short' }).format(d).replace('.', '');
export const monthShort = (d) => fmt({ month: 'short' }).format(d).replace('.', '');
export const dateTime = (d) => cap(dateLong(d)) + ' · ' + timeShort(d);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function bogotaParts(d) {
  const t = new Date(d.getTime() - 5 * 3600e3);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

export function fromBogota(y, m, d, hh = 0, mm = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm));
}

export const isoDate = (d) => {
  const p = bogotaParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

export const isoTime = (d) => {
  const p = bogotaParts(d);
  return `${pad(p.hh)}:${pad(p.mm)}`;
};

export function parseBogota(dateStr, timeStr = '00:00') {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  if (!y || !m || !d) return null;
  return fromBogota(y, m, d, hh || 0, mm || 0);
}

export const sameBogotaDay = (a, b) => isoDate(a) === isoDate(b);

export function ago(d, now = new Date()) {
  const min = Math.round((now - d) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

// ---------- identificadores ----------

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

// Sin I, O, 0 ni 1 para que nadie los confunda al escribir el código en el banco.
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newOrderCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return 'PRCH-' + Array.from(a, (x) => ALPH[x % ALPH.length]).join('');
}

export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (/^[A-Z2-9]{6}$/.test(s)) return 'PRCH-' + s;
  if (/^PRCH[A-Z2-9]{6}$/.test(s)) return 'PRCH-' + s.slice(4);
  return s;
}

export const isOrderCode = (s) => /^PRCH-[A-HJ-NP-Z2-9]{6}$/.test(s);

export function newTypeId() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return 't' + Array.from(a, (x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
}

// ---------- aspecto ----------

export function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

const GRADS = [
  ['#FF2E88', '#7A1FFF'], ['#FF8D3E', '#FF2E88'], ['#22C8A8', '#1F6BFF'], ['#7A1FFF', '#1FA6FF'],
  ['#FFB23E', '#FF4D6D'], ['#FF2E88', '#1FA6FF'], ['#16B4DA', '#B45BE0'], ['#F2505A', '#FF9D3E'],
];

export function grad(s) {
  const g = GRADS[hash(s) % GRADS.length];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

// ---------- enlaces ----------

export function mapsUrl(bar) {
  const q = [bar?.name, bar?.address, bar?.city || 'Bogotá'].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

export function phoneDigits(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) return '57' + d;
  return d;
}

export function waLink(phone, text = '') {
  const d = phoneDigits(phone);
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}

export const waShare = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

export const BUSINESS_WHATSAPP = '3132396045';
