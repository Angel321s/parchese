import { api } from '../data/index.js';
import { I, eventCard, loadingBlock, emptyBlock, setTitle } from '../ui.js';
import { esc, grad, mapsUrl } from '../lib/format.js';

export async function render({ params, main, current }) {
  main.innerHTML = loadingBlock();
  const bar = await api.getBar(params.id);
  if (!current()) return;
  if (!bar) {
    setTitle('Bar no encontrado');
    main.innerHTML = emptyBlock('No encontramos este bar', '', '<a class="btn btn-ghost" href="/">Ver la cartelera</a>');
    return;
  }
  setTitle(bar.name);
  main.innerHTML = `
    <a class="back" href="/">${I.back} Cartelera</a>
    <div class="bhero" style="background:${grad(bar.name)}"><div class="grain"></div><div class="b-ini">${esc(bar.name.slice(0, 1))}</div>
      <p class="kicker" style="color:#fff">${esc([bar.zone, bar.city || 'Bogotá'].filter(Boolean).join(' · '))}</p>
      <h1 class="h-page">${esc(bar.name)}</h1></div>
    <div class="cols mt">
      <div>
        ${bar.about ? `<p>${esc(bar.about)}</p>` : ''}
        <h2 class="sub-h">Próximos eventos</h2><div id="evs">${loadingBlock()}</div>
      </div>
      <aside class="side"><div class="box">
        <div class="kv">${I.pin}<div class="v"><b>${esc(bar.address || '')}</b><p class="muted">${esc(bar.zone || '')}</p>
          <a class="link" href="${mapsUrl(bar)}" target="_blank" rel="noopener">Cómo llegar en Google Maps</a></div></div>
        ${bar.hours ? `<div class="kv">${I.clock}<div class="v">${esc(bar.hours)}</div></div>` : ''}
        ${bar.rules?.length ? `<div class="kv">${I.check}<div class="v"><ul class="rules">${bar.rules.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ul></div></div>` : ''}
      </div></aside>
    </div>`;
  const events = await api.listBarPublishedEvents(bar.id).catch(() => []);
  if (!current()) return;
  const upcoming = events.filter((e) => e.startsAt.getTime() > Date.now() - 6 * 3600e3);
  main.querySelector('#evs').innerHTML = upcoming.length
    ? `<div class="grid c2">${upcoming.map(eventCard).join('')}</div>`
    : emptyBlock('Sin eventos publicados por ahora', 'Vuelve pronto.');
}
