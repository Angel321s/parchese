import { api } from '../data/index.js';
import { eventCard, I, loadingBlock, emptyBlock, setTitle } from '../ui.js';
import { esc, grad, waLink, BUSINESS_WHATSAPP } from '../lib/format.js';

export async function render({ main, current }) {
  setTitle('');
  main.innerHTML = `
    <section class="hero">
      <p class="kicker"><span class="b"></span> Bogotá · esta semana</p>
      <h1>El plan de rumba, <span class="neon">reservado</span> desde el celular.</h1>
      <p class="lead">Encuentra el evento, aparta tu entrada o tu mesa y paga por Bre-B directo al bar. En la puerta muestras tu QR y listo.</p>
    </section>
    <section><div class="sec-h"><h2>Próximos eventos</h2></div><div id="evs">${loadingBlock()}</div></section>
    <section id="bars-sec" hidden><div class="sec-h"><h2>Bares</h2></div><div id="bars" class="grid c3"></div></section>
    <section class="band b3 wide mt-l">
      <div><h3>¿Tienes un bar o una discoteca?</h3>
        <p>Publica tus eventos, vende entradas con QR y recibe los pagos directo en tu cuenta. Tus primeros 3 eventos van sin comisión.</p></div>
      <a class="btn btn-primary" href="${waLink(BUSINESS_WHATSAPP, 'Hola, tengo un bar y quiero saber más de Párchese')}" target="_blank" rel="noopener">${I.chat} Escríbenos por WhatsApp</a>
    </section>`;

  const [events, bars] = await Promise.all([
    api.listUpcomingEvents().catch((e) => (console.error(e), null)),
    api.listActiveBars().catch(() => []),
  ]);
  if (!current()) return;

  const active = new Set(bars.map((b) => b.id));
  const evs = main.querySelector('#evs');
  if (events === null) {
    evs.innerHTML = emptyBlock('No pudimos cargar la cartelera', 'Revisa tu conexión y recarga la página.');
  } else {
    const list = events.filter((e) => active.has(e.barId));
    evs.innerHTML = list.length
      ? `<div class="grid c3">${list.map(eventCard).join('')}</div>`
      : emptyBlock('Pronto publicamos los primeros eventos', 'Estamos sumando los primeros bares de Bogotá.');
  }

  if (bars.length) {
    main.querySelector('#bars-sec').hidden = false;
    main.querySelector('#bars').innerHTML = bars
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (b) => `<a class="bc" href="/b/${encodeURIComponent(b.id)}">
          <div class="b-art" style="background:${grad(b.name)}"><div class="grain"></div><div class="b-ini">${esc(b.name.slice(0, 1))}</div></div>
          <div class="bc-b"><h3>${esc(b.name)}</h3><p class="muted sm">${esc([b.zone, b.city || 'Bogotá'].filter(Boolean).join(' · '))}</p></div>
        </a>`,
      )
      .join('');
  }
}
