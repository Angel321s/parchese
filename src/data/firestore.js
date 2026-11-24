// Backend real: Firebase Authentication + Cloud Firestore.
// Las reglas que protegen todo esto están en firestore.rules.
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, sendEmailVerification, signOut,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, writeBatch, increment, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { newOrderCode, slugify, isoDate } from '../lib/format.js';

export const mode = 'firebase';

let auth;
let db;
const authListeners = new Set();
const SIX_HOURS = 6 * 3600e3;
const err = (code, msg = code) => Object.assign(new Error(msg), { code });

export async function init(cfg) {
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
  });
  auth = getAuth(app);
  auth.languageCode = 'es';
  db = getFirestore(app);
  if (cfg.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  onAuthStateChanged(auth, () => emitAuth());
  getRedirectResult(auth).catch(() => {});
}

// ---------- conversión ----------

function toPlain(v) {
  if (v instanceof Timestamp) return v.toDate();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = toPlain(v[k]);
    return o;
  }
  return v;
}

const fromSnap = (s) => (s.exists() ? { id: s.id, ...toPlain(s.data()) } : null);
const byStart = (a, b) => a.startsAt - b.startsAt;
const byName = (a, b) => a.name.localeCompare(b.name);
const denied = (e) => e?.code === 'permission-denied';

// ---------- sesión ----------

function mapUser(u) {
  if (!u) return null;
  return {
    uid: u.uid,
    email: (u.email || '').toLowerCase(),
    emailVerified: !!u.emailVerified,
    name: u.displayName || '',
    provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password',
  };
}

function emitAuth() {
  const u = mapUser(auth.currentUser);
  for (const cb of authListeners) cb(u);
}

export function onUser(cb) {
  authListeners.add(cb);
  auth.authStateReady().then(() => cb(mapUser(auth.currentUser)));
  return () => authListeners.delete(cb);
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
  return mapUser(auth.currentUser);
}

export async function signInEmail(email, pass) {
  await signInWithEmailAndPassword(auth, String(email).trim(), pass);
  return mapUser(auth.currentUser);
}

export async function signUpEmail(name, email, pass) {
  const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), pass);
  if (name) await updateProfile(cred.user, { displayName: String(name).trim() });
  emitAuth();
  return mapUser(auth.currentUser);
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, String(email).trim());
export const signOutUser = () => signOut(auth);

export async function sendVerification() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function refreshUser() {
  const u = auth.currentUser;
  if (!u) return null;
  await u.reload();
  await u.getIdToken(true);
  emitAuth();
  return mapUser(auth.currentUser);
}

// El correo tal como viene en el token: las reglas comparan contra ese valor exacto.
const myEmail = () => auth.currentUser?.email || '';

// ---------- roles ----------

export async function checkAdmin() {
  const u = auth.currentUser;
  if (!u || !u.emailVerified) return false;
  try {
    return (await getDoc(doc(db, 'config', 'admins'))).exists();
  } catch {
    return false;
  }
}

export async function listMyBars() {
  const u = auth.currentUser;
  if (!u || !u.emailVerified) return [];
  if (await checkAdmin()) return (await getDocs(collection(db, 'bars'))).docs.map(fromSnap).sort(byName);
  const priv = await getDocs(query(collection(db, 'barsPrivate'), where('staffEmails', 'array-contains', myEmail())));
  const bars = await Promise.all(priv.docs.map((d) => getDoc(doc(db, 'bars', d.id)).then(fromSnap).catch(() => null)));
  return bars.filter(Boolean).sort(byName);
}

// ---------- bares ----------

export async function listActiveBars() {
  const s = await getDocs(query(collection(db, 'bars'), where('active', '==', true)));
  return s.docs.map(fromSnap);
}

export async function getBar(id) {
  try {
    return fromSnap(await getDoc(doc(db, 'bars', id)));
  } catch (e) {
    if (denied(e)) return null;
    throw e;
  }
}

export async function getBarPrivate(id) {
  return fromSnap(await getDoc(doc(db, 'barsPrivate', id)));
}

export async function listAllBars() {
  return (await getDocs(collection(db, 'bars'))).docs.map(fromSnap).sort(byName);
}

export async function saveBar(id, pub, priv) {
  const b = writeBatch(db);
  b.set(doc(db, 'bars', id), { ...pub, updatedAt: serverTimestamp() }, { merge: true });
  b.set(doc(db, 'barsPrivate', id), { ...priv, updatedAt: serverTimestamp() }, { merge: true });
  await b.commit();
  return id;
}

// ---------- eventos ----------

export async function listUpcomingEvents() {
  const from = Timestamp.fromMillis(Date.now() - SIX_HOURS);
  const s = await getDocs(
    query(collection(db, 'events'), where('status', '==', 'published'), where('startsAt', '>=', from), orderBy('startsAt')),
  );
  return s.docs.map(fromSnap);
}

export async function listBarPublishedEvents(barId) {
  const s = await getDocs(query(collection(db, 'events'), where('barId', '==', barId), where('status', '==', 'published')));
  return s.docs.map(fromSnap).sort(byStart);
}

export async function getEvent(id) {
  try {
    return fromSnap(await getDoc(doc(db, 'events', id)));
  } catch (e) {
    if (denied(e)) return null;
    throw e;
  }
}

export async function listBarEvents(barId) {
  const s = await getDocs(query(collection(db, 'events'), where('barId', '==', barId)));
  return s.docs.map(fromSnap).sort(byStart);
}

const EDITABLE = ['title', 'about', 'startsAt', 'status', 'genres', 'lineup', 'ticketTypes', 'barName', 'barZone', 'barAddress'];

export async function saveEvent(id, data) {
  const fields = {};
  for (const k of EDITABLE) if (k in data) fields[k] = data[k];
  if (id) {
    // updateDoc no toca "sold" ni "lastOrderId", que suman las compras.
    await updateDoc(doc(db, 'events', id), { ...fields, updatedAt: serverTimestamp() });
    return id;
  }
  const base = slugify(data.title) + '-' + isoDate(new Date(data.startsAt));
  for (let n = 1; n < 30; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const ref = doc(db, 'events', candidate);
    let taken = true;
    try {
      taken = (await getDoc(ref)).exists();
    } catch (e) {
      if (!denied(e)) throw e;
    }
    if (taken) continue;
    await setDoc(ref, { barId: data.barId, ...fields, sold: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return candidate;
  }
  throw err('aborted', 'No se pudo crear el evento');
}

export const deleteEvent = (id) => deleteDoc(doc(db, 'events', id));

// ---------- pedidos ----------

export async function createOrder({ event, typeId, qty, name, phone, barName }) {
  const u = auth.currentUser;
  if (!u) throw err('unauthenticated');
  const tt = event.ticketTypes[typeId];
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newOrderCode();
    const total = tt.price * qty;
    const b = writeBatch(db);
    b.set(doc(db, 'orders', code), {
      uid: u.uid, code, eventId: event.id, barId: event.barId, typeId, typeName: tt.name, qty,
      unitPrice: tt.price, total, status: total === 0 ? 'confirmado' : 'pendiente',
      name: String(name).trim(), phone: String(phone).trim(), email: (u.email || '').toLowerCase(), consent: true,
      createdAt: serverTimestamp(), eventTitle: event.title, eventStartsAt: event.startsAt, barName: barName || '',
    });
    b.update(doc(db, 'events', event.id), { [`sold.${typeId}`]: increment(qty), lastOrderId: code });
    try {
      await b.commit();
      return code;
    } catch (e) {
      if (!denied(e)) throw e;
      // Las reglas lo rechazaron: ¿se acabó el cupo, cerró el evento o cambió? Si no, el código ya existía.
      const fresh = await getEvent(event.id);
      if (!fresh || fresh.status !== 'published' || Date.now() > fresh.startsAt.getTime() + SIX_HOURS) throw err('event-closed');
      const t = fresh.ticketTypes?.[typeId];
      if (!t) throw err('event-changed');
      if (t.capacity > 0 && (fresh.sold?.[typeId] || 0) + qty > t.capacity) throw err('sold-out');
      if (t.price !== tt.price || t.name !== tt.name || fresh.title !== event.title || +fresh.startsAt !== +event.startsAt) {
        throw err('event-changed');
      }
    }
  }
  throw err('permission-denied');
}

export function watchOrder(code, cb, onError) {
  return onSnapshot(
    doc(db, 'orders', code),
    (s) => cb(fromSnap(s)),
    (e) => (denied(e) ? cb(null) : onError?.(e)),
  );
}

export async function getOrder(code) {
  try {
    return fromSnap(await getDoc(doc(db, 'orders', code)));
  } catch (e) {
    if (denied(e)) return null;
    throw e;
  }
}

export const claimPaid = (code, payerName) =>
  updateDoc(doc(db, 'orders', code), { paidClaimAt: serverTimestamp(), payerName: String(payerName || '').slice(0, 60) });

export async function listMyOrders() {
  const u = auth.currentUser;
  if (!u) return [];
  const s = await getDocs(query(collection(db, 'orders'), where('uid', '==', u.uid)));
  return s.docs.map(fromSnap).sort((a, b) => b.createdAt - a.createdAt);
}

export function watchBarOrders(barId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'orders'), where('barId', '==', barId)),
    (s) => cb(s.docs.map(fromSnap)),
    (e) => onError?.(e),
  );
}

export async function listBarOrders(barId) {
  const s = await getDocs(query(collection(db, 'orders'), where('barId', '==', barId)));
  return s.docs.map(fromSnap);
}

export const confirmPayment = (code) =>
  updateDoc(doc(db, 'orders', code), { status: 'confirmado', confirmedAt: serverTimestamp(), confirmedBy: myEmail() });

export const checkIn = (code) =>
  updateDoc(doc(db, 'orders', code), { status: 'usado', usedAt: serverTimestamp(), usedBy: myEmail() });

async function close(order, status) {
  const b = writeBatch(db);
  b.update(doc(db, 'orders', order.code), { status, closedAt: serverTimestamp(), closedBy: myEmail() });
  b.update(doc(db, 'events', order.eventId), { [`sold.${order.typeId}`]: increment(-order.qty) });
  await b.commit();
}

export const rejectOrder = (order) => close(order, 'rechazado');
export const refundOrder = (order) => close(order, 'reembolsado');

// ---------- perfil ----------

export async function getProfile() {
  const u = auth.currentUser;
  if (!u) return null;
  try {
    const s = await getDoc(doc(db, 'users', u.uid));
    return s.exists() ? toPlain(s.data()) : null;
  } catch {
    return null;
  }
}

export async function saveProfile({ name, phone }) {
  const u = auth.currentUser;
  if (!u) return;
  await setDoc(doc(db, 'users', u.uid), { name: String(name).slice(0, 60), phone: String(phone).slice(0, 20), updatedAt: serverTimestamp() });
}

// ---------- comisiones liquidadas ----------

export async function listSettlements(barId) {
  const s = await getDocs(query(collection(db, 'settlements'), where('barId', '==', barId)));
  return s.docs.map(fromSnap);
}

export const markSettled = ({ barId, eventId, amount }) =>
  setDoc(doc(db, 'settlements', eventId), { barId, eventId, amount: Math.round(amount), paidAt: serverTimestamp(), by: myEmail() });

export const unmarkSettled = (eventId) => deleteDoc(doc(db, 'settlements', eventId));
