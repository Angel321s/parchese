// Elige el backend: Firebase si hay configuración en .env; si no, el modo demo en el navegador.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  useEmulators: env.VITE_USE_EMULATORS === 'true',
};

export const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Enlace vivo: los módulos que importan `api` ven el backend una vez cargado.
export let api = null;

export async function loadBackend() {
  const mod = hasFirebase ? await import('./firestore.js') : await import('./memory.js');
  await mod.init(firebaseConfig);
  api = mod;
  return api;
}
