// Mi entrada: instrucciones de pago por Bre-B mientras está pendiente, y el QR cuando el bar confirma.
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, statusChip, qrSvg, errorMessage, toast } from '../ui.js';
import { esc, money, dateLong, timeShort, cap, mapsUrl, grad, waLink, ago } from '../lib/format.js';

export async function render({ params, main, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=' + encodeURIComponent(location.pathname), { replace: true });
    return;
  }
  setTitle('Mi entrada');
  main.innerHTML = loadingBlock();
  let bar;
  let lastSig = '';

  const unsub = api.watchOrder(
    params.code,
    async (o) => {
      if (!current()) return;
      if (!o) {
        main.innerHTML = emptyBlock(
          'No encontramos esta entrada',
          'Revisa el enlace o entra con la misma cuenta con la que hiciste la reserva.',
          '<a class="btn btn-ghost" href="/mis-entradas">Ver mis entradas</a>',
        );
        return;
      }
      if (bar === undefined) bar = await api.getBar(o.barId).catch(() => null);
      const sig = [o.status, o.paidClaimAt ? 1 : 0].join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      await paint(o);
    },
    (e) => {
      main.innerHTML = emptyBlock('No pudimos cargar tu entrada', esc(errorMessage(e)));
    },
  );

  async function paint(o) {
    const d = new Date(o.eventStartsAt);
    const head = `<a class="back" href="/mis-entradas">${I.back} Mis entradas</a>
      <div class="row wrapf">${statusChip(o.status)}<span class="muted sm">Pedido ${esc(o.code)}</span></div>
      <h1 class="h-page mt-s">${esc(o.eventTitle)}</h1>
      <p class="muted mt-s">${esc(cap(dateLong(d)))} · ${esc(timeShort(d))} · ${esc(o.barName || bar?.name || '')}</p>`;
    const contact = bar?.whatsapp
      ? `<a class="btn btn-ghost" href="${waLink(bar.whatsapp, `Hola, les escribo por mi pedido ${o.code} de Párchese`)}" target="_blank" rel="noopener">${I.chat} Escribirle al bar</a>`
      : '';

    if (o.status === 'pendiente') {
      main.innerHTML = head + payHtml(o, bar, contact);
      const form = main.querySelector('#claim');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Avisando al bar…';
        try {
          await api.claimPaid(o.code, form.querySelector('#payer').value.trim());
          toast('Listo, le avisamos al bar');
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Ya pagué';
          toast(errorMessage(err), 'err');
        }
      });
      return;
    }

    if (o.status === 'confirmado' || o.status === 'usado') {
      const qr = await qrSvg(o.code);
      if (!current()) return;
      const used = o.status === 'usado';
      main.innerHTML = head + `
        <div class="ticket mt ${used ? 'used' : ''}">
          <div class="t-art" style="background:${grad(o.eventTitle)}"><div class="grain"></div>
            <small>${esc(o.barName || '')}</small><b>${esc(o.eventTitle)}</b><small>${esc(cap(dateLong(d)))} · ${esc(timeShort(d))}</small></div>
          <div class="t-body">
            <div class="qrbox" aria-label="Código QR de tu entrada">${qr}</div>
            <p class="code big-code">${esc(o.code)}</p>
            ${used ? `<span class="stamp-used">Ya entraste${o.usedAt ? ' · ' + esc(timeShort(new Date(o.usedAt))) : ''}</span>`
              : `<p class="muted mt-s">Muestra este QR en la puerta. Sirve para ${o.qty} ${o.qty === 1 ? 'persona' : 'personas'} y se usa una sola vez.</p>`}
            <div class="t-rows">
              <div class="r"><span>A nombre de</span><b>${esc(o.name)}</b></div>
              <div class="r"><span>Entrada</span><span>${esc(o.typeName)} × ${o.qty}</span></div>
              <div class="r"><span>Valor</span><span class="num">${o.total === 0 ? 'Gratis' : money(o.total)}</span></div>
            </div>
            <div class="acts">
              <a class="btn btn-ghost" href="${mapsUrl(bar || { name: o.barName })}" target="_blank" rel="noopener">${I.pin} Cómo llegar</a>
              <a class="btn btn-ghost" href="/e/${encodeURIComponent(o.eventId)}">Ver el evento</a>
            </div>
          </div>
        </div>`;
      return;
    }

    if (o.status === 'rechazado') {
      main.innerHTML = head + `<div class="door bad mt"><h3>El bar no encontró tu pago</h3>
        <p class="mt-s">Si ya pagaste, escríbele al bar con tu comprobante y el código <b class="code">${esc(o.code)}</b>. Si no alcanzaste a pagar, puedes hacer una reserva nueva.</p>
        <div class="acts">${contact}<a class="btn btn-ghost" href="/e/${encodeURIComponent(o.eventId)}">Volver al evento</a></div></div>`;
      return;
    }

    main.innerHTML = head + `<div class="door mt"><h3>Pago devuelto</h3>
      <p class="mt-s muted">El bar registró la devolución de tu pago para esta reserva.</p><div class="acts">${contact}</div></div>`;
  }

  return unsub;
}

function payHtml(o, bar, contact) {
  const key = bar?.brebKey || '';
  const holder = bar?.brebName || bar?.name || '';
  return `<div class="cols mt">
    <div class="box pay">
      <p class="kicker">Paga por Bre-B</p>
      <div class="big num">${money(o.total)}</div>
      <p class="muted">${esc(o.typeName)} × ${o.qty}</p>
      <ol class="pay-steps">
        <li><b>Abre la app de tu banco o billetera</b> y elige pagar o transferir con llave Bre-B.</li>
        <li><b>Llave del bar</b>
          ${key
            ? `<div class="keyline"><span class="keyval" id="breb-key">${esc(key)}</span>
                <button class="mini" data-copy="${esc(key)}" data-copy-msg="Llave copiada">${I.copy} Copiar</button></div>`
            : '<p class="muted sm mt-s">El bar todavía no tiene su llave registrada. Escríbele antes de pagar.</p>'}
          ${key && holder ? `<p class="muted sm mt-s">Antes de pagar, revisa que salga a nombre de <b>${esc(holder)}</b>.</p>` : ''}</li>
        <li><b>Valor</b>
          <div class="keyline"><span class="keyval num">${money(o.total)}</span>
            <button class="mini" data-copy="${o.total}" data-copy-msg="Valor copiado">${I.copy} Copiar</button></div></li>
        <li><b>En el mensaje o descripción</b>, escribe tu código
          <div class="keyline"><span class="keyval">${esc(o.code)}</span>
            <button class="mini" data-copy="${esc(o.code)}" data-copy-msg="Código copiado">${I.copy} Copiar</button></div>
          <p class="muted sm mt-s">Si tu app no deja escribir mensaje, no pasa nada: el bar lo busca por tu nombre y el valor.</p></li>
      </ol>
      ${o.paidClaimAt
        ? `<div class="waiting"><div class="spin sm"></div><div><b>Le avisamos al bar ${esc(ago(new Date(o.paidClaimAt)))}.</b>
            <p class="muted sm mt-s">Cuando confirme tu pago, aquí mismo aparece tu QR. Puedes cerrar esta página: tu entrada queda en "Mis entradas".</p></div></div>`
        : `<form id="claim" class="mt">
            <div class="field"><label for="payer">¿A nombre de quién está la cuenta con la que pagaste?</label>
              <input class="input" id="payer" maxlength="60" value="${esc(o.name)}"></div>
            <button class="btn btn-primary block mt">Ya pagué</button>
          </form>`}
    </div>
    <div>
      <div class="warn">${I.shield}<span>Párchese no recibe tu plata: el pago va directo a la cuenta del bar. Paga solo a la llave que ves aquí.</span></div>
      ${contact ? `<div class="acts">${contact}</div>` : ''}
    </div>
  </div>`;
}
