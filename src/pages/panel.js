// Panel del bar: pagos por confirmar (en vivo), puerta, eventos y ventas.
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, errorMessage, toast, confirmDialog, openSheet, closeSheet } from '../ui.js';
import {
  esc, money, dateShort, dateLong, timeShort, cap, ago, waLink, waShare, normalizeCode, isOrderCode, sameBogotaDay,
  BUSINESS_WHATSAPP,
} from '../lib/format.js';
import { loadReport, reportHtml } from './report.js';

const BAR_KEY = 'parchese-panel-bar';
const TABS = [
  ['pagos', 'Pagos', I.bell],
  ['puerta', 'Puerta', I.door],
  ['eventos', 'Eventos', I.cal],
  ['ventas', 'Ventas', I.chart],
];
const SIX_HOURS = 6 * 3600e3;

export async function render({ main, query, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=' + encodeURIComponent('/panel' + location.search), { replace: true });
    return;
  }
  setTitle('Panel del bar');
  if (!state.user.emailVerified) return verifyBlock(main);
  if (!state.myBars.length) {
    main.innerHTML = `<div class="auth box"><h1>Panel del bar</h1>
      <p class="muted mt-s">Tu correo <b>${esc(state.user.email)}</b> todavía no está registrado como personal de ningún bar.</p>
      <p class="mt-s">Si tu bar ya trabaja con Párchese, escríbenos y agregamos tu correo.</p>
      <a class="btn btn-primary block mt" href="${waLink(BUSINESS_WHATSAPP, `Hola, quiero acceso al panel del bar con el correo ${state.user.email}`)}" target="_blank" rel="noopener">${I.chat} Escribir a Párchese</a></div>`;
    return;
  }

  let barId = query.get('bar');
  try { barId = barId || localStorage.getItem(BAR_KEY); } catch { /* nada */ }
  if (!state.myBars.some((b) => b.id === barId)) barId = state.myBars[0].id;
  try { localStorage.setItem(BAR_KEY, barId); } catch { /* nada */ }
  const bar = state.myBars.find((b) => b.id === barId);
  let tab = TABS.some((t) => t[0] === query.get('tab')) ? query.get('tab') : 'pagos';
  let orders = null;
  let scanner = null;
  const demo = api.mode === 'demo';

  main.innerHTML = `
    <div class="panel-head">
      <div><p class="kicker">Panel del bar</p><h1 class="h-page">${esc(bar.name)}</h1></div>
      ${state.myBars.length > 1
        ? `<select class="input" id="bar-pick" style="max-width:260px" aria-label="Bar">${state.myBars
            .map((b) => `<option value="${esc(b.id)}" ${b.id === barId ? 'selected' : ''}>${esc(b.name)}</option>`)
            .join('')}</select>`
        : ''}
    </div>
    <nav class="tabs-nav" aria-label="Secciones del panel">${TABS.map(
      ([id, label, icon]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${icon} ${label}${id === 'pagos' ? ' <span class="badge" id="badge" hidden>0</span>' : ''}</button>`,
    ).join('')}</nav>
    <div id="tab"></div>`;
  const tabEl = main.querySelector('#tab');

  const unsub = api.watchBarOrders(
    barId,
    (list) => {
      orders = list;
      updateBadge();
      if (tab === 'pagos') paintPagos();
      else if (tab === 'puerta') paintDoorStats();
    },
    (e) => {
      if (tab === 'pagos') tabEl.innerHTML = emptyBlock('No pudimos cargar los pedidos', esc(errorMessage(e)));
    },
  );

  function updateBadge() {
    const n = (orders || []).filter((o) => o.status === 'pendiente').length;
    const b = main.querySelector('#badge');
    if (!b) return;
    b.textContent = n;
    b.hidden = n === 0;
  }

  function setTab(t) {
    tab = t;
    history.replaceState(null, '', `/panel?bar=${encodeURIComponent(barId)}&tab=${t}`);
    main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    stopScanner();
    paintTab();
  }

  function paintTab() {
    if (tab === 'pagos') paintPagos();
    else if (tab === 'puerta') paintPuerta();
    else if (tab === 'eventos') paintEventos();
    else paintVentas();
  }

  // ---------- pagos ----------

  function phoneHtml(o) {
    if (!o.phone) return '';
    return demo
      ? `<span class="muted sm">${esc(o.phone)}</span>`
      : `<a class="btn sm btn-ghost" href="${waLink(o.phone, `Hola ${o.name}, te escribimos de ${bar.name} por tu reserva ${o.code} en Párchese`)}" target="_blank" rel="noopener">${I.chat} WhatsApp</a>`;
  }

  function orderCard(o) {
    const d = new Date(o.eventStartsAt);
    return `<div class="oc ${o.paidClaimAt ? 'claimed' : ''}">
      <div class="oc-top"><span class="code">${esc(o.code)}</span>
        ${o.paidClaimAt ? '<span class="tag amb">Dice que ya pagó</span>' : '<span class="tag">Aún no avisa que pagó</span>'}
        <span class="sp"></span><span class="muted sm">${esc(ago(new Date(o.createdAt)))}</span></div>
      <div class="oc-main">
        <div><b>${esc(o.name)}</b>
          <p class="muted sm">${esc(o.eventTitle)} · ${esc(cap(dateShort(d)))}</p>
          <p class="muted sm">${esc(o.typeName)} × ${o.qty}</p>
          ${o.paidClaimAt ? `<p class="sm mt-s">Pagó desde la cuenta de <b>${esc(o.payerName || 'sin nombre')}</b> · ${esc(ago(new Date(o.paidClaimAt)))}</p>` : ''}</div>
        <div class="oc-amt num">${money(o.total)}</div>
      </div>
      <div class="acts">
        <button class="btn btn-mint" data-act="confirm" data-code="${esc(o.code)}">${I.check} Confirmar pago</button>
        <button class="btn btn-ghost" data-act="reject" data-code="${esc(o.code)}">No llegó</button>
        ${phoneHtml(o)}
      </div>
    </div>`;
  }

  function paintPagos() {
    if (!orders) {
      tabEl.innerHTML = loadingBlock();
      return;
    }
    const pend = orders
      .filter((o) => o.status === 'pendiente')
      .sort((a, b) => (b.paidClaimAt ? 1 : 0) - (a.paidClaimAt ? 1 : 0) || (b.paidClaimAt || b.createdAt) - (a.paidClaimAt || a.createdAt));
    const today = orders.filter((o) => o.confirmedAt && sameBogotaDay(new Date(o.confirmedAt), new Date()));
    tabEl.innerHTML =
      `<div class="warn">${I.shield}<span>Confirma solo los pagos que veas en la app de tu banco, por el valor exacto. Un pantallazo no es prueba de pago.</span></div>` +
      (pend.length
        ? `<div class="olist mt">${pend.map(orderCard).join('')}</div>`
        : `<div class="mt">${emptyBlock('No hay pagos por confirmar', 'Cuando alguien reserve, aparece aquí al instante.')}</div>`) +
      (today.length ? `<p class="note">Hoy confirmaste ${today.length} ${today.length === 1 ? 'pago' : 'pagos'} por ${money(today.reduce((s, o) => s + o.total, 0))}.</p>` : '');
  }

  // ---------- puerta ----------

  function paintPuerta() {
    tabEl.innerHTML = `<div class="cols">
      <div class="box"><h2>Validar entrada</h2>
        <form id="door-f" class="row mt" autocomplete="off">
          <input class="input code-in" id="door-code" placeholder="PRCH-AB12CD" autocapitalize="characters" spellcheck="false" aria-label="Código de la entrada">
          <button class="btn btn-primary">Buscar</button></form>
        <button class="btn btn-ghost block mt" data-act="scan">${I.camera} Escanear QR</button>
        <div id="door-res"></div></div>
      <aside class="side"><div id="door-stats"></div></aside></div>`;
    paintDoorStats();
  }

  function paintDoorStats() {
    const box = main.querySelector('#door-stats');
    if (!box) return;
    if (!orders) {
      box.innerHTML = loadingBlock();
      return;
    }
    const now = Date.now();
    const byEvent = new Map();
    for (const o of orders) {
      const t = new Date(o.eventStartsAt).getTime();
      if (t < now - 12 * 3600e3 || t > now + 36 * 3600e3) continue;
      if (!byEvent.has(o.eventId)) byEvent.set(o.eventId, { title: o.eventTitle, at: new Date(o.eventStartsAt), inside: 0, ok: 0, pending: 0 });
      const s = byEvent.get(o.eventId);
      if (o.status === 'usado') { s.inside += o.qty; s.ok += o.qty; }
      else if (o.status === 'confirmado') s.ok += o.qty;
      else if (o.status === 'pendiente') s.pending += 1;
    }
    box.innerHTML = byEvent.size
      ? [...byEvent.values()]
          .sort((a, b) => a.at - b.at)
          .map((s) => `<div class="box mt-s"><b>${esc(s.title)}</b><p class="muted sm">${esc(cap(dateShort(s.at)))} · ${esc(timeShort(s.at))}</p>
            <div class="stats mt"><div class="stat"><div class="n num">${s.inside} / ${s.ok}</div><div class="l">Personas adentro</div></div>
            <div class="stat"><div class="n num">${s.pending}</div><div class="l">Pagos sin confirmar</div></div></div></div>`)
          .join('')
      : `<div class="box"><p class="muted">No hay eventos con reservas entre hoy y mañana.</p></div>`;
  }

  function doorCard(kind, title, body) {
    return `<div class="door ${kind}"><h3>${title}</h3>${body}</div>`;
  }

  async function lookup(raw) {
    const res = main.querySelector('#door-res');
    if (!res) return;
    const code = normalizeCode(raw);
    if (!isOrderCode(code)) {
      res.innerHTML = doorCard('bad', 'Código no válido', '<p class="mt-s">Los códigos se ven así: PRCH-AB12CD.</p>');
      return;
    }
    res.innerHTML = loadingBlock('Buscando…');
    const o = await api.getOrder(code).catch(() => null);
    if (!main.querySelector('#door-res')) return;
    if (!o || o.barId !== barId) {
      res.innerHTML = doorCard('bad', 'Código no encontrado', `<p class="mt-s">No hay ninguna entrada ${esc(code)} en ${esc(bar.name)}.</p>`);
      return;
    }
    paintDoorResult(o);
  }

  function paintDoorResult(o) {
    const res = main.querySelector('#door-res');
    if (!res) return;
    const when = new Date(o.eventStartsAt);
    const notToday = !sameBogotaDay(when, new Date());
    const who = `<p class="who-big">${esc(o.name)}</p>
      <p>${esc(o.typeName)} · <b>${o.qty} ${o.qty === 1 ? 'persona' : 'personas'}</b></p>
      <p class="muted sm">${esc(o.eventTitle)} · ${esc(cap(dateShort(when)))} ${esc(timeShort(when))} · ${esc(o.code)}</p>
      ${notToday ? `<p class="mt-s"><span class="tag amb">Ojo: esta entrada es para el ${esc(dateLong(when))}</span></p>` : ''}`;
    if (o.status === 'confirmado') {
      res.innerHTML = doorCard('ok', 'Puede entrar', who +
        `<button class="btn btn-mint block mt" data-act="checkin" data-code="${esc(o.code)}">${I.check} Dejar entrar</button>
         <button class="link sm mt" style="display:block;margin-top:12px" data-act="refund" data-code="${esc(o.code)}">Registrar una devolución de este pago</button>`);
    } else if (o.status === 'usado') {
      res.innerHTML = doorCard('bad', 'Ya entró', who + `<p class="mt-s">Entró ${o.usedAt ? esc(timeShort(new Date(o.usedAt))) : ''}${o.usedBy ? ' · validó ' + esc(o.usedBy) : ''}.</p>`);
    } else if (o.status === 'pendiente') {
      res.innerHTML = doorCard('warn-c', 'Pago sin confirmar', who +
        (o.paidClaimAt ? `<p class="mt-s">Dice que pagó desde la cuenta de <b>${esc(o.payerName || 'sin nombre')}</b>. Revisa tu app del banco: ${money(o.total)}.</p>` : `<p class="mt-s">Todavía no avisa que pagó ${money(o.total)}.</p>`) +
        `<button class="btn btn-mint block mt" data-act="door-confirm" data-code="${esc(o.code)}">${I.check} Ya me llegó, confirmar pago</button>`);
    } else {
      res.innerHTML = doorCard('bad', 'Entrada no válida', who + `<p class="mt-s">${o.status === 'rechazado' ? 'El pago se marcó como no recibido.' : 'El pago se devolvió.'}</p>`);
    }
  }

  async function scan() {
    const sheet = openSheet(
      `<h3>Escanear QR</h3><p class="muted mt-s">Apunta la cámara al QR de la entrada.</p>
       <div class="scanner"><video id="qr-video" playsinline muted></video></div><p class="msg-err" id="qr-err" hidden></p>`,
      { onClose: stopScanner },
    );
    try {
      const { default: QrScanner } = await import('qr-scanner');
      const video = sheet.querySelector('#qr-video');
      scanner = new QrScanner(
        video,
        (result) => {
          const text = result?.data ?? String(result);
          closeSheet();
          const input = main.querySelector('#door-code');
          if (input) input.value = normalizeCode(text);
          lookup(text);
        },
        { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 8 },
      );
      await scanner.start();
    } catch {
      const er = sheet.querySelector('#qr-err');
      if (er) {
        er.textContent = 'No pudimos abrir la cámara. Revisa el permiso de cámara del navegador o escribe el código.';
        er.hidden = false;
      }
    }
  }

  function stopScanner() {
    const s = scanner;
    scanner = null;
    try { s?.stop(); s?.destroy(); } catch { /* nada */ }
  }

  // ---------- eventos ----------

  async function paintEventos() {
    tabEl.innerHTML = loadingBlock();
    let events;
    try {
      events = await api.listBarEvents(barId);
    } catch (e) {
      if (tab === 'eventos') tabEl.innerHTML = emptyBlock('No pudimos cargar los eventos', esc(errorMessage(e)));
      return;
    }
    if (tab !== 'eventos' || !current()) return;
    const now = Date.now();
    const groups = [
      ['Próximos', events.filter((e) => e.status === 'published' && e.startsAt.getTime() > now - SIX_HOURS)],
      ['Borradores', events.filter((e) => e.status === 'draft')],
      ['Pasados', events.filter((e) => e.status === 'published' && e.startsAt.getTime() <= now - SIX_HOURS).reverse()],
      ['Cancelados', events.filter((e) => e.status === 'cancelled')],
    ];
    const tag = { draft: '<span class="tag">Borrador</span>', published: '<span class="tag mint">Publicado</span>', cancelled: '<span class="tag danger">Cancelado</span>' };
    const row = (e) => {
      const sold = Object.values(e.sold || {}).reduce((a, b) => a + b, 0);
      return `<div class="erow"><div class="g"><b>${esc(e.title)}</b>
          <p class="muted sm">${esc(cap(dateShort(e.startsAt)))} · ${esc(timeShort(e.startsAt))} · ${sold} ${sold === 1 ? 'entrada' : 'entradas'}</p></div>
        ${tag[e.status] || ''}
        <div class="row">
          <a class="btn sm btn-ghost" href="/panel/evento/${encodeURIComponent(e.id)}">${I.edit} Editar</a>
          ${e.status === 'published' ? `<a class="btn sm btn-ghost" href="/e/${encodeURIComponent(e.id)}">Ver</a>
            <button class="btn sm btn-ghost" data-act="share-ev" data-id="${esc(e.id)}" data-title="${esc(e.title)}" aria-label="Compartir">${I.share}</button>` : ''}
        </div></div>`;
    };
    const newBtn = `<a class="btn btn-primary sm" href="/panel/evento/nuevo?bar=${encodeURIComponent(barId)}">${I.plus} Nuevo evento</a>`;
    tabEl.innerHTML = `<div class="sec-h" style="margin-top:0"><h2>Eventos</h2>${newBtn}</div>` +
      (events.length
        ? groups.filter((g) => g[1].length).map(([t, list]) => `<h3 class="sub-h">${t}</h3>${list.map(row).join('')}`).join('')
        : emptyBlock('Todavía no tienes eventos', 'Crea el primero y compártelo por WhatsApp.', `<a class="btn btn-primary" href="/panel/evento/nuevo?bar=${encodeURIComponent(barId)}">Crear evento</a>`));
  }

  // ---------- ventas ----------

  async function paintVentas() {
    tabEl.innerHTML = loadingBlock();
    try {
      const rep = await loadReport(barId);
      if (tab === 'ventas' && current()) tabEl.innerHTML = reportHtml(rep);
    } catch (e) {
      if (tab === 'ventas') tabEl.innerHTML = emptyBlock('No pudimos cargar las ventas', esc(errorMessage(e)));
    }
  }

  // ---------- acciones ----------

  async function act(btn, fn, okMsg) {
    btn.disabled = true;
    try {
      await fn();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      btn.disabled = false;
      toast(errorMessage(e), 'err');
      return false;
    }
  }

  const findOrder = (code) => (orders || []).find((o) => o.code === code);

  async function onClick(e) {
    const t = e.target.closest('[data-tab],[data-act]');
    if (!t || !main.contains(t)) return;
    if (t.dataset.tab) return setTab(t.dataset.tab);
    const code = t.dataset.code;
    switch (t.dataset.act) {
      case 'confirm':
        await act(t, () => api.confirmPayment(code), 'Pago confirmado: ya le aparece su QR');
        break;
      case 'reject': {
        const o = findOrder(code);
        if (!o) return;
        const ok = await confirmDialog({
          title: '¿Marcar este pago como no recibido?',
          body: `${esc(o.name)} verá que el bar no encontró su pago de ${money(o.total)}, y se libera el cupo.`,
          ok: 'Sí, no llegó',
          danger: true,
        });
        if (ok) await act(t, () => api.rejectOrder(o), 'Pedido marcado como no pagado');
        break;
      }
      case 'scan':
        scan();
        break;
      case 'checkin':
        if (await act(t, () => api.checkIn(code))) {
          const o = await api.getOrder(code);
          main.querySelector('#door-res').innerHTML = doorCard('ok', 'Adentro', `<p class="who-big">${esc(o.name)}</p><p>Entraron ${o.qty} ${o.qty === 1 ? 'persona' : 'personas'}.</p>`);
          const input = main.querySelector('#door-code');
          if (input) input.value = '';
        }
        break;
      case 'door-confirm':
        if (await act(t, () => api.confirmPayment(code), 'Pago confirmado')) lookup(code);
        break;
      case 'refund': {
        const o = await api.getOrder(code);
        if (!o) return;
        const ok = await confirmDialog({
          title: '¿Registrar la devolución?',
          body: `Hazlo solo si ya le devolviste ${money(o.total)} a ${esc(o.name)}. La entrada queda anulada y no cuenta para la comisión.`,
          ok: 'Sí, ya le devolví',
          danger: true,
        });
        if (ok && (await act(t, () => api.refundOrder(o), 'Devolución registrada'))) lookup(code);
        break;
      }
      case 'share-ev': {
        const url = location.origin + '/e/' + t.dataset.id;
        openSheet(`<h3>Compartir evento</h3><p class="muted mt-s">${esc(t.dataset.title)}</p>
          <div class="input sel mt">${esc(url)}</div>
          <div class="acts"><a class="btn btn-primary" href="${waShare(t.dataset.title + '\n' + url)}" target="_blank" rel="noopener">${I.chat} Enviar por WhatsApp</a>
          <button class="btn btn-ghost" data-copy="${esc(url)}" data-copy-msg="Enlace copiado">${I.copy} Copiar enlace</button></div>`);
        break;
      }
      default:
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'door-f') return;
    e.preventDefault();
    lookup(main.querySelector('#door-code').value);
  }

  function onChange(e) {
    if (e.target.id !== 'bar-pick') return;
    try { localStorage.setItem(BAR_KEY, e.target.value); } catch { /* nada */ }
    navigate(`/panel?bar=${encodeURIComponent(e.target.value)}&tab=${tab}`);
  }

  main.addEventListener('click', onClick);
  main.addEventListener('submit', onSubmit);
  main.addEventListener('change', onChange);
  paintTab();

  return () => {
    unsub();
    stopScanner();
    main.removeEventListener('click', onClick);
    main.removeEventListener('submit', onSubmit);
    main.removeEventListener('change', onChange);
  };
}

function verifyBlock(main) {
  main.innerHTML = `<div class="auth box"><h1>Verifica tu correo</h1>
    <p class="muted mt-s">Para entrar al panel necesitamos confirmar que <b>${esc(state.user.email)}</b> es tuyo.</p>
    <button class="btn btn-primary block mt" data-act="send-verify">Enviarme el correo de verificación</button>
    <button class="btn btn-ghost block mt" data-act="check-verify">Ya lo verifiqué</button>
    <p class="note">Si entras con Google, tu correo queda verificado de una vez.</p></div>`;
  const onClick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'send-verify') {
      t.disabled = true;
      try {
        await api.sendVerification();
        toast('Te enviamos el correo. Ábrelo, toca el enlace y vuelve aquí.');
      } catch (err) {
        toast(errorMessage(err), 'err');
      }
      t.disabled = false;
    } else if (t.dataset.act === 'check-verify') {
      const u = await api.refreshUser().catch(() => null);
      if (!u?.emailVerified) toast('Todavía no aparece verificado. Revisa tu correo (y la carpeta de spam).', 'err');
    }
  };
  main.addEventListener('click', onClick);
  return () => main.removeEventListener('click', onClick);
}
