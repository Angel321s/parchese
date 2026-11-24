// Textos legales. Antes de publicar, que los revise un abogado y completen los datos del responsable.
import { setTitle, emptyBlock } from '../ui.js';
import { esc } from '../lib/format.js';

const RESPONSABLE = {
  nombre: 'Párchese',
  ciudad: 'Bogotá, Colombia',
  contacto: 'WhatsApp 313 239 6045',
  actualizado: '23 de noviembre de 2026',
};

export function privacy({ main }) {
  setTitle('Política de tratamiento de datos');
  main.innerHTML = `<article class="legal">
    <h1 class="h-page">Política de tratamiento de datos personales</h1>
    <p class="muted mt-s">Última actualización: ${esc(RESPONSABLE.actualizado)}</p>
    <h2>Quién es el responsable</h2>
    <p>${esc(RESPONSABLE.nombre)}, ${esc(RESPONSABLE.ciudad)}. Contacto: ${esc(RESPONSABLE.contacto)}.</p>
    <h2>Qué datos recogemos</h2>
    <ul><li>Nombre, correo y número de WhatsApp.</li><li>Las reservas y entradas que haces: evento, cantidad, valor y estado del pago.</li>
      <li>El nombre del titular de la cuenta con la que pagaste, si nos lo das al tocar "Ya pagué".</li></ul>
    <p>No recibimos ni guardamos datos de tu banco, tarjetas ni claves. Tu pago va directo al bar por Bre-B.</p>
    <h2>Para qué los usamos</h2>
    <ul><li>Crear y gestionar tu reserva o entrada, y mostrarte tu código QR.</li>
      <li>Que el bar del evento pueda confirmar tu pago, validar tu entrada en la puerta y contactarte por tu reserva.</li>
      <li>Enviarte recordatorios del evento que reservaste.</li></ul>
    <h2>Con quién los compartimos</h2>
    <p>Solo con el bar del evento que reservaste, para los fines de arriba. No vendemos tus datos. Usamos servicios de Google (Firebase) para guardar la información de forma segura.</p>
    <h2>Tus derechos</h2>
    <p>Según la Ley 1581 de 2012, puedes conocer, actualizar, rectificar y pedir que borremos tus datos, y revocar esta autorización, escribiéndonos al contacto de arriba. Respondemos dentro de los plazos de ley.</p>
  </article>`;
}

export function terms({ main }) {
  setTitle('Términos y condiciones');
  main.innerHTML = `<article class="legal">
    <h1 class="h-page">Términos y condiciones</h1>
    <p class="muted mt-s">Última actualización: ${esc(RESPONSABLE.actualizado)}</p>
    <h2>Qué es Párchese</h2>
    <p>Párchese es una plataforma que publica eventos de bares y permite reservar y obtener entradas. Cada bar es el organizador y responsable de su evento, su local, su carta y sus reglas de ingreso.</p>
    <h2>Cómo funciona el pago</h2>
    <ul><li>Pagas por Bre-B directo a la cuenta del bar. Párchese no recibe ni guarda tu dinero.</li>
      <li>Tu entrada queda activa cuando el bar confirma que recibió el pago. Si el bar no encuentra el pago, la reserva queda sin efecto.</li>
      <li>Paga solo a la llave Bre-B que aparece en tu pedido y escribe el código del pedido en el mensaje cuando tu banco lo permita.</li></ul>
    <h2>Ingreso al evento</h2>
    <ul><li>Tu código QR es personal y se puede usar una sola vez, para la cantidad de personas de tu pedido.</li>
      <li>El bar puede pedir documento de identidad y aplicar sus reglas de ingreso, incluida la edad mínima.</li></ul>
    <h2>Cancelaciones y devoluciones</h2>
    <p>Como el pago va directo al bar, las devoluciones las hace el bar según sus políticas. Si un evento se cancela, el bar debe devolver lo pagado. Escríbele al bar o a Párchese con tu código de pedido.</p>
    <h2>Contacto</h2>
    <p>${esc(RESPONSABLE.contacto)}.</p>
  </article>`;
}

export function notFound({ main }) {
  setTitle('Página no encontrada');
  main.innerHTML = emptyBlock('Esta página no existe', 'Puede que el enlace esté mal escrito.', '<a class="btn btn-ghost" href="/">Ir a la cartelera</a>');
}
