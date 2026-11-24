import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './styles.css';
import { loadBackend, api } from './data/index.js';
import { state, setState, onState } from './state.js';
import { route, startRouter, render, onAfterRender, navigate } from './router.js';
import { I, openSheet, closeSheet, copyText, toast } from './ui.js';
import { esc, waLink, BUSINESS_WHATSAPP } from './lib/format.js';
import * as home from './pages/home.js';
import * as eventPage from './pages/event.js';
import * as ticket from './pages/ticket.js';
import * as myTickets from './pages/myTickets.js';
import * as barPage from './pages/bar.js';
import * as login from './pages/login.js';
import * as panel from './pages/panel.js';
import * as eventEditor from './pages/eventEditor.js';
import * as admin from './pages/admin.js';
import * as barEditor from './pages/barEditor.js';
import * as legal from './pages/legal.js';

route('/', home);
route('/e/:id', eventPage);
route('/t/:code', ticket);
route('/mis-entradas', myTickets);
route('/b/:id', barPage);
route('/entrar', login);
route('/panel', panel);
route('/panel/evento/:id', eventEditor);
route('/admin', admin);
route('/admin/bar/:id', barEditor);
route('/privacidad', { render: legal.privacy });
route('/terminos', { render: legal.terms });
route('/404', { render: legal.notFound });

const app = document.getElementById('app');

function shell() {
  const demo = api.mode === 'demo'
    ? `<div class="demo-bar"><div class="wrap"><span><b>Modo demo.</b> Los datos son de ejemplo y se guardan solo en este navegador.</span><span class="sp"></span><button data-act="reset-demo">Reiniciar demo</button></div></div>`
    : '';
  app.innerHTML = `${demo}
    <header class="hdr"><div class="wrap hdr-in" id="hdr"></div></header>
    <main id="main" class="wrap page"></main>
    <footer class="ftr"><div class="wrap">
      <div class="ftr-in">
        <div><a class="brand" href="/">Párchese</a><p class="muted sm mt-s">Eventos, reservas y entradas para la rumba. Pagas por Bre-B directo al bar.</p></div>
        <div><h4>Para ti</h4><a href="/">Cartelera</a><a href="/mis-entradas">Mis entradas</a></div>
        <div><h4>Para bares</h4><a href="${waLink(BUSINESS_WHATSAPP, 'Hola, tengo un bar y quiero saber más de Párchese')}" target="_blank" rel="noopener">Quiero estar en Párchese</a><a href="/panel">Panel del bar</a></div>
      </div>
      <p class="fine">© ${new Date().getFullYear()} Párchese · Bogotá · <a href="/privacidad" style="display:inline">Privacidad</a> · <a href="/terminos" style="display:inline">Términos</a></p>
    </div></footer>
    <div id="sheet-root" class="sheet-root"></div>
    <div id="toasts" role="status" aria-live="polite"></div>`;
}

function navLinks() {
  const links = [['/', 'Cartelera'], ['/mis-entradas', 'Mis entradas']];
  if (state.myBars.length) links.push(['/panel', 'Panel del bar']);
  if (state.isAdmin) links.push(['/admin', 'Administración']);
  return links;
}

function renderHeader() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  const path = location.pathname;
  const on = (href) => (href === '/' ? path === '/' : path.startsWith(href)) ? 'on' : '';
  const u = state.user;
  hdr.innerHTML = `
    <a class="brand" href="/">Párchese</a>
    <nav class="nav" aria-label="Principal">${navLinks().map(([h, t]) => `<a href="${h}" class="${on(h)}">${t}</a>`).join('')}</nav>
    <div class="hdr-act">
      ${u
        ? `<span class="who hide-m">${esc(u.name || u.email)}</span><button class="btn sm btn-ghost hide-m" data-act="logout">${I.out} Salir</button>`
        : state.authReady ? `<a class="btn sm btn-primary" href="/entrar?next=${encodeURIComponent(path === '/entrar' ? '/' : path + location.search)}">Entrar</a>` : ''}
      <button class="btn sm btn-ghost burger" data-act="menu" aria-label="Menú">${I.menu}</button>
    </div>`;
}

function openMenu() {
  const u = state.user;
  const icons = { '/': I.cal, '/mis-entradas': I.ticket, '/panel': I.store, '/admin': I.shield };
  openSheet(`<h3>${u ? esc(u.name || u.email) : 'Menú'}</h3>
    <div class="menu-list mt">
      ${navLinks().map(([h, t]) => `<a href="${h}">${icons[h] || ''} ${t}</a>`).join('')}
      ${u ? `<button data-act="logout">${I.out} Salir</button>` : `<a href="/entrar">${I.user} Entrar</a>`}
    </div>`);
}

async function logout() {
  closeSheet();
  await api.signOutUser();
  toast('Saliste de tu cuenta');
  navigate('/');
}

// Clics globales: menú, salir, copiar, cerrar hojas, reiniciar demo.
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-copy],[data-close-sheet]');
  if (!t) return;
  if (t.hasAttribute('data-close-sheet')) return closeSheet();
  if (t.dataset.copy != null) return copyText(t.dataset.copy, t.dataset.copyMsg || 'Copiado');
  const act = t.dataset.act;
  if (act === 'menu') openMenu();
  else if (act === 'logout') logout();
  else if (act === 'reset-demo') {
    api.resetDemo?.();
    location.href = '/';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// Sesión y roles: se recalculan cuando cambia el usuario o la verificación del correo.
let lastKey = null;
function authKey(u, s) {
  return u ? `${u.uid}|${u.emailVerified}|${s.isAdmin}|${s.myBars.map((b) => b.id).join(',')}` : 'anon';
}

async function onUserChanged(u) {
  const prevUid = state.user?.uid;
  setState({ user: u, authReady: true, rolesReady: !u, ...(u ? {} : { isAdmin: false, myBars: [] }) });
  if (u) {
    if (prevUid !== u.uid) setState({ rolesReady: false });
    const [isAdmin, myBars] = u.emailVerified
      ? await Promise.all([api.checkAdmin().catch(() => false), api.listMyBars().catch(() => [])])
      : [false, []];
    if (state.user?.uid !== u.uid) return;
    setState({ isAdmin, myBars, rolesReady: true });
  }
}

onState((s) => {
  renderHeader();
  if (!s.authReady || (s.user && !s.rolesReady)) return;
  const key = authKey(s.user, s);
  if (lastKey !== null && key !== lastKey) render();
  lastKey = key;
});

onAfterRender(() => renderHeader());

async function boot() {
  app.innerHTML = '<div class="loading" style="min-height:70vh"><div class="spin"></div></div>';
  await loadBackend();
  shell();
  renderHeader();
  api.onUser(onUserChanged);
  await startRouter();
}

boot();
