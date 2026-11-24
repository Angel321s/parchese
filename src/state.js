// Estado compartido de la sesión: usuario, si es administración y de qué bares es personal.
export const state = {
  user: null,
  authReady: false,
  isAdmin: false,
  myBars: [],
  rolesReady: false,
};

const subs = new Set();

export function onState(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of subs) fn(state);
}

// Espera a que se sepa si hay sesión (y, si la hay, sus roles).
export function whenReady() {
  if (state.authReady && (!state.user || state.rolesReady)) return Promise.resolve(state);
  return new Promise((resolve) => {
    const off = onState((s) => {
      if (s.authReady && (!s.user || s.rolesReady)) {
        off();
        resolve(s);
      }
    });
  });
}
