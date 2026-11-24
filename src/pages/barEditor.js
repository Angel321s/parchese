// Crear o editar un bar aliado (solo administración).
import { api } from '../data/index.js';
import { state, setState, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, loadingBlock, emptyBlock, setTitle, errorMessage, toast } from '../ui.js';
import { esc, slugify, isoDate, parseBogota } from '../lib/format.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function render({ params, main, current }) {
  await whenReady();
  if (!current()) return;
  if (!state.user) {
    navigate('/entrar?next=' + encodeURIComponent(location.pathname), { replace: true });
    return;
  }
  if (!state.isAdmin) {
    main.innerHTML = emptyBlock('Esta sección es solo para la administración de Párchese', '');
    return;
  }
  const isNew = params.id === 'nuevo';
  let bar = { name: '', zone: '', address: '', city: 'Bogotá', about: '', hours: '', rules: [], whatsapp: '', brebKey: '', brebName: '', active: true };
  let priv = { staffEmails: [], commissionRate: 0.08, freeEvents: 3, freeWindowDays: 60, signedAt: new Date() };
  if (!isNew) {
    main.innerHTML = loadingBlock();
    const [b, p] = await Promise.all([api.getBar(params.id), api.getBarPrivate(params.id).catch(() => null)]);
    if (!current()) return;
    if (!b) {
      main.innerHTML = emptyBlock('No encontramos este bar', '', '<a class="btn btn-ghost" href="/admin">Volver</a>');
      return;
    }
    bar = { ...bar, ...b };
    priv = { ...priv, ...(p || {}) };
  }
  setTitle(isNew ? 'Nuevo bar' : bar.name);

  main.innerHTML = `
    <a class="back" href="/admin">${I.back} Administración</a>
    <h1 class="h-page">${isNew ? 'Nuevo bar' : esc(bar.name)}</h1>
    <form id="bf" novalidate>
      <div class="section-card"><h2>Lo que ve el público</h2>
        <div class="form-grid">
          <div class="field"><label for="bf-name">Nombre</label><input class="input" id="bf-name" maxlength="60" value="${esc(bar.name)}"></div>
          <div class="field"><label for="bf-id">Identificador en el enlace</label>
            <input class="input" id="bf-id" value="${esc(isNew ? '' : params.id)}" ${isNew ? '' : 'disabled'} placeholder="la-sucursal">
            <p class="hint">Queda en la dirección: parchese…/b/<b id="bf-id-prev">${esc(isNew ? '' : params.id)}</b>. No se puede cambiar después.</p></div>
          <div class="field"><label for="bf-zone">Zona</label><input class="input" id="bf-zone" maxlength="40" value="${esc(bar.zone)}" placeholder="Chapinero"></div>
          <div class="field"><label for="bf-city">Ciudad</label><input class="input" id="bf-city" maxlength="40" value="${esc(bar.city || 'Bogotá')}"></div>
          <div class="field full"><label for="bf-address">Dirección</label><input class="input" id="bf-address" maxlength="80" value="${esc(bar.address)}" placeholder="Cra. 13 #54-21"></div>
          <div class="field full"><label for="bf-about">Descripción</label><textarea class="input" id="bf-about" maxlength="500">${esc(bar.about)}</textarea></div>
          <div class="field"><label for="bf-hours">Horario</label><input class="input" id="bf-hours" maxlength="80" value="${esc(bar.hours)}" placeholder="Jueves a sábado, 8:00 p. m. a 3:00 a. m."></div>
          <div class="field"><label for="bf-wa">WhatsApp del bar</label><input class="input" id="bf-wa" type="tel" inputmode="tel" value="${esc(bar.whatsapp)}" placeholder="300 123 4567">
            <p class="hint">Para que los clientes le escriban por su reserva.</p></div>
          <div class="field full"><label for="bf-rules">Reglas de ingreso</label><textarea class="input" id="bf-rules" style="min-height:80px" placeholder="Una regla por línea">${esc((bar.rules || []).join('\n'))}</textarea></div>
          <label class="check full"><input type="checkbox" id="bf-active" ${bar.active ? 'checked' : ''}> <span>Activo: se ve en la cartelera y sus eventos se pueden comprar.</span></label>
        </div>
      </div>
      <div class="section-card"><h2>Pagos por Bre-B</h2>
        <div class="form-grid">
          <div class="field"><label for="bf-key">Llave Bre-B del bar</label><input class="input" id="bf-key" maxlength="60" value="${esc(bar.brebKey)}" placeholder="@lasucursal o NIT o celular"></div>
          <div class="field"><label for="bf-holder">A nombre de</label><input class="input" id="bf-holder" maxlength="60" value="${esc(bar.brebName)}" placeholder="La Sucursal Bar SAS">
            <p class="hint">Como le aparece al cliente en su banco antes de pagar.</p></div>
        </div>
      </div>
      <div class="section-card"><h2>Acuerdo y equipo</h2>
        <div class="form-grid">
          <div class="field full"><label for="bf-staff">Correos del personal del bar</label>
            <textarea class="input" id="bf-staff" style="min-height:80px" placeholder="Un correo por línea">${esc((priv.staffEmails || []).join('\n'))}</textarea>
            <p class="hint">Con esos correos entran al panel para confirmar pagos y validar entradas. Deben verificar su correo (con Google es automático).</p></div>
          <div class="field"><label for="bf-rate">Comisión (%)</label><input class="input" id="bf-rate" inputmode="decimal" value="${esc(String(Math.round((priv.commissionRate ?? 0.08) * 10000) / 100))}"></div>
          <div class="field"><label for="bf-signed">Fecha de firma del acuerdo</label><input class="input" id="bf-signed" type="date" value="${priv.signedAt ? isoDate(new Date(priv.signedAt)) : ''}"></div>
          <div class="field"><label for="bf-free">Eventos sin comisión</label><input class="input" id="bf-free" inputmode="numeric" value="${priv.freeEvents ?? 3}"></div>
          <div class="field"><label for="bf-window">Días de la oferta desde la firma</label><input class="input" id="bf-window" inputmode="numeric" value="${priv.freeWindowDays ?? 60}"></div>
        </div>
      </div>
      <p class="msg-err" id="bf-err" hidden></p>
      <div class="acts"><button class="btn btn-primary" id="bf-save">Guardar</button><a class="btn btn-ghost" href="/admin">Cancelar</a></div>
    </form>`;

  const form = main.querySelector('#bf');
  const val = (id) => form.querySelector(id).value.trim();
  const errBox = main.querySelector('#bf-err');
  const fail = (m) => {
    errBox.textContent = m;
    errBox.hidden = false;
    errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (isNew) {
    let touched = false;
    form.querySelector('#bf-id').addEventListener('input', (e) => {
      touched = true;
      form.querySelector('#bf-id-prev').textContent = slugify(e.target.value);
    });
    form.querySelector('#bf-name').addEventListener('input', (e) => {
      if (touched) return;
      const s = slugify(e.target.value);
      form.querySelector('#bf-id').value = s;
      form.querySelector('#bf-id-prev').textContent = s;
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const id = isNew ? slugify(val('#bf-id')) : params.id;
    const name = val('#bf-name');
    if (!name) return fail('Escribe el nombre del bar.');
    if (!/^[a-z0-9-]{3,48}$/.test(id)) return fail('El identificador debe tener entre 3 y 48 letras, números o guiones.');
    const staff = val('#bf-staff').split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = staff.find((s) => !EMAIL.test(s));
    if (bad) return fail(`"${bad}" no parece un correo válido.`);
    const rate = Number(val('#bf-rate').replace(',', '.'));
    if (!(rate >= 0 && rate <= 50)) return fail('La comisión debe estar entre 0 y 50%.');
    const freeEvents = parseInt(val('#bf-free'), 10);
    const freeWindowDays = parseInt(val('#bf-window'), 10);
    if (!(freeEvents >= 0) || !(freeWindowDays >= 0)) return fail('Revisa los eventos sin comisión y los días de la oferta.');
    const btn = main.querySelector('#bf-save');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      if (isNew && (await api.getBar(id))) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        return fail('Ya hay un bar con ese identificador. Usa otro.');
      }
      const pub = {
        name,
        zone: val('#bf-zone'),
        city: val('#bf-city') || 'Bogotá',
        address: val('#bf-address'),
        about: val('#bf-about'),
        hours: val('#bf-hours'),
        whatsapp: val('#bf-wa').replace(/[^\d+]/g, ''),
        rules: val('#bf-rules').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 10),
        brebKey: val('#bf-key'),
        brebName: val('#bf-holder'),
        active: form.querySelector('#bf-active').checked,
      };
      const signed = val('#bf-signed');
      const privData = {
        staffEmails: [...new Set(staff)],
        commissionRate: Math.round(rate * 100) / 10000,
        freeEvents,
        freeWindowDays,
        signedAt: signed ? parseBogota(signed, '12:00') : null,
      };
      await api.saveBar(id, pub, privData);
      toast('Bar guardado');
      await navigate('/admin');
      api.listMyBars().then((myBars) => setState({ myBars })).catch(() => {});
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      fail(errorMessage(err));
    }
  });
}
