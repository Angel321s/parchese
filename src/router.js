// Enrutador mínimo con la History API. Cada página exporta render(ctx) y puede devolver
// una función de limpieza (para cerrar las suscripciones en vivo al salir).
import { closeSheet } from './ui.js';

const routes = [];
let cleanup = null;
let token = 0;
let afterRender = () => {};

export function route(pattern, page) {
  const keys = [];
  const re = new RegExp(
    '^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return '/([^/]+)';
    }) + '/?$',
  );
  routes.push({ re, keys, page, pattern });
}

export function onAfterRender(fn) {
  afterRender = fn;
}

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.scrollTo(0, 0);
  return render();
}

export async function render() {
  const url = new URL(location.href);
  const mine = ++token;
  const prev = cleanup;
  cleanup = null;
  prev?.();
  closeSheet();
  const main = document.getElementById('main');
  let found = null;
  let params = {};
  for (const r of routes) {
    const m = url.pathname.match(r.re);
    if (m) {
      found = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      break;
    }
  }
  if (!found) found = routes.find((r) => r.pattern === '/404');
  const ctx = { params, query: url.searchParams, main, current: () => mine === token };
  try {
    const ret = await found.page.render(ctx);
    if (mine !== token) {
      if (typeof ret === 'function') ret();
      return;
    }
    cleanup = typeof ret === 'function' ? ret : null;
  } catch (e) {
    console.error(e);
    if (mine === token) {
      main.innerHTML =
        '<div class="empty"><h3>No pudimos cargar esta página</h3><p>Revisa tu conexión e inténtalo de nuevo.</p>' +
        '<div class="mt"><button class="btn btn-ghost" onclick="location.reload()">Reintentar</button></div></div>';
    }
  }
  if (mine === token) afterRender(url.pathname);
}

export function startRouter() {
  window.addEventListener('popstate', () => render());
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.external != null) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    navigate(href);
  });
  return render();
}
