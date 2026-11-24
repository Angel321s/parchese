// Crear o editar un evento del bar.
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, errorMessage, toast, confirmDialog } from '../ui.js';
import { esc, isoDate, isoTime, parseBogota, bogotaParts, fromBogota, newTypeId } from '../lib/format.js';

function nextSaturdayNight() {
  const p = bogotaParts(new Date());
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  let add = (6 - weekday + 7) % 7;
  if (add < 2) add += 7;
  return fromBogota(p.y, p.m, p.d + add, 21, 0);
}

const digits = (s) => parseInt(String(s).replace(/\D/g, ''), 10);

export async function render({ params, query, main, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    return;
  }
  const isNew = params.id === 'nuevo';
  let ev;
  if (isNew) {
    ev = {
      barId: query.get('bar') || state.myBars[0]?.id,
      title: '', about: '', startsAt: nextSaturdayNight(), genres: [], lineup: [], status: 'draft', sold: {},
      ticketTypes: { [newTypeId()]: { name: 'General', desc: '', price: 30000, capacity: 150, order: 0 } },
    };
  } else {
    main.innerHTML = loadingBlock();
    ev = await api.getEvent(params.id);
    if (!current()) return;
    if (!ev) {
      main.innerHTML = emptyBlock('No encontramos este evento', '', '<a class="btn btn-ghost" href="/panel?tab=eventos">Volver al panel</a>');
      return;
    }
  }
  const bar = state.myBars.find((b) => b.id === ev.barId);
  if (!bar) {
    main.innerHTML = emptyBlock('No tienes acceso a este bar', 'Entra con el correo del personal del bar.', '<a class="btn btn-ghost" href="/panel">Ir al panel</a>');
    return;
  }
  setTitle(isNew ? 'Nuevo evento' : 'Editar evento');
  const back = `/panel?bar=${encodeURIComponent(bar.id)}&tab=eventos`;
  let status = ev.status === 'cancelled' ? 'cancelled' : ev.status;
  let types = Object.entries(ev.ticketTypes || {})
    .map(([id, t]) => ({ id, ...t, sold: ev.sold?.[id] || 0 }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const typeRow = (t) => `<div class="ttype" data-tid="${esc(t.id)}">
      <div class="form-grid">
        <div class="field w2"><span class="lbl">Nombre</span><input class="input" data-f="name" aria-label="Nombre de la entrada" maxlength="40" value="${esc(t.name)}" placeholder="General"></div>
        <div class="field"><span class="lbl">Precio ($)</span><input class="input" data-f="price" aria-label="Precio" inputmode="numeric" value="${t.price ?? 0}"></div>
        <div class="field"><span class="lbl">Cupo</span><input class="input" data-f="capacity" aria-label="Cupo" inputmode="numeric" value="${t.capacity ?? 0}"></div>
        <div class="field full"><span class="lbl">Descripción (opcional)</span><input class="input" data-f="desc" aria-label="Descripción" maxlength="80" value="${esc(t.desc || '')}" placeholder="Ingreso hasta las 10:00 p. m."></div>
      </div>
      <div class="row mt-s">${t.sold ? `<span class="muted sm">${t.sold} vendidas · no se puede quitar</span>` : ''}<span class="sp"></span>
        ${t.sold ? '' : `<button type="button" class="link sm" data-act="rm-type" data-tid="${esc(t.id)}">Quitar</button>`}</div>
    </div>`;

  main.innerHTML = `
    <a class="back" href="${back}">${I.back} Eventos</a>
    <h1 class="h-page">${isNew ? 'Nuevo evento' : 'Editar evento'}</h1>
    <p class="muted mt-s">${esc(bar.name)}${status === 'cancelled' ? ' · <span class="tag danger">Cancelado</span>' : ''}</p>
    <form id="ef" novalidate>
      <div class="section-card"><h2>El evento</h2>
        <div class="form-grid">
          <div class="field full"><label for="ef-title">Nombre del evento</label><input class="input" id="ef-title" maxlength="80" value="${esc(ev.title)}" placeholder="Noche de salsa"></div>
          <div class="field"><label for="ef-date">Fecha</label><input class="input" id="ef-date" type="date" value="${isoDate(ev.startsAt)}"></div>
          <div class="field"><label for="ef-time">Hora de inicio</label><input class="input" id="ef-time" type="time" value="${isoTime(ev.startsAt)}"></div>
          <div class="field full"><label for="ef-about">Descripción</label><textarea class="input" id="ef-about" maxlength="600" placeholder="Qué va a pasar esa noche">${esc(ev.about || '')}</textarea></div>
          <div class="field"><label for="ef-genres">Géneros</label><input class="input" id="ef-genres" value="${esc((ev.genres || []).join(', '))}" placeholder="Salsa, Crossover"><p class="hint">Separados por coma.</p></div>
          <div class="field"><label for="ef-lineup">Line-up</label><textarea class="input" id="ef-lineup" style="min-height:72px" placeholder="Un artista por línea">${esc((ev.lineup || []).join('\n'))}</textarea></div>
        </div>
      </div>
      <div class="section-card"><h2>Entradas</h2>
        <p class="muted sm mt-s">Precio 0 = gratis (por ejemplo, lista de invitados). Cupo 0 = sin límite.</p>
        <div id="types">${types.map(typeRow).join('')}</div>
        <button type="button" class="btn btn-ghost sm mt" data-act="add-type">${I.plus} Agregar tipo de entrada</button>
      </div>
      ${status === 'cancelled' ? '' : `<div class="section-card"><h2>Publicación</h2>
        <div class="seg mt"><button type="button" class="segb ${status === 'draft' ? 'on' : ''}" data-status="draft">Borrador</button>
          <button type="button" class="segb ${status === 'published' ? 'on' : ''}" data-status="published">Publicado</button></div>
        <p class="hint">Los borradores solo los ve tu equipo. Publicado = aparece en la cartelera y se puede comprar.</p></div>`}
      <p class="msg-err" id="ef-err" hidden></p>
      <div class="acts"><button class="btn btn-primary" id="ef-save">Guardar</button><a class="btn btn-ghost" href="${back}">Cancelar</a></div>
      ${!isNew && ev.status === 'draft' ? '<div class="acts mt-l"><button type="button" class="btn btn-danger sm" data-act="delete">Eliminar borrador</button></div>' : ''}
      ${!isNew && ev.status === 'published' ? '<div class="acts mt-l"><button type="button" class="btn btn-danger sm" data-act="cancel">Cancelar el evento</button></div>' : ''}
    </form>`;

  const form = main.querySelector('#ef');
  const errBox = main.querySelector('#ef-err');
  const fail = (m) => {
    errBox.textContent = m;
    errBox.hidden = false;
    errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  function readTypes() {
    return [...form.querySelectorAll('.ttype')].map((row, i) => {
      const id = row.dataset.tid;
      const get = (f) => row.querySelector(`[data-f="${f}"]`).value;
      return {
        id,
        name: get('name').trim(),
        desc: get('desc').trim(),
        price: digits(get('price')),
        capacity: digits(get('capacity')),
        order: i,
        sold: types.find((t) => t.id === id)?.sold || 0,
      };
    });
  }

  function collect() {
    const title = form.querySelector('#ef-title').value.trim();
    const startsAt = parseBogota(form.querySelector('#ef-date').value, form.querySelector('#ef-time').value);
    const list = readTypes();
    if (!title) return fail('Ponle nombre al evento.');
    if (!startsAt) return fail('Revisa la fecha y la hora.');
    if (!list.length) return fail('Agrega al menos un tipo de entrada.');
    for (const t of list) {
      if (!t.name) return fail('Cada entrada necesita un nombre.');
      if (!Number.isInteger(t.price) || t.price < 0) return fail(`Revisa el precio de "${t.name}".`);
      if (!Number.isInteger(t.capacity) || t.capacity < 0) return fail(`Revisa el cupo de "${t.name}".`);
      if (t.capacity > 0 && t.capacity < t.sold) return fail(`"${t.name}" ya tiene ${t.sold} vendidas: el cupo no puede ser menor.`);
    }
    const ticketTypes = {};
    for (const t of list) ticketTypes[t.id] = { name: t.name, desc: t.desc, price: t.price, capacity: t.capacity, order: t.order };
    return {
      barId: bar.id,
      barName: bar.name,
      barZone: bar.zone || '',
      barAddress: bar.address || '',
      title,
      about: form.querySelector('#ef-about').value.trim(),
      startsAt,
      genres: form.querySelector('#ef-genres').value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6),
      lineup: form.querySelector('#ef-lineup').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12),
      ticketTypes,
      status,
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const data = collect();
    if (!data) return;
    if (isNew && data.status === 'published' && data.startsAt.getTime() < Date.now() - 6 * 3600e3) {
      return fail('La fecha del evento ya pasó. Revisa la fecha.');
    }
    const btn = main.querySelector('#ef-save');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await api.saveEvent(isNew ? null : ev.id, data);
      toast(data.status === 'published' ? 'Evento publicado' : 'Evento guardado');
      navigate(back);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      fail(errorMessage(err));
    }
  });

  async function onClick(e) {
    const t = e.target.closest('[data-act],[data-status]');
    if (!t || !main.contains(t)) return;
    if (t.dataset.status) {
      status = t.dataset.status;
      main.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('on', b === t));
      return;
    }
    if (t.dataset.act === 'add-type') {
      types = readTypes();
      const nt = { id: newTypeId(), name: '', desc: '', price: 0, capacity: 0, order: types.length, sold: 0 };
      types.push(nt);
      main.querySelector('#types').insertAdjacentHTML('beforeend', typeRow(nt));
      main.querySelector(`[data-tid="${nt.id}"] [data-f="name"]`).focus();
    } else if (t.dataset.act === 'rm-type') {
      main.querySelector(`.ttype[data-tid="${t.dataset.tid}"]`)?.remove();
      types = readTypes();
    } else if (t.dataset.act === 'delete') {
      const ok = await confirmDialog({ title: '¿Eliminar este borrador?', body: 'No se puede deshacer.', ok: 'Eliminar', danger: true });
      if (!ok) return;
      try {
        await api.deleteEvent(ev.id);
        toast('Borrador eliminado');
        navigate(back);
      } catch (err) {
        toast(errorMessage(err), 'err');
      }
    } else if (t.dataset.act === 'cancel') {
      const sold = Object.values(ev.sold || {}).reduce((a, b) => a + b, 0);
      const ok = await confirmDialog({
        title: '¿Cancelar este evento?',
        body: `Se deja de vender y desaparece de la cartelera.${sold ? ` Ya hay ${sold} entradas: devuélveles la plata y registra cada devolución en Puerta, buscando su código.` : ''}`,
        ok: 'Cancelar el evento',
        cancel: 'Volver',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.saveEvent(ev.id, { status: 'cancelled' });
        toast('Evento cancelado');
        navigate(back);
      } catch (err) {
        toast(errorMessage(err), 'err');
      }
    }
  }
  main.addEventListener('click', onClick);
  return () => main.removeEventListener('click', onClick);
}

