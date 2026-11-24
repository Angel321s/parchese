// Reporte de ventas y comisión de un bar (lo usan el panel del bar y la administración).
import { api } from '../data/index.js';
import { commissionReport } from '../lib/commission.js';
import { esc, money, dateShort, dateLong, cap } from '../lib/format.js';

export async function loadReport(barId) {
  const [events, orders, priv, settlements] = await Promise.all([
    api.listBarEvents(barId),
    api.listBarOrders(barId),
    api.getBarPrivate(barId),
    api.listSettlements(barId),
  ]);
  return commissionReport({ events, orders, priv: priv || {}, settlements });
}

const pct = (r) => (r * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + '%';

function stateTag(r) {
  if (r.status === 'cancelled') return '<span class="tag">Cancelado</span>';
  if (r.isFree) return '<span class="tag mint">Lanzamiento · sin comisión</span>';
  if (!r.done) return '<span class="tag">Por venir</span>';
  if (r.settlement) return `<span class="tag mint">Comisión pagada</span>`;
  if (!r.commission) return '<span class="tag">Sin ventas</span>';
  return '<span class="tag amb">Comisión por pagar</span>';
}

export function reportHtml(rep, { admin = false } = {}) {
  const t = rep.totals;
  const offer = rep.freeUntil
    ? `Los primeros ${rep.freeEvents} eventos publicados hasta el ${esc(dateLong(rep.freeUntil))} van sin comisión.`
    : `Los primeros ${rep.freeEvents} eventos publicados van sin comisión.`;
  const rows = rep.rows.length
    ? rep.rows
        .map(
          (r) => `<div class="rep" data-ev="${esc(r.id)}">
        <div class="rep-top"><div><b>${esc(r.title)}</b><p class="muted sm">${esc(cap(dateShort(r.startsAt)))}${r.pending ? ` · ${r.pending} ${r.pending === 1 ? 'pago pendiente' : 'pagos pendientes'}` : ''}</p></div>${stateTag(r)}</div>
        <div class="rep-nums">
          <div><b class="num">${r.tickets}</b><span>Entradas</span></div>
          <div><b class="num">${money(r.gross)}</b><span>Vendido</span></div>
          <div><b class="num">${money(r.commission)}</b><span>${r.isFree ? 'Comisión (gratis)' : 'Comisión ' + pct(rep.rate)}</span></div>
        </div>
        ${admin && r.done && r.commission > 0
          ? r.settlement
            ? `<div class="acts"><span class="muted sm">Pagada${r.settlement.paidAt ? ' el ' + esc(dateShort(new Date(r.settlement.paidAt))) : ''}: ${money(r.settlement.amount)}</span><span class="sp"></span><button class="btn sm btn-ghost" data-act="unsettle" data-id="${esc(r.id)}">Deshacer</button></div>`
            : `<div class="acts"><button class="btn sm btn-mint" data-act="settle" data-id="${esc(r.id)}" data-amount="${r.commission}">Marcar ${money(r.commission)} como pagada</button></div>`
          : ''}
      </div>`,
        )
        .join('')
    : '<div class="empty"><h3>Todavía no hay ventas</h3><p>Cuando publiques eventos y se vendan entradas, aquí ves lo vendido y la comisión.</p></div>';

  return `<div class="stats">
      <div class="stat"><div class="n num">${money(t.gross)}</div><div class="l">Vendido por Párchese</div></div>
      <div class="stat"><div class="n num">${money(t.due)}</div><div class="l">Comisión por pagar</div></div>
      <div class="stat"><div class="n num">${money(t.paid)}</div><div class="l">Comisión ya pagada</div></div>
      ${t.upcoming ? `<div class="stat"><div class="n num">${money(t.upcoming)}</div><div class="l">Comisión de eventos por venir</div></div>` : ''}
    </div>
    <p class="note">Comisión del ${pct(rep.rate)} sobre las entradas pagadas y confirmadas por Párchese. ${offer} La comisión de cada evento se paga por Bre-B a Párchese a los 3 días hábiles del evento.</p>
    <div class="mt">${rows}</div>`;
}
