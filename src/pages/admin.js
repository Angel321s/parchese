// Administración de Párchese: bares aliados y comisiones por cobrar.
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, errorMessage, toast, confirmDialog } from '../ui.js';
import { esc, money } from '../lib/format.js';
import { loadReport, reportHtml } from './report.js';

export async function render({ main, query, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=/admin', { replace: true });
    return;
  }
  setTitle('Administración');
  if (!state.isAdmin) {
    main.innerHTML = emptyBlock('Esta sección es solo para la administración de Párchese', `Entraste como ${esc(state.user.email)}.`);
    return;
  }
  let tab = query.get('tab') === 'comisiones' ? 'comisiones' : 'bares';
  let bars = [];
  let repBar = query.get('bar');

  main.innerHTML = `<p class="kicker">Párchese</p><h1 class="h-page">Administración</h1>
    <nav class="tabs-nav"><button data-tab="bares" class="${tab === 'bares' ? 'on' : ''}">${I.store} Bares</button>
      <button data-tab="comisiones" class="${tab === 'comisiones' ? 'on' : ''}">${I.chart} Comisiones</button></nav>
    <div id="tab">${loadingBlock()}</div>`;
  const tabEl = main.querySelector('#tab');

  try {
    bars = await api.listAllBars();
  } catch (e) {
    tabEl.innerHTML = emptyBlock('No pudimos cargar los bares', esc(errorMessage(e)));
    return;
  }
  if (!current()) return;

  function paintBares() {
    tabEl.innerHTML = `<div class="sec-h" style="margin-top:0"><h2>Bares aliados</h2>
        <a class="btn btn-primary sm" href="/admin/bar/nuevo">${I.plus} Nuevo bar</a></div>` +
      (bars.length
        ? bars
            .map((b) => `<div class="erow"><div class="g"><b>${esc(b.name)}</b>
                <p class="muted sm">${esc([b.zone, b.address].filter(Boolean).join(' · '))}${b.brebKey ? ` · llave ${esc(b.brebKey)}` : ' · <span style="color:var(--amber)">sin llave Bre-B</span>'}</p></div>
              ${b.active ? '<span class="tag mint">Activo</span>' : '<span class="tag">Oculto</span>'}
              <div class="row"><a class="btn sm btn-ghost" href="/admin/bar/${encodeURIComponent(b.id)}">${I.edit} Editar</a>
                <a class="btn sm btn-ghost" href="/panel?bar=${encodeURIComponent(b.id)}">Panel</a>
                <button class="btn sm btn-ghost" data-act="report" data-id="${esc(b.id)}">Comisión</button></div></div>`)
            .join('')
        : emptyBlock('Todavía no hay bares', 'Cuando un bar firme, créalo aquí con su llave Bre-B y el correo de su personal.', '<a class="btn btn-primary" href="/admin/bar/nuevo">Crear el primer bar</a>'));
  }

  async function paintComisiones() {
    if (!bars.length) {
      tabEl.innerHTML = emptyBlock('Todavía no hay bares', '');
      return;
    }
    if (!bars.some((b) => b.id === repBar)) repBar = bars[0].id;
    tabEl.innerHTML = `<div class="field" style="max-width:320px;margin-top:0"><label for="rep-bar">Bar</label>
        <select class="input" id="rep-bar">${bars.map((b) => `<option value="${esc(b.id)}" ${b.id === repBar ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div id="rep" class="mt">${loadingBlock()}</div>`;
    try {
      const rep = await loadReport(repBar);
      if (tab === 'comisiones' && current()) tabEl.querySelector('#rep').innerHTML = reportHtml(rep, { admin: true });
    } catch (e) {
      tabEl.querySelector('#rep').innerHTML = emptyBlock('No pudimos cargar el reporte', esc(errorMessage(e)));
    }
  }

  function setTab(t) {
    tab = t;
    history.replaceState(null, '', `/admin?tab=${t}${t === 'comisiones' && repBar ? '&bar=' + encodeURIComponent(repBar) : ''}`);
    main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'bares') paintBares();
    else paintComisiones();
  }

  async function onClick(e) {
    const t = e.target.closest('[data-tab],[data-act]');
    if (!t || !main.contains(t)) return;
    if (t.dataset.tab) return setTab(t.dataset.tab);
    if (t.dataset.act === 'report') {
      repBar = t.dataset.id;
      setTab('comisiones');
    } else if (t.dataset.act === 'settle') {
      const amount = Number(t.dataset.amount);
      const ok = await confirmDialog({
        title: `¿El bar ya pagó ${money(amount)}?`,
        body: 'Márcalo solo cuando la transferencia de la comisión te aparezca en tu cuenta.',
        ok: 'Sí, ya llegó',
      });
      if (!ok) return;
      t.disabled = true;
      try {
        await api.markSettled({ barId: repBar, eventId: t.dataset.id, amount });
        toast('Comisión marcada como pagada');
        paintComisiones();
      } catch (err) {
        t.disabled = false;
        toast(errorMessage(err), 'err');
      }
    } else if (t.dataset.act === 'unsettle') {
      t.disabled = true;
      try {
        await api.unmarkSettled(t.dataset.id);
        paintComisiones();
      } catch (err) {
        t.disabled = false;
        toast(errorMessage(err), 'err');
      }
    }
  }

  function onChange(e) {
    if (e.target.id !== 'rep-bar') return;
    repBar = e.target.value;
    history.replaceState(null, '', `/admin?tab=comisiones&bar=${encodeURIComponent(repBar)}`);
    paintComisiones();
  }

  main.addEventListener('click', onClick);
  main.addEventListener('change', onChange);
  setTab(tab);
  return () => {
    main.removeEventListener('click', onClick);
    main.removeEventListener('change', onChange);
  };
}
