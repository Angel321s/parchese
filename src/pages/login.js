// Entrar o crear cuenta: Google o correo y contraseña.
// Al iniciar sesión, main.js vuelve a pintar esta página y aquí se redirige a "next".
import { api } from '../data/index.js';
import { state, whenReady } from '../state.js';
import { navigate } from '../router.js';
import { I, setTitle, errorMessage, toast, openSheet, closeSheet } from '../ui.js';

function safeNext(query) {
  const n = query.get('next') || '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export async function render({ main, query, current }) {
  const next = safeNext(query);
  await whenReady();
  if (!current()) return;
  if (state.user) {
    navigate(next, { replace: true });
    return;
  }
  setTitle('Entrar');
  main.innerHTML = `
    <div class="auth">
      <h1>Entra a Párchese</h1>
      <p class="muted mt-s">Para reservar, pagar y tener tus entradas a la mano.</p>
      <button class="btn btn-google block mt" data-act="google">${I.google} Seguir con Google</button>
      <div class="or"><span>o con tu correo</span></div>
      <div class="seg" role="tablist">
        <button class="segb on" data-tab="in" role="tab">Ya tengo cuenta</button>
        <button class="segb" data-tab="up" role="tab">Crear cuenta</button>
      </div>
      <form id="f-in" class="box mt" novalidate>
        <div class="field"><label for="in-email">Correo</label><input class="input" id="in-email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="field"><label for="in-pass">Contraseña</label><input class="input" id="in-pass" type="password" autocomplete="current-password"></div>
        <button class="btn btn-primary block mt">Entrar</button>
        <button type="button" class="link sm mt" data-act="forgot" style="display:block;margin-top:14px">Olvidé mi contraseña</button>
      </form>
      <form id="f-up" class="box mt" novalidate hidden>
        <div class="field"><label for="up-name">Tu nombre</label><input class="input" id="up-name" autocomplete="name" maxlength="60"></div>
        <div class="field"><label for="up-email">Correo</label><input class="input" id="up-email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="field"><label for="up-pass">Contraseña</label><input class="input" id="up-pass" type="password" autocomplete="new-password">
          <p class="hint">Mínimo 6 caracteres.</p></div>
        <button class="btn btn-primary block mt">Crear cuenta</button>
      </form>
      <p class="msg-err" id="auth-err" hidden></p>
    </div>`;

  const errBox = main.querySelector('#auth-err');
  const showErr = (e) => {
    errBox.textContent = typeof e === 'string' ? e : errorMessage(e);
    errBox.hidden = false;
  };
  const busy = (form, on, label) => {
    const b = form.querySelector('button.btn-primary');
    b.disabled = on;
    b.textContent = on ? 'Un momento…' : label;
  };

  main.querySelector('#f-in').addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const f = e.currentTarget;
    busy(f, true, 'Entrar');
    try {
      await api.signInEmail(f.querySelector('#in-email').value, f.querySelector('#in-pass').value);
    } catch (err) {
      busy(f, false, 'Entrar');
      showErr(err);
    }
  });

  main.querySelector('#f-up').addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const f = e.currentTarget;
    const name = f.querySelector('#up-name').value.trim();
    if (name.length < 2) return showErr('Escribe tu nombre.');
    busy(f, true, 'Crear cuenta');
    try {
      await api.signUpEmail(name, f.querySelector('#up-email').value, f.querySelector('#up-pass').value);
    } catch (err) {
      busy(f, false, 'Crear cuenta');
      showErr(err);
    }
  });

  main.addEventListener('click', onClick);
  async function onClick(e) {
    const t = e.target.closest('[data-tab],[data-act]');
    if (!t || !main.contains(t)) return;
    if (t.dataset.tab) {
      main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === t));
      main.querySelector('#f-in').hidden = t.dataset.tab !== 'in';
      main.querySelector('#f-up').hidden = t.dataset.tab !== 'up';
      errBox.hidden = true;
    } else if (t.dataset.act === 'google') {
      errBox.hidden = true;
      try {
        await api.signInGoogle();
      } catch (err) {
        if (err.code === 'demo/google') demoGoogle();
        else showErr(err);
      }
    } else if (t.dataset.act === 'forgot') {
      const email = main.querySelector('#in-email').value.trim();
      if (!email) return showErr('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
      try {
        await api.resetPassword(email);
        toast('Te enviamos un correo para cambiar la contraseña');
      } catch (err) {
        showErr(err);
      }
    }
  }

  function demoGoogle() {
    const sheet = openSheet(`<h3>Google (modo demo)</h3>
      <p class="muted mt-s">En el sitio real se abre la ventana de Google. Aquí lo simulamos.</p>
      <form id="dg"><div class="field"><label for="dg-name">Nombre</label><input class="input" id="dg-name" value="Cliente de prueba"></div>
      <div class="field"><label for="dg-email">Correo de Google</label><input class="input" id="dg-email" type="email" value="cliente@ejemplo.com"></div>
      <button class="btn btn-primary block mt">Continuar</button></form>`);
    sheet.querySelector('#dg').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.demoGoogle(sheet.querySelector('#dg-name').value, sheet.querySelector('#dg-email').value);
        closeSheet();
      } catch (err) {
        toast(errorMessage(err), 'err');
      }
    });
  }

  return () => main.removeEventListener('click', onClick);
}

