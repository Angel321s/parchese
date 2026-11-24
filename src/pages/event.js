// Página del evento: información, entradas y compra.
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, flyer, loadingBlock, emptyBlock, setTitle, openSheet, closeSheet, errorMessage } from '../ui.js';
import { esc, money, dateLong, timeShort, cap, mapsUrl, waShare } from '../lib/format.js';

const SIX_HOURS = 6 * 3600e3;
const SEL_KEY = 'parchese-sel';

function saveSel(eventId, sel) {
  try { sessionStorage.setItem(SEL_KEY, JSON.stringify({ eventId, ...sel })); } catch { /* nada */ }
}

function loadSel(eventId) {
  try {
    const s = JSON.parse(sessionStorage.getItem(SEL_KEY) || 'null');
    return s && s.eventId === eventId ? { typeId: s.typeId, qty: s.qty } : null;
  } catch {
    return null;
  }
}

export async function render({ params, main, query, current }) {
  main.innerHTML = loadingBlock();
  const ev = await api.getEvent(params.id);
  if (!current()) return;
  if (!ev) {
    setTitle('Evento no encontrado');
    main.innerHTML = emptyBlock('No encontramos este evento', 'Puede que ya haya pasado o que el bar lo haya quitado.', '<a class="btn btn-ghost" href="/">Ver la cartelera</a>');
    return;
  }
  const bar = await api.getBar(ev.barId);
  if (!current()) return;
  setTitle(ev.title);

  const types = Object.entries(ev.ticketTypes || {})
    .map(([id, t]) => ({ id, ...t, left: t.capacity > 0 ? Math.max(0, t.capacity - (ev.sold?.[id] || 0)) : Infinity }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const closed = ev.status !== 'published' || Date.now() > ev.startsAt.getTime() + SIX_HOURS;
  const firstOpen = types.find((t) => t.left > 0);
  let sel = loadSel(ev.id) || { typeId: firstOpen?.id, qty: 1 };
  if (!types.some((t) => t.id === sel.typeId && t.left > 0)) sel = { typeId: firstOpen?.id, qty: 1 };

  const d = ev.startsAt;
  const place = bar || { name: ev.barName, address: ev.barAddress };
  const typeOf = () => types.find((t) => t.id === sel.typeId);
  const total = () => (typeOf()?.price || 0) * sel.qty;
  const maxQty = () => Math.min(10, typeOf()?.left ?? 10);

  function boxHtml() {
    if (closed) return `<div class="box"><h2>Entradas</h2><p class="muted mt-s">${ev.status === 'cancelled' ? 'Este evento fue cancelado.' : 'Este evento ya no está a la venta.'}</p></div>`;
    if (!types.length) return `<div class="box"><h2>Entradas</h2><p class="muted mt-s">El bar todavía no ha puesto entradas a la venta.</p></div>`;
    const t = typeOf();
    return `<div class="box sticky" id="buybox">
      <h2>Entradas</h2>
      ${types.map((x) => `<button class="tk ${x.id === sel.typeId ? 'sel' : ''}" data-type="${esc(x.id)}" ${x.left === 0 ? 'disabled' : ''}>
          <div class="tk-m"><h4>${esc(x.name)}</h4>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}
            <div class="tk-p"><b>${x.price === 0 ? 'Gratis' : money(x.price)}</b>
              ${x.left === 0 ? '<span class="tag danger">Agotada</span>' : x.left <= 15 ? `<span class="tag amb">Quedan ${x.left}</span>` : ''}</div></div>
          <span class="radio"></span></button>`).join('')}
      ${t ? `<div class="qty-row"><span class="muted">Cantidad</span>
          <div class="stepper"><button data-qty="-1" aria-label="Menos">−</button><span class="n">${sel.qty}</span><button data-qty="1" aria-label="Más">+</button></div></div>
        <div class="box-t"><span class="muted">Total</span><b class="num">${total() === 0 ? 'Gratis' : money(total())}</b></div>
        <button class="btn btn-primary block" data-act="buy">${total() === 0 ? 'Apuntarme' : 'Reservar'}</button>
        <p class="note">${total() === 0 ? 'Tu lugar queda confirmado de una vez.' : 'Pagas por Bre-B directo a la cuenta del bar. Tu entrada se activa cuando el bar confirma el pago.'}</p>`
        : '<p class="muted mt">Todas las entradas están agotadas.</p>'}
    </div>`;
  }

  function mbarHtml() {
    if (closed || !typeOf()) return '';
    return `<div class="mbar"><div class="mbar-in"><div class="tot"><b class="num">${total() === 0 ? 'Gratis' : money(total())}</b>
      <span>${esc(typeOf().name)} × ${sel.qty}</span></div>
      <button class="btn btn-primary" data-act="buy">${total() === 0 ? 'Apuntarme' : 'Reservar'}</button></div></div>`;
  }

  main.innerHTML = `
    <a class="back" href="/">${I.back} Cartelera</a>
    <div class="cols ${closed ? '' : 'has-mbar'}">
      <div>
        ${flyer(ev, 'lg')}
        <h1 class="h-page mt">${esc(ev.title)}</h1>
        <div class="info">
          <div class="kv">${I.cal}<div class="v"><b>${esc(cap(dateLong(d)))}</b><p class="muted">Desde las ${esc(timeShort(d))}</p></div></div>
          <div class="kv">${I.pin}<div class="v"><a href="/b/${encodeURIComponent(ev.barId)}"><b>${esc(place.name || '')}</b></a>
            <p class="muted">${esc([place.address, bar?.zone || ev.barZone].filter(Boolean).join(' · '))}</p>
            <a class="link" href="${mapsUrl(place)}" target="_blank" rel="noopener">Cómo llegar en Google Maps</a></div></div>
        </div>
        <div class="acts"><button class="btn sm btn-ghost" data-act="share">${I.share} Compartir</button></div>
        ${ev.about ? `<h2 class="sub-h">El plan</h2><p>${esc(ev.about)}</p>` : ''}
        ${ev.lineup?.length ? `<h2 class="sub-h">Line-up</h2><ul class="rules">${ev.lineup.map((l) => `<li>${I.check}<span>${esc(l)}</span></li>`).join('')}</ul>` : ''}
        ${bar?.rules?.length ? `<h2 class="sub-h">Antes de ir</h2><ul class="rules">${bar.rules.map((r) => `<li>${I.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
        <h2 class="sub-h">Cómo funciona el pago</h2>
        <div class="steps">
          <div class="step"><p>Reservas aquí y te damos un código del pedido.</p></div>
          <div class="step"><p>Pagas por Bre-B a la llave del bar, desde cualquier banco o billetera, con ese código en el mensaje.</p></div>
          <div class="step"><p>El bar confirma tu pago y te aparece el QR para entrar.</p></div>
        </div>
      </div>
      <aside class="side" id="side">${boxHtml()}</aside>
    </div>
    <div id="mbar">${mbarHtml()}</div>`;

  const repaint = () => {
    main.querySelector('#side').innerHTML = boxHtml();
    main.querySelector('#mbar').innerHTML = mbarHtml();
  };

  async function startBuy() {
    if (!typeOf()) return;
    if (!state.user) {
      saveSel(ev.id, sel);
      navigate('/entrar?next=' + encodeURIComponent(`/e/${ev.id}?comprar=1`));
      return;
    }
    const profile = await api.getProfile().catch(() => null);
    openCheckout(profile);
  }

  function openCheckout(profile) {
    const t = typeOf();
    const tot = total();
    const sheet = openSheet(`<h3>${tot === 0 ? 'Aparta tu lugar' : 'Tus datos'}</h3>
      <div class="sum">
        <div class="r"><span>${esc(ev.title)}</span><span>${esc(cap(dateLong(d)))}</span></div>
        <div class="r"><span>${esc(t.name)} × ${sel.qty}</span><span class="num">${tot === 0 ? 'Gratis' : money(tot)}</span></div>
        <div class="t"><span class="muted">Total</span><b class="num">${tot === 0 ? 'Gratis' : money(tot)}</b></div>
      </div>
      <form id="co" novalidate>
        <div class="field"><label for="co-name">Nombre de quien entra</label>
          <input class="input" id="co-name" autocomplete="name" maxlength="60" value="${esc(profile?.name || state.user?.name || '')}"></div>
        <div class="field"><label for="co-phone">WhatsApp</label>
          <input class="input" id="co-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="300 123 4567" value="${esc(profile?.phone || '')}">
          <p class="hint">El bar lo usa solo si necesita contactarte por tu reserva.</p></div>
        <label class="check"><input type="checkbox" id="co-ok"> <span>Autorizo el tratamiento de mis datos según la <a href="/privacidad" target="_blank">política de datos</a> y acepto los <a href="/terminos" target="_blank">términos</a>.</span></label>
        <p class="msg-err" id="co-err" hidden></p>
        <button class="btn btn-primary block mt" id="co-go">${tot === 0 ? 'Confirmar mi lugar' : 'Reservar y ver cómo pagar'}</button>
      </form>`);
    const coForm = sheet.querySelector('#co');
    const clearErr = () => { sheet.querySelector('#co-err').hidden = true; };
    coForm.addEventListener('input', clearErr);
    coForm.addEventListener('change', clearErr);
    coForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = sheet.querySelector('#co-name').value.trim();
      const phone = sheet.querySelector('#co-phone').value.trim();
      const errBox = sheet.querySelector('#co-err');
      const fail = (m) => { errBox.textContent = m; errBox.hidden = false; };
      if (name.length < 2) return fail('Escribe el nombre de quien va a entrar.');
      if (phone.replace(/\D/g, '').length < 7) return fail('Escribe un número de WhatsApp válido.');
      if (!sheet.querySelector('#co-ok').checked) return fail('Para reservar, autoriza el tratamiento de tus datos.');
      const btn = sheet.querySelector('#co-go');
      btn.disabled = true;
      btn.textContent = 'Reservando…';
      try {
        const code = await api.createOrder({ event: ev, typeId: t.id, qty: sel.qty, name, phone, barName: place.name || ev.barName || '' });
        api.saveProfile({ name, phone }).catch(() => {});
        try { sessionStorage.removeItem(SEL_KEY); } catch { /* nada */ }
        closeSheet();
        navigate('/t/' + code);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = tot === 0 ? 'Confirmar mi lugar' : 'Reservar y ver cómo pagar';
        fail(errorMessage(err));
      }
    });
  }

  async function share() {
    const url = location.origin + '/e/' + ev.id;
    const text = `${ev.title} · ${cap(dateLong(d))} en ${place.name || ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: ev.title, text, url }); return; } catch { /* cancelado */ }
    }
    openSheet(`<h3>Compartir</h3><p class="muted mt-s">${esc(text)}</p>
      <div class="acts"><a class="btn btn-primary" href="${waShare(text + '\n' + url)}" target="_blank" rel="noopener">${I.chat} Enviar por WhatsApp</a>
      <button class="btn btn-ghost" data-copy="${esc(url)}" data-copy-msg="Enlace copiado">${I.copy} Copiar enlace</button></div>`);
  }

  main.addEventListener('click', onClick);
  function onClick(e) {
    const t = e.target.closest('[data-type],[data-qty],[data-act]');
    if (!t || !main.contains(t)) return;
    if (t.dataset.type) {
      sel = { typeId: t.dataset.type, qty: Math.min(sel.qty, Math.min(10, types.find((x) => x.id === t.dataset.type)?.left ?? 10)) || 1 };
      repaint();
    } else if (t.dataset.qty) {
      sel.qty = Math.max(1, Math.min(maxQty(), sel.qty + Number(t.dataset.qty)));
      repaint();
    } else if (t.dataset.act === 'buy') {
      startBuy();
    } else if (t.dataset.act === 'share') {
      share();
    }
  }

  // Volvió de entrar a su cuenta: abre la compra directamente.
  if (query.get('comprar') && !closed) {
    history.replaceState(null, '', '/e/' + ev.id);
    await whenReady();
    if (current() && state.user) startBuy();
  }

  return () => main.removeEventListener('click', onClick);
}

