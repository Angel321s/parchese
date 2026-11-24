// Cálculo de la comisión de Párchese.
//
// Regla del acuerdo con el bar:
// - Comisión (8% por defecto) sobre lo vendido por Párchese: pedidos confirmados o usados.
// - Los pedidos pendientes, rechazados o reembolsados no cuentan.
// - La comisión de un evento se cobra cuando el evento ya pasó (due); antes va como "upcoming".
// - Oferta de lanzamiento: los primeros N eventos publicados del bar (3 por defecto)
//   no pagan comisión, si su fecha cae dentro de la ventana desde la firma (60 días).

export const DEFAULT_RATE = 0.08;
export const DEFAULT_FREE_EVENTS = 3;
export const DEFAULT_FREE_WINDOW_DAYS = 60;

const SOLD = new Set(['confirmado', 'usado']);

export function settings(priv = {}) {
  return {
    rate: typeof priv.commissionRate === 'number' ? priv.commissionRate : DEFAULT_RATE,
    freeEvents: Number.isInteger(priv.freeEvents) ? priv.freeEvents : DEFAULT_FREE_EVENTS,
    freeWindowDays: Number.isInteger(priv.freeWindowDays) ? priv.freeWindowDays : DEFAULT_FREE_WINDOW_DAYS,
    signedAt: priv.signedAt ? new Date(priv.signedAt) : null,
  };
}

export function freeUntil(priv) {
  const s = settings(priv);
  return s.signedAt ? new Date(s.signedAt.getTime() + s.freeWindowDays * 864e5) : null;
}

// Ids de los eventos que entran en la oferta de lanzamiento.
export function freeEventIds(events, priv) {
  const s = settings(priv);
  const limit = s.signedAt ? s.signedAt.getTime() + s.freeWindowDays * 864e5 : Infinity;
  const eligible = events
    .filter((e) => e.status === 'published' && new Date(e.startsAt).getTime() <= limit)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, s.freeEvents);
  return new Set(eligible.map((e) => e.id));
}

export function commissionReport({ events = [], orders = [], priv = {}, settlements = [], now = new Date() }) {
  const s = settings(priv);
  const free = freeEventIds(events, priv);
  const settled = new Map(settlements.map((x) => [x.eventId, x]));

  const rows = events
    .filter((e) => e.status !== 'draft')
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    .map((e) => {
      const mine = orders.filter((o) => o.eventId === e.id);
      const sold = mine.filter((o) => SOLD.has(o.status));
      const gross = sold.reduce((sum, o) => sum + (o.total || 0), 0);
      const tickets = sold.reduce((sum, o) => sum + (o.qty || 0), 0);
      const isFree = free.has(e.id);
      const commission = isFree ? 0 : Math.round(gross * s.rate);
      return {
        id: e.id,
        title: e.title,
        startsAt: new Date(e.startsAt),
        status: e.status,
        tickets,
        orders: sold.length,
        pending: mine.filter((o) => o.status === 'pendiente').length,
        gross,
        isFree,
        commission,
        settlement: settled.get(e.id) || null,
        done: new Date(e.startsAt) <= now,
      };
    });

  const totals = rows.reduce(
    (t, r) => {
      t.gross += r.gross;
      t.commission += r.commission;
      if (r.settlement) t.paid += r.settlement.amount || 0;
      else if (r.done) t.due += r.commission;
      else t.upcoming += r.commission;
      return t;
    },
    { gross: 0, commission: 0, paid: 0, due: 0, upcoming: 0 },
  );

  return { rate: s.rate, freeEvents: s.freeEvents, freeUntil: freeUntil(priv), rows, totals };
}
