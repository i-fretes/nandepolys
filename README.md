# Ñandepoly

Juego de compra-venta de propiedades estilo clásico, **ambientado en Paraguay**, para jugar **online de 2 a 6 personas** desde el navegador (PC o celular). Sin instalar nada: uno crea una sala, comparte el código o el link, y los demás entran.

- **44 casillas** (28 propiedades, Impuesto al lujo, dos 🎰 Casinos a los lados y dos 🏟️ Arenas arriba y abajo) y 32 cartas con nombres y humor paraguayos; moneda en guaraníes.
- Reglas oficiales completas: subastas, alquileres dobles con grupo completo, construcción pareja, hipotecas al 110 %, cárcel (Tacumbú), intercambios, quiebra. Reglas caseras opcionales.
- Servidor autoritativo (nadie puede hacer trampa), reconexión automática, chat, registro de jugadas, bots para rellenar.
- Si alguien se va: el anfitrión puede reemplazarlo por un bot (recupera el control al volver) o sacarlo de la partida. Revancha con un botón. Ayuda de reglas dentro del juego, fichas que recorren el tablero y sonidos (con botón de silencio).
- **Modo timba (opcional, se activa en el lobby):** Casinos con Ruleta 49/51 (carrete estilo apertura de caja), Quiniela, Doble o nada y Carrera de carretas; Jackpot que se lleva el doble seis; alquiler a doble o nada; y **desafíos** entre jugadores (duelo de dados, piedra-papel-tijera, trivia paraguaya con 172 preguntas, tereré caliente) por botón o por las cartas ¡Desafío!.
- **Modo fiesta (v1.3, opcional):** 🏟️ **La Arena** (al caer, todos juegan a la vez uno de 11 mini-juegos votado entre 3 — Trivia relámpago, Caña dulce, Frená la barra, ¿Cuántos hay?, Palabra bomba con diccionario, Carrera de sapos, Duelo del Oeste, Esquivá el rayo, Penales, Ruleta rusa de globos y Adiviná el dibujo — y el banco paga 300/150/50 mil; el más pobre dobla), 🎁 **Caja sorpresa** al pasar por Salida (carrete estilo "skin club", promedio ≈ ₲ 200.000), 🎯 **Misiones secretas** (3 por jugador, se pagan solas), 🌪️ **Eventos globales** (ruleta de 20 eventos cada vuelta completa de la mesa; 2 de cada 3 giros: tranquilidad) y 🔫 **Duelo mayor** (una ficha cada 3 vueltas para retar por hasta ₲ 500.000 a **Escopeta** —cartuchos de verdad y de fogueo, lupa, cerveza y esposas— o **Truco paraguayo** a 15 con envido, flor, truco, retruco y vale cuatro).
- 📊 **Tabla en vivo** a la izquierda del tablero: intercambios propuestos/aceptados/rechazados con animación, "X está negociando con Y", dobles o nada, desafíos, premios de la Arena, duelos, cajas, eventos y misiones.
- v1.3.2: Carrera de sapos **vertical** (los sapos saltan solos y cada vez más rápido; vos solo cambiás de carril; charco = afuera); truco del duelo **a 2 manos**; en la Arena dobla el que tiene **menos efectivo** (también de a dos); saldos que ya no se quedan "trabados" al animarse; las fichas avanzan más despacio y la compra/alquiler/casilla aparece **recién cuando la ficha llega**; Escopeta con turno destacado e historial de cartuchos; explicación de globos y jackpot en pantalla.
- Detalles v1.3.1: botón **Abrir caja** con fanfarria épica y giro de 3,5 s; ruleta de eventos como carrete de 6 s; cuenta regresiva 3-2-1 antes de cada mini-juego (reloj sincronizado con el servidor); trivia que muestra lo que respondió cada uno; ¿Cuántos hay? revela la respuesta; Duelo del Oeste con blanco + botón DISPARAR; duelo de dados con botón para tirar; Escopeta con ayuda y "¡BOOM!"; música de fondo suave (🎵 para apagarla); dados 3D corregidos dentro de los diálogos.
- Animaciones: billetes que vuelan entre jugadores, saldos que cuentan, +/− flotantes, temblor en pagos grandes, confeti al completar un grupo o ganar, dados y cartas en 3D, rejas al ir preso, racha 🔥 de alquileres, carrete de la caja, ruleta de eventos, podio de la Arena.

> Proyecto independiente y sin fines comerciales. "Monopoly" es una marca de Hasbro; Ñandepoly no usa su nombre, arte ni textos.

---

## Cómo se juega (para tus amigos)

1. Uno entra a la página y toca **Crear sala**. Recibe un código de 5 letras (ej. `TERERE`) y un link.
2. Los demás abren el link (o ponen el código en **Unirme**), escriben su nombre y eligen ficha: mate, chipa, ñandutí, carreta, jaguareté o arpa.
3. El anfitrión ajusta las reglas caseras si quiere y toca **¡Empezar partida!**
4. En tu turno: **Tirar dados** → comprar / rechazar (va a subasta) → construir, hipotecar o intercambiar cuando quieras → **Terminar turno**.
5. Si se te cae la conexión o cerrás la pestaña, volvé a abrir el mismo link: seguís con tu jugador. Si alguien no vuelve, el anfitrión puede ponerle un bot ("Reemplazar por bot" en su tarjeta) o sacarlo ("Sacar").
6. Al terminar, el anfitrión toca **Revancha** y todos vuelven al lobby con las mismas reglas.
7. ¿Dudas? Botón **📖 Reglas** (en el lobby y durante la partida).

Tocá cualquier casilla del tablero para ver su título de propiedad completo (precios, alquileres, dueño).

---

## Requisitos

- **Node.js 20 o superior** y **pnpm** (`npm i -g pnpm` o `corepack enable`).
- Para desplegar en la nube: una cuenta gratuita en [Fly.io](https://fly.io) (o Render/Railway) y Docker **no** es necesario en tu máquina (Fly compila remoto).

## Instalación y ejecución local

```bash
pnpm install          # instala dependencias de los 3 paquetes
pnpm test             # 74 tests del motor de reglas (incluye partidas completas simuladas)
pnpm build            # compila cliente (apps/web/dist) y servidor (apps/server/dist)
pnpm start            # http://localhost:8080
```

Modo desarrollo con recarga automática (servidor en 8080, cliente en 5173 con proxy):

```bash
pnpm dev
```

---

## Opción A — Jugar desde la nube (recomendada)

Link fijo, funciona con tu PC apagada, HTTPS automático. Fly.io en São Paulo (`gru`) da ~40 ms de latencia desde Paraguay y se apaga solo cuando nadie juega, así que el costo es US$ 0-5/mes.

```bash
# 1. Instalar la CLI de Fly (https://fly.io/docs/flyctl/install/) e iniciar sesión
fly auth signup      # o fly auth login

# 2. Crear la app usando el fly.toml del repo (elegí un nombre libre si "nandepoly" está tomado)
fly launch --copy-config --no-deploy --name nandepoly-<tu-nombre>

# 3. Volumen de 1 GB para que las partidas sobrevivan reinicios
fly volumes create nandepoly_data --region gru --size 1

# 4. Desplegar
fly deploy

# 5. Abrir
fly open        # → https://nandepoly-<tu-nombre>.fly.dev
```

Para actualizar después de cambiar algo: `fly deploy`. Para ver logs: `fly logs`.

**Alternativas equivalentes:** [Render](https://render.com) (usa `render.yaml`: *New → Blueprint*), [Railway](https://railway.app) (detecta el `Dockerfile` solo). En cualquier VPS con Docker: `docker compose up -d` y listo en el puerto 8080.

**Dominio propio (opcional):** `fly certs add nandepoly.tudominio.com` y un registro CNAME hacia `<app>.fly.dev`.

## Opción B — Jugar desde tu PC

```bash
pnpm install && pnpm build
pnpm start          # servidor en http://localhost:8080
```

- **Misma casa (LAN):** tus amigos entran a `http://<IP-de-tu-PC>:8080` (ej. `http://192.168.0.15:8080`). Averiguá tu IP con `ipconfig` (Windows) o `ip a` (Linux/Mac).
- **Por internet, sin tocar el router:**
  - **ngrok** (más simple para invitados ocasionales): `ngrok http 8080` y compartís el link `https://xxxx.ngrok-free.app`. Cambia cada vez que lo reiniciás (plan gratis).
  - **Cloudflare Tunnel** (gratis, link temporal): `cloudflared tunnel --url http://localhost:8080`.
  - **Tailscale** (privado, ideal para un grupo fijo): todos instalan Tailscale, se unen a tu red y entran a `http://<tu-ip-tailscale>:8080`.

Las partidas se guardan en `./data/rooms.json` si definís `DATA_DIR=./data`, así podés reiniciar el servidor sin perderlas:

```bash
DATA_DIR=./data pnpm start
```

Desventaja: si apagás la PC o se cae tu internet, la partida se corta hasta que vuelvas.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto HTTP/WebSocket. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `DATA_DIR` | *(vacío = solo memoria)* | Carpeta para persistir salas en `rooms.json`. |
| `ROOM_TTL_HOURS` | `6` | Horas sin nadie conectado tras las cuales se borra una sala. |
| `AUCTION_SECONDS` | `20` | Segundos de inactividad para cerrar una subasta. |
| `BOT_DELAY_MS` | `900` | Pausa entre acciones de los bots (para que se vean). |
| `CHALLENGE_ACCEPT_SECONDS` | `15` | Tiempo para aceptar un desafío. |
| `RENT_OFFER_SECONDS` | `20` | Tiempo para decidir en el alquiler a doble o nada. |
| `CASINO_IDLE_SECONDS` | `75` | Inactividad máxima dentro del Casino. |
| `DEBUG_TOOLS` | *(vacío)* | `1` habilita ganchos de prueba (fijar dados/posición) para las pruebas e2e. No usar en producción. |
| `PUBLIC_DIR` | *(auto)* | Ruta al cliente compilado si no está en `apps/web/dist`. |
| `LOG_LEVEL` | `info` | Nivel de log de Fastify/pino. |

---

## Estructura del proyecto

```
nandepoly/
├── packages/engine/        Motor de reglas (TypeScript puro, sin dependencias)
│   ├── src/board.ts        Las 44 casillas paraguayas con precios y alquileres
│   ├── src/arena-data.ts   Mini-juegos de la Arena, eventos globales, misiones y premios de la caja
│   ├── src/truco.ts        Reglas del truco paraguayo 1 vs 1
│   ├── src/cards.ts        16 cartas Suerte + 16 Cooperativa
│   ├── src/reducer.ts      Todas las reglas: applyAction(estado, acción) → nuevo estado
│   ├── src/selectors.ts    Cálculos: alquiler, patrimonio, ¿puede construir?, etc.
│   └── test/               Tests (Vitest)
├── apps/server/            Fastify + Socket.IO: salas, validación (Zod), bots, temporizadores
├── apps/web/               React + Vite + Tailwind: tablero 2D, paneles, diálogos
├── e2e/                    Pruebas end-to-end (6 navegadores con Playwright; humano + bots)
├── Dockerfile · fly.toml · render.yaml · docker-compose.yml
└── docs/                   Especificación técnica
```

**Cómo funciona online:** los navegadores solo envían *intenciones* (`ROLL`, `BUY`, `BID`…). El servidor valida quién es y si es su turno, tira los dados con su propio generador, aplica el motor de reglas y reenvía el estado completo a toda la sala. Los mazos y la semilla de los dados nunca salen del servidor.

---

## Personalizar

- **Nombres de casillas y precios:** `packages/engine/src/board.ts`. Cambiá cualquier ciudad o avenida; los tests verifican que la estructura siga siendo válida.
- **Textos de las cartas:** `packages/engine/src/cards.ts` (los efectos están separados del texto).
- **Fichas y colores:** `TOKENS`, `PLAYER_COLORS` y `GROUP_COLORS` en `board.ts`.
- **Estilo visual:** `apps/web/src/index.css` y `tailwind.config.js`.

Después de cambiar algo: `pnpm test && pnpm build` y volver a desplegar.

## Reglas caseras disponibles (las define el anfitrión en el lobby)

Pozo en Estacionamiento Libre · Doble sueldo al caer exacto en Salida · Sin subastas · Sin compras en la primera vuelta · Tiempo por turno (60/120/180 s, con decisiones por defecto al vencer) · Duración máxima de la partida (gana el de mayor patrimonio) · Efectivo inicial · **Casinos** (con apuesta máxima configurable) · **Jackpot** · **Alquiler a doble o nada** · **Desafíos** · **Duelo mayor** · **La Arena** · **Caja sorpresa** · **Misiones secretas** · **Eventos globales**.

Todo lo de "timba" y "fiesta" viene apagado por defecto: sin tocar nada, la partida es la clásica (los Casinos y las Arenas son casillas de descanso).

### Qué hace cada cosa nueva (v1.3)

- **La Arena.** Dos casillas 🏟️. Se sortean 3 mini-juegos y se vota 8 s. Nadie apuesta: el banco paga ₲ 300.000 / 150.000 / 50.000 y, si gana el jugador de menor patrimonio, cobra doble. Palabra bomba acepta cualquier palabra del diccionario español (sin acentos, mayúsculas indistintas) más paraguayismos y palabras en guaraní. Carrera de sapos: pista vertical de 3 carriles, el sapo salta solo y acelera; flechas ← → o A/D en PC, dos botones en el celular; charco = afuera; máximo 25 s.
- **Caja sorpresa.** Reemplaza el sueldo fijo de Salida: ₲ 100.000 a 500.000, casa gratis (con grupo completo), carta de cárcel, tirada extra o multa de ₲ 50.000. Promedio ≈ ₲ 200.000.
- **Misiones secretas.** 3 por jugador de un catálogo de 30; solo el dueño ve el texto. Se controlan y pagan solas (₲ 100.000–300.000).
- **Eventos globales.** Cada vuelta completa de la mesa gira la ruleta: 2 de cada 3 veces sale Tranquilidad; el resto dura una vuelta (Hora feliz, Paro de la ANDE, Inflación, Sequía, Corte de ruta, Ruta cortada, Boom inmobiliario, San Juan, Lotería, Noche de casino, Visita del presidente) o se aplica al instante (Aguinaldo, Control de la SET, Día del Niño, Amnistía, Mudanza, Cooperativa solidaria, Remate del banco, Terremoto).
- **Duelo mayor.** Cada 3 vueltas ganás una ficha 🔫. En tu turno retás a alguien por ₲ 50.000–500.000; negarse cuesta ₲ 50.000. Escopeta (estilo "Buckshot Roulette", 3 vidas, ítems) o Truco paraguayo 1 a 1 a 15 puntos. Solo vos ves tu mano; la lupa solo te la muestra a vos.

## Pruebas

```bash
pnpm test                      # motor: 95 tests, incluye partidas completas con 2 y 6 jugadores y todas las opciones
pnpm build && pnpm start &     # levantar servidor
pnpm e2e:bots                  # humano (script) + 5 bots juegan una partida entera por Socket.IO
pnpm e2e                       # 6 navegadores reales juegan y uno se reconecta (requiere Chromium de Playwright)
node e2e/features.mjs          # reemplazo por bot, sacar jugador, abandonar, fin de partida y revancha
DEBUG_TOOLS=1 pnpm start &     # para la siguiente hace falta el servidor con ganchos de prueba
node e2e/casino.mjs            # casino (ruleta, carrera, doble o nada), alquiler a doble o nada, trivia y piedra-papel-tijera
node e2e/v13.mjs               # v1.3: caja sorpresa, Arena, duelos (Escopeta y Truco), ruleta de eventos, tabla en vivo
node e2e/mobile.mjs            # capturas en celular
```

## Problemas frecuentes

- **"Sala no encontrada"**: el código expiró (`ROOM_TTL_HOURS`) o el servidor se reinició sin `DATA_DIR`.
- **No puedo volver a mi jugador**: la sesión se guarda en el navegador que usaste; entrá desde el mismo dispositivo/navegador o pedile al anfitrión que te agregue de nuevo si la partida está en el lobby.
- **Los bots no se mueven**: revisá `fly logs`; el servidor fuerza el fin de turno si un bot falla.
- **El tablero se ve chico en el celular**: tocá una casilla para ver el detalle; girá el teléfono para ver más grande.
