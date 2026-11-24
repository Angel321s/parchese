import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, statusChip } from '../ui.js';
import { esc, money, dateShort, timeShort, cap, grad } from '../lib/format.js';

export async function render({ main, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=/mis-entradas', { replace: true });
    return;
  }
  setTitle('Mis entradas');
  main.innerHTML = `<h1 class="h-page">Mis entradas</h1><div id="list" class="mt">${loadingBlock()}</div>`;
  const orders = await api.listMyOrders().catch(() => null);
  if (!current()) return;
  const list = main.querySelector('#list');
  if (orders === null) {
    list.innerHTML = emptyBlock('No pudimos cargar tus entradas', 'Revisa tu conexión y recarga la página.');
    return;
  }
  if (!orders.length) {
    list.innerHTML = emptyBlock('Todavía no tienes entradas', 'Cuando reserves un plan, aquí te aparece con su QR.', '<a class="btn btn-primary" href="/">Ver la cartelera</a>');
    return;
  }
  const now = Date.now();
  const upcoming = orders.filter((o) => new Date(o.eventStartsAt).getTime() > now - 6 * 3600e3);
  const past = orders.filter((o) => !upcoming.includes(o));
  const item = (o) => {
    const d = new Date(o.eventStartsAt);
    return `<a class="oitem" href="/t/${encodeURIComponent(o.code)}">
      <div class="dot" style="background:${grad(o.eventTitle)}"></div>
      <div class="g"><b>${esc(o.eventTitle)}</b>
        <p class="muted sm">${esc(cap(dateShort(d)))} · ${esc(timeShort(d))} · ${esc(o.barName || '')}</p>
        <div class="row wrapf mt-s">${statusChip(o.status)}<span class="muted sm">${esc(o.typeName)} × ${o.qty} · ${o.total === 0 ? 'Gratis' : money(o.total)}</span></div></div>
      ${I.go}</a>`;
  };
  list.innerHTML =
    (upcoming.length ? `<div class="olist">${upcoming.map(item).join('')}</div>` : emptyBlock('No tienes planes próximos', '', '<a class="btn btn-ghost" href="/">Ver la cartelera</a>')) +
    (past.length ? `<h2 class="sub-h">Pasadas</h2><div class="olist">${past.map(item).join('')}</div>` : '');
}
