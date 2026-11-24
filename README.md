# Párchese

Sitio web de eventos, reservas y entradas para bares en Colombia. El cliente paga **por Bre-B directo a la cuenta del bar**; el bar confirma el pago en su panel, al cliente le aparece su QR, y en la puerta se valida una sola vez. Párchese cobra su comisión (8%) después de cada evento.

## Qué hace esta primera versión

**Clientes**
- Cartelera de eventos y página de cada bar, con enlace a Google Maps.
- Elegir tipo de entrada y cantidad (con cupos que no se pueden pasar).
- Entrar con Google o con correo y contraseña.
- Pago por Bre-B: llave del bar, valor y código del pedido (`PRCH-XXXXXX`) con botones de copiar, y botón **Ya pagué**.
- Su entrada con QR, que aparece sola cuando el bar confirma el pago. Las entradas gratis (lista de invitados) quedan confirmadas de una vez.
- "Mis entradas".

**Panel del bar** (`/panel`)
- **Pagos**: los pedidos por confirmar, en vivo. Los que dicen "Ya pagué" salen primero, con el nombre de la cuenta desde la que pagaron. Botones **Confirmar pago** y **No llegó**.
- **Puerta**: escanear el QR con la cámara o escribir el código. Muestra si puede entrar, si ya entró o si el pago no está confirmado. Registrar devoluciones.
- **Eventos**: crear, editar, publicar, cancelar y compartir por WhatsApp.
- **Ventas**: lo vendido por Párchese y la comisión de cada evento (los primeros 3 sin comisión).

**Administración de Párchese** (`/admin`)
- Crear bares con su llave Bre-B, el nombre del titular, los correos de su personal, la comisión y la fecha de firma.
- Ver la comisión por cobrar de cada bar y marcarla como pagada.

## Probarlo ya, sin Firebase (modo demo)

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:5173. Sin archivo `.env`, el sitio arranca en **modo demo**: datos de ejemplo guardados solo en tu navegador. Usuarios de prueba (contraseña `demo1234`):

| Correo | Qué es |
| --- | --- |
| `admin@parchese.co` | Administración de Párchese |
| `bar@lasucursal.co` | Personal de La Sucursal |
| `bar@terrazalunar.co` | Personal de Terraza Lunar |

Para ver el flujo completo, abre dos pestañas: en una compras como cliente (crea una cuenta) y en otra entras como el bar. El botón "Reiniciar demo" de arriba borra todo.

## Ponerlo en internet con Firebase (una sola vez)

Se usa el plan gratis de Firebase (Spark): Authentication, Cloud Firestore y Hosting.

1. **Crear el proyecto** en [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication**: activar los proveedores **Google** y **Correo electrónico/contraseña**.
3. **Firestore Database**: crear la base en modo producción. Elijan una ubicación en Estados Unidos (por ejemplo `us-east1`), que suele dar buena velocidad desde Colombia. La ubicación no se puede cambiar después.
4. **Registrar una app web** en la configuración del proyecto y copiar sus datos (`apiKey`, `authDomain`, `projectId`, …). Copiar `.env.example` como `.env` y pegarlos ahí.
5. **Darse permisos de administración**: en Firestore crear la colección `config`, documento `admins`, con un campo `emails` de tipo arreglo que tenga sus correos (los mismos con los que van a entrar, idealmente de Google).
6. **Publicar** desde la terminal, en esta carpeta:
   ```bash
   npm install
   npx firebase login
   npx firebase use --add      # elegir el proyecto
   npm run deploy              # compila y sube el sitio, las reglas y los índices
   ```
   El sitio queda en `https://<proyecto>.web.app`.
7. Entrar al sitio con su correo, ir a `/admin` y **crear el primer bar** con su llave Bre-B y el correo de su personal.
8. El personal del bar entra con ese correo, va a `/panel` y **crea sus eventos**. Si entra con correo y contraseña, primero debe verificar su correo (con Google es automático).

Para usar un dominio propio (por ejemplo `parchese.co`), se agrega en Hosting y luego en Authentication como dominio autorizado.

## Cómo está protegido

Todo lo importante lo validan las **reglas de Firestore** (`firestore.rules`), no el navegador:

- Un cliente solo ve sus pedidos y no puede confirmar su propio pago.
- El precio, el total y el cupo se validan en el servidor: nadie puede cambiar el precio ni comprar por encima del cupo.
- Solo el personal del bar (correo verificado y registrado en ese bar) ve sus pedidos, confirma pagos y valida entradas.
- Una entrada se marca como usada una sola vez.
- Solo la administración crea bares y registra comisiones pagadas.

## Pruebas

```bash
npm run test:unit    # cálculo de comisiones (8%, 3 eventos gratis, ventana de 60 días)
npm run test:rules   # reglas de seguridad con el emulador de Firestore (requiere Java 21)
npm run test:e2e     # flujo completo en modo demo con Playwright
```

En GitHub, `.github/workflows/ci.yml` corre las pruebas de comisiones, las de reglas y la compilación en cada cambio.

## Estructura

```
firestore.rules            reglas de seguridad
firestore.indexes.json     índice de la cartelera
src/main.js                arranque, encabezado y rutas
src/data/firestore.js      conexión real con Firebase
src/data/memory.js         modo demo (misma interfaz, datos en el navegador)
src/lib/commission.js      cálculo de comisiones
src/pages/                 una página por archivo (cartelera, evento, entrada, panel, admin, …)
tests/                     pruebas
```

## Antes de lanzar

- Que un abogado revise la política de datos y los términos (`src/pages/legal.js`) y completen los datos del responsable.
- Probar con 2 o 3 bancos que el cliente pueda escribir el código del pedido en el mensaje del Bre-B.
- Acordar con cada bar quién confirma los pagos la noche del evento.

## Lo que sigue

La vaca en línea, el pedido anticipado de la carta, las tarjetas de regalo, los cumpleaños, los recordatorios por correo y el CRM ya están diseñados en el prototipo y se pueden ir sumando sobre esta base.
