import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commissionReport, freeEventIds } from '../src/lib/commission.js';

const day = 864e5;
const signed = new Date('2026-11-01T17:00:00Z');
const ev = (id, offsetDays, status = 'published') => ({
  id, title: id, status, startsAt: new Date(signed.getTime() + offsetDays * day),
});
const order = (eventId, total, status = 'confirmado', qty = 1) => ({ eventId, total, status, qty });
const priv = { commissionRate: 0.08, freeEvents: 3, freeWindowDays: 60, signedAt: signed };
const later = new Date('2027-06-01T00:00:00Z');

test('los primeros 3 eventos publicados son gratis', () => {
  const events = [ev('e1', 5), ev('e2', 10), ev('e3', 15), ev('e4', 20)];
  assert.deepEqual([...freeEventIds(events, priv)].sort(), ['e1', 'e2', 'e3']);
});

test('borradores y cancelados no gastan la oferta', () => {
  const events = [ev('e1', 5, 'draft'), ev('e2', 10, 'cancelled'), ev('e3', 15), ev('e4', 20), ev('e5', 25), ev('e6', 30)];
  assert.deepEqual([...freeEventIds(events, priv)].sort(), ['e3', 'e4', 'e5']);
});

test('fuera de la ventana de 60 días ya no hay eventos gratis', () => {
  const events = [ev('e1', 5), ev('e2', 70)];
  assert.deepEqual([...freeEventIds(events, priv)], ['e1']);
});

test('8% sobre lo confirmado o usado; pendientes y rechazados no cuentan', () => {
  const events = [ev('e1', 1), ev('e2', 2), ev('e3', 3), ev('e4', 4)];
  const orders = [
    order('e4', 40000, 'confirmado'),
    order('e4', 70000, 'usado', 2),
    order('e4', 35000, 'pendiente'),
    order('e4', 35000, 'rechazado'),
    order('e4', 20000, 'reembolsado'),
    order('e1', 100000, 'usado'),
  ];
  const r = commissionReport({ events, orders, priv, now: later });
  const e4 = r.rows.find((x) => x.id === 'e4');
  assert.equal(e4.gross, 110000);
  assert.equal(e4.tickets, 3);
  assert.equal(e4.pending, 1);
  assert.equal(e4.isFree, false);
  assert.equal(e4.commission, 8800);
  const e1 = r.rows.find((x) => x.id === 'e1');
  assert.equal(e1.isFree, true);
  assert.equal(e1.commission, 0);
  assert.equal(r.totals.gross, 210000);
  assert.equal(r.totals.commission, 8800);
  assert.equal(r.totals.due, 8800);
});

test('comisión ya liquidada pasa de pendiente a pagada', () => {
  const events = [ev('e1', 1), ev('e2', 2), ev('e3', 3), ev('e4', 4)];
  const orders = [order('e4', 40000)];
  const r = commissionReport({ events, orders, priv, settlements: [{ eventId: 'e4', amount: 3200 }], now: later });
  assert.equal(r.totals.paid, 3200);
  assert.equal(r.totals.due, 0);
});

test('sin fecha de firma, igual aplican los primeros 3', () => {
  const events = [ev('a', 100), ev('b', 200), ev('c', 300), ev('d', 400)];
  assert.equal(freeEventIds(events, { freeEvents: 3 }).size, 3);
  assert.equal(freeEventIds(events, { freeEvents: 3 }).has('d'), false);
});

test('la entrada de $40.000 deja $3.200 de comisión', () => {
  const events = [ev('a', 1), ev('b', 2), ev('c', 3), ev('d', 4)];
  const r = commissionReport({ events, orders: [order('d', 40000)], priv });
  assert.equal(r.rows.find((x) => x.id === 'd').commission, 3200);
});

test('la comisión de un evento que no ha pasado todavía no se cobra', () => {
  const events = [ev('a', 1), ev('b', 2), ev('c', 3), ev('d', 4)];
  const before = new Date(signed.getTime() + 3.5 * day);
  const r = commissionReport({ events, orders: [order('d', 40000)], priv, now: before });
  assert.equal(r.totals.due, 0);
  assert.equal(r.totals.upcoming, 3200);
});
