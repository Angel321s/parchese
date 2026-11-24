// Pruebas de las reglas de seguridad. Necesitan el emulador de Firestore:
//   npm run test:rules
// (firebase emulators:exec descarga y arranca el emulador; requiere Java 21).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp,
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';

let env;
const FUTURE = Timestamp.fromDate(new Date(Date.now() + 3 * 864e5));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-parchese',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/admins'), { emails: ['admin@parchese.co'] });
    await setDoc(doc(db, 'bars/sucursal'), { name: 'La Sucursal', active: true, brebKey: '@lasucursal' });
    await setDoc(doc(db, 'barsPrivate/sucursal'), { staffEmails: ['bar@sucursal.co'], commissionRate: 0.08, freeEvents: 3 });
    await setDoc(doc(db, 'bars/otro'), { name: 'Otro Bar', active: true, brebKey: '@otro' });
    await setDoc(doc(db, 'barsPrivate/otro'), { staffEmails: ['staff@otro.co'], commissionRate: 0.08, freeEvents: 3 });
    await setDoc(doc(db, 'events/noche'), {
      barId: 'sucursal', title: 'Noche de salsa', startsAt: FUTURE, status: 'published',
      ticketTypes: {
        gen: { name: 'General', price: 35000, capacity: 3 },
        lista: { name: 'Lista', price: 0, capacity: 0 },
      },
      sold: {},
    });
    await setDoc(doc(db, 'events/borrador'), {
      barId: 'sucursal', title: 'Borrador', startsAt: FUTURE, status: 'draft',
      ticketTypes: { gen: { name: 'General', price: 10000, capacity: 10 } }, sold: {},
    });
  });
});

const customer = (uid = 'ana') =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true }).firestore();
const staff = () => env.authenticatedContext('staff1', { email: 'bar@sucursal.co', email_verified: true }).firestore();
const staffUnverified = () =>
  env.authenticatedContext('staff2', { email: 'bar@sucursal.co', email_verified: false }).firestore();
const otherStaff = () => env.authenticatedContext('staff3', { email: 'staff@otro.co', email_verified: true }).firestore();
const admin = () => env.authenticatedContext('adm', { email: 'admin@parchese.co', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function orderData(uid, code, { typeId = 'gen', qty = 2, price = 35000, typeName = 'General', status } = {}) {
  const total = price * qty;
  return {
    uid, code, eventId: 'noche', barId: 'sucursal', typeId, typeName, qty, unitPrice: price, total,
    status: status ?? (total === 0 ? 'confirmado' : 'pendiente'),
    name: 'Ana Gómez', phone: '3001234567', email: `${uid}@gmail.com`, consent: true,
    createdAt: serverTimestamp(), eventTitle: 'Noche de salsa', eventStartsAt: FUTURE, barName: 'La Sucursal',
  };
}

function buy(db, uid, code, opts = {}, { inc } = {}) {
  const d = orderData(uid, code, opts);
  const b = writeBatch(db);
  b.set(doc(db, 'orders', code), d);
  b.update(doc(db, 'events', 'noche'), { [`sold.${d.typeId}`]: increment(inc ?? d.qty), lastOrderId: code });
  return b.commit();
}

const confirmFields = (email) => ({ status: 'confirmado', confirmedAt: serverTimestamp(), confirmedBy: email });

test('cualquiera ve eventos publicados, no borradores', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'events/noche')));
  await assertFails(getDoc(doc(anon(), 'events/borrador')));
  await assertSucceeds(getDocs(query(collection(anon(), 'events'), where('status', '==', 'published'))));
  await assertFails(getDocs(collection(anon(), 'events')));
});

test('leer algo que no existe solo dice que no existe', async () => {
  const s = await assertSucceeds(getDoc(doc(anon(), 'events/no-existe')));
  assert.equal(s.exists(), false);
  await assertSucceeds(getDoc(doc(staff(), 'orders/PRCH-ZZZZZZ')));
  await assertFails(getDoc(doc(anon(), 'orders/PRCH-ZZZZZZ')));
});

test('el cliente compra y el cupo se suma en el mismo envío', async () => {
  const db = customer();
  await assertSucceeds(buy(db, 'ana', 'PRCH-ABCDEF'));
  const ev = await getDoc(doc(db, 'events/noche'));
  assert.equal(ev.data().sold.gen, 2);
});

test('no se puede pedir sin sumar al cupo, ni sumar sin pedido', async () => {
  const db = customer();
  await assertFails(setDoc(doc(db, 'orders/PRCH-ABCDEF'), orderData('ana', 'PRCH-ABCDEF')));
  await assertFails(updateDoc(doc(db, 'events/noche'), { 'sold.gen': increment(1), lastOrderId: 'PRCH-ZZZZZZ' }));
});

test('precio, estado o cantidad alterados se rechazan', async () => {
  const db = customer();
  await assertFails(buy(db, 'ana', 'PRCH-ABCDE2', { price: 1000 }));
  await assertFails(buy(db, 'ana', 'PRCH-ABCDE3', { status: 'confirmado' }));
  await assertFails(buy(db, 'ana', 'PRCH-ABCDE4', {}, { inc: 1 }));
  await assertFails(buy(db, 'ana', 'prch-abcde5'));
});

test('no se vende por encima del cupo', async () => {
  await assertSucceeds(buy(customer('ana'), 'ana', 'PRCH-AAAAAA', { qty: 2 }));
  await assertFails(buy(customer('beto'), 'beto', 'PRCH-BBBBBB', { qty: 2 }));
  await assertSucceeds(buy(customer('beto'), 'beto', 'PRCH-BBBBBC', { qty: 1 }));
});

test('la entrada gratis nace confirmada', async () => {
  const lista = { typeId: 'lista', price: 0, typeName: 'Lista', qty: 1 };
  await assertSucceeds(buy(customer('ana'), 'ana', 'PRCH-LLLLLL', lista));
  await assertFails(buy(customer('beto'), 'beto', 'PRCH-LLLLL2', { ...lista, status: 'pendiente' }));
});

test('no se compra en borradores', async () => {
  const db = customer();
  const d = { ...orderData('ana', 'PRCH-DDDDDD', { price: 10000 }), eventId: 'borrador', eventTitle: 'Borrador' };
  const b = writeBatch(db);
  b.set(doc(db, 'orders/PRCH-DDDDDD'), d);
  b.update(doc(db, 'events/borrador'), { 'sold.gen': increment(2), lastOrderId: 'PRCH-DDDDDD' });
  await assertFails(b.commit());
});

test('cada quien ve solo sus pedidos', async () => {
  await buy(customer('ana'), 'ana', 'PRCH-AAAAAA');
  await assertSucceeds(getDoc(doc(customer('ana'), 'orders/PRCH-AAAAAA')));
  await assertFails(getDoc(doc(customer('beto'), 'orders/PRCH-AAAAAA')));
  await assertSucceeds(getDocs(query(collection(customer('ana'), 'orders'), where('uid', '==', 'ana'))));
  await assertFails(getDocs(query(collection(customer('beto'), 'orders'), where('uid', '==', 'ana'))));
});

test('el cliente avisa que pagó pero no puede confirmarse solo', async () => {
  await buy(customer('ana'), 'ana', 'PRCH-AAAAAA');
  const db = customer('ana');
  await assertSucceeds(updateDoc(doc(db, 'orders/PRCH-AAAAAA'), { paidClaimAt: serverTimestamp(), payerName: 'Ana Gómez' }));
  await assertFails(updateDoc(doc(db, 'orders/PRCH-AAAAAA'), confirmFields('ana@gmail.com')));
});

test('el bar confirma, deja entrar una sola vez y puede rechazar devolviendo el cupo', async () => {
  await buy(customer('ana'), 'ana', 'PRCH-AAAAAA');
  await buy(customer('beto'), 'beto', 'PRCH-BBBBBB', { qty: 1 });
  const db = staff();
  await assertSucceeds(getDocs(query(collection(db, 'orders'), where('barId', '==', 'sucursal'))));
  await assertSucceeds(updateDoc(doc(db, 'orders/PRCH-AAAAAA'), confirmFields('bar@sucursal.co')));
  const used = { status: 'usado', usedAt: serverTimestamp(), usedBy: 'bar@sucursal.co' };
  await assertSucceeds(updateDoc(doc(db, 'orders/PRCH-AAAAAA'), used));
  await assertFails(updateDoc(doc(db, 'orders/PRCH-AAAAAA'), used));
  const b = writeBatch(db);
  b.update(doc(db, 'orders/PRCH-BBBBBB'), { status: 'rechazado', closedAt: serverTimestamp(), closedBy: 'bar@sucursal.co' });
  b.update(doc(db, 'events/noche'), { 'sold.gen': increment(-1) });
  await assertSucceeds(b.commit());
});

test('sin correo verificado o de otro bar no se ve ni se confirma nada', async () => {
  await buy(customer('ana'), 'ana', 'PRCH-AAAAAA');
  await assertFails(getDoc(doc(staffUnverified(), 'orders/PRCH-AAAAAA')));
  await assertFails(getDoc(doc(otherStaff(), 'orders/PRCH-AAAAAA')));
  await assertFails(updateDoc(doc(otherStaff(), 'orders/PRCH-AAAAAA'), confirmFields('staff@otro.co')));
  await assertFails(getDocs(query(collection(otherStaff(), 'orders'), where('barId', '==', 'sucursal'))));
});

test('el personal encuentra su bar y maneja sus eventos', async () => {
  const db = staff();
  await assertSucceeds(getDocs(query(collection(db, 'barsPrivate'), where('staffEmails', 'array-contains', 'bar@sucursal.co'))));
  await assertSucceeds(getDoc(doc(db, 'events/borrador')));
  const nuevo = { barId: 'sucursal', title: 'Viernes', startsAt: FUTURE, status: 'draft', ticketTypes: {}, sold: {} };
  await assertSucceeds(setDoc(doc(db, 'events/viernes'), nuevo));
  await assertFails(setDoc(doc(db, 'events/ajeno'), { ...nuevo, barId: 'otro' }));
  await assertFails(setDoc(doc(customer(), 'events/pirata'), nuevo));
  await assertSucceeds(updateDoc(doc(db, 'events/viernes'), { status: 'published' }));
  await assertFails(deleteDoc(doc(db, 'events/noche')));
  await assertSucceeds(deleteDoc(doc(db, 'events/borrador')));
});

test('solo la administración crea bares y registra comisiones', async () => {
  const bar = { name: 'Nuevo', active: true, brebKey: '@nuevo' };
  await assertFails(setDoc(doc(staff(), 'bars/nuevo'), bar));
  await assertSucceeds(setDoc(doc(admin(), 'bars/nuevo'), bar));
  await assertSucceeds(setDoc(doc(admin(), 'barsPrivate/nuevo'), { staffEmails: [], commissionRate: 0.08, freeEvents: 3 }));
  await assertSucceeds(setDoc(doc(admin(), 'settlements/noche'), { barId: 'sucursal', eventId: 'noche', amount: 5600 }));
  await assertFails(setDoc(doc(staff(), 'settlements/noche'), { barId: 'sucursal', eventId: 'noche', amount: 0 }));
  await assertSucceeds(getDoc(doc(staff(), 'settlements/noche')));
  await assertFails(getDoc(doc(customer(), 'settlements/noche')));
});

test('config/admins solo lo leen los administradores', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'config/admins')));
  await assertFails(getDoc(doc(staff(), 'config/admins')));
});

test('cada cliente maneja solo su perfil', async () => {
  await assertSucceeds(setDoc(doc(customer('ana'), 'users/ana'), { name: 'Ana', phone: '3001234567', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(customer('beto'), 'users/ana')));
});
