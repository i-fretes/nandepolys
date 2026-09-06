# Ñandepoly — Especificación técnica

*Juego de mesa de compra-venta de propiedades, estilo Monopoly clásico, ambientado en Paraguay, jugable online de 2 a 6 personas.*

Versión 1.0 · Septiembre 2026 · Preparado para Ivan (Biotecnica)

---

## 1. Resumen ejecutivo

Ñandepoly replica las reglas oficiales del Monopoly clásico (edición estándar, 40 casillas, 28 propiedades, 32 cartas) con nombres, moneda y humor paraguayos. Se juega desde el navegador (PC o celular) en salas privadas con código; el servidor arbitra la partida para que nadie pueda hacer trampa. Todo el proyecto se escribe en un solo lenguaje (TypeScript), con las reglas del juego aisladas en un módulo compartido y cubierto por tests automáticos.

**Nota legal.** "Monopoly", su logotipo, el tablero original y el personaje del bigote son marcas registradas de Hasbro. Las mecánicas de juego no son protegibles por derecho de autor, por lo que replicar las reglas es lícito, pero el proyecto usa nombre propio, arte propio y cartas redactadas desde cero (mismos efectos, distinto texto). Uso previsto: privado, entre amigos, sin fines comerciales.

---

## 2. Stack tecnológico

### 2.1 Lenguaje y runtime

| Componente | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript 5.x** (estricto) | Un solo lenguaje para motor, servidor y cliente. Las reglas se escriben una vez y se comparten. El tipado evita errores clásicos (pagarle alquiler al jugador equivocado, saldo negativo silencioso, etc.). |
| Runtime servidor | **Node.js 20 LTS** | Estable, soporte hasta 2026-2027, excelente para WebSockets. |
| Gestor de paquetes | **pnpm 9** con *workspaces* | Monorepo: tres paquetes en un solo repositorio, dependencias compartidas. |
| Editor recomendado | **VS Code** | Con extensiones ESLint, Prettier, Tailwind IntelliSense. |
| Control de versiones | **Git + GitHub** | Repo privado. |

### 2.2 Librerías por paquete

**`packages/engine` — Motor de reglas (sin UI, sin red)**

| Librería | Uso |
|---|---|
| (ninguna en runtime) | El motor es TypeScript puro y determinista: recibe un estado + una acción y devuelve el nuevo estado + eventos. Esto lo hace trivial de testear y de ejecutar tanto en servidor como en cliente. |
| **Zod 3** | Esquemas de validación de acciones y de estado (también genera los tipos TS). |
| **Vitest 2** | Tests unitarios y de escenario. |

**`apps/server` — Servidor de partidas**

| Librería | Uso |
|---|---|
| **Fastify 4** | Servidor HTTP: sirve el cliente compilado, endpoint de salud, creación de salas. |
| **Socket.IO 4** | Comunicación en tiempo real (WebSocket con fallback). Salas nativas, reconexión automática, *acknowledgements*. |
| **Zod** | Validar cada mensaje entrante antes de tocar el estado. |
| **pino** | Logs estructurados (viene con Fastify). |
| **ioredis** *(opcional)* | Persistir partidas en Redis para sobrevivir reinicios/despliegues. Si no hay Redis, todo vive en memoria. |
| **nanoid** | Códigos de sala (5 letras) e IDs de jugador. |

**`apps/web` — Cliente web**

| Librería | Uso |
|---|---|
| **React 18** + **Vite 5** | UI declarativa, recarga instantánea en desarrollo, build optimizado. |
| **Tailwind CSS 3** | Estilos utilitarios; tablero responsive sin CSS a mano. |
| **Zustand 4** | Estado local de UI (estado del juego que llega del servidor, diálogos abiertos, selección). |
| **socket.io-client 4** | Conexión con el servidor. |
| **framer-motion** | Animaciones de fichas moviéndose por el tablero y dados. |
| **react-hot-toast** | Notificaciones ("Te tocó Suerte", "Ivan te pagó ₲ 60.000"). |

**Calidad y tooling (raíz del repo)**

| Herramienta | Uso |
|---|---|
| **ESLint + Prettier** | Estilo consistente. |
| **Vitest** | Tests del motor (objetivo: >90 % de cobertura en `rules.ts`). |
| **Playwright** | Test end-to-end: 6 pestañas juegan una partida completa. |
| **Docker** | Imagen única (servidor + cliente estático). |
| **GitHub Actions** | CI: lint + tests + build en cada push. |

### 2.3 Por qué NO otras opciones

*Unity / Godot / Phaser*: son motores para juegos con física y gráficos; un tablero por turnos no los necesita y agregan peso, tiempo de carga y complejidad para jugar desde el celular.
*Python + Flask/Django*: viable, pero obligaría a duplicar las reglas (Python en servidor, JS en navegador) o a renderizar todo del lado del servidor. TypeScript compartido evita eso.
*Firebase / Supabase Realtime*: cómodo, pero la lógica del juego quedaría en los clientes (trampas fáciles) o en *cloud functions* con latencia. Un servidor propio es más simple y más honesto.

---

## 3. Arquitectura

### 3.1 Estructura del repositorio

```
nandepoly/
├── package.json                 # workspaces, scripts raíz
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── Dockerfile
├── docker-compose.yml           # server + redis (opcional)
├── .github/workflows/ci.yml
│
├── packages/
│   └── engine/
│       ├── src/
│       │   ├── types.ts         # GameState, Player, Property, Action, Event
│       │   ├── board.ts         # Las 40 casillas (datos de la sección 5)
│       │   ├── cards.ts         # 16 Suerte + 16 Cooperativa (sección 6)
│       │   ├── rng.ts           # Dados con semilla (reproducible en tests)
│       │   ├── reducer.ts       # applyAction(state, action) → { state, events }
│       │   ├── rules/
│       │   │   ├── movement.ts  # tirar, mover, dobles, pasar por Salida
│       │   │   ├── property.ts  # comprar, subasta, alquiler, monopolio
│       │   │   ├── building.ts  # casas/hoteles, construcción pareja, escasez
│       │   │   ├── mortgage.ts  # hipoteca / deshipoteca
│       │   │   ├── jail.ts      # entrar, salir, 3 turnos
│       │   │   ├── trade.ts     # propuestas e intercambios
│       │   │   ├── bankruptcy.ts# quiebra y transferencia de bienes
│       │   │   └── cards.ts     # ejecutar efectos de cartas
│       │   ├── selectors.ts     # helpers de lectura (¿tiene monopolio?, alquiler debido…)
│       │   └── index.ts
│       └── test/                # un archivo por regla + partidas completas simuladas
│
└── apps/
    ├── server/
    │   └── src/
    │       ├── index.ts         # Fastify + Socket.IO bootstrap
    │       ├── rooms.ts         # RoomManager: crear/unirse/expirar salas
    │       ├── handlers.ts      # socket events → validación Zod → engine → broadcast
    │       ├── persistence/     # memory.ts | redis.ts
    │       └── bots.ts          # (opcional) jugadores automáticos simples
    └── web/
        └── src/
            ├── main.tsx
            ├── socket.ts        # cliente Socket.IO + reconexión con token
            ├── store.ts         # Zustand
            ├── pages/           # Home, Lobby, Game
            ├── components/
            │   ├── Board/       # Board, Tile, Token, Dice
            │   ├── Panel/       # PlayerCard, PropertyList, Log, Chat
            │   └── Dialogs/     # Buy, Auction, Trade, Build, Mortgage, Jail, Card
            └── i18n/es-PY.ts    # todos los textos (por si después querés otro idioma)
```

### 3.2 Principio: servidor autoritativo

```
 Navegador A ──intención──▶ ┌──────────────┐ ──estado──▶ Navegador A
 Navegador B ──intención──▶ │   Servidor   │ ──estado──▶ Navegador B
 ...                        │  (engine)    │ ──estado──▶ ...
 Navegador F ──intención──▶ └──────────────┘ ──estado──▶ Navegador F
```

Los clientes **nunca** modifican el estado: envían intenciones (`ROLL_DICE`, `BUY`, `PROPOSE_TRADE`). El servidor valida (¿es tu turno? ¿tenés plata? ¿la propiedad está libre?), aplica el motor, tira los dados con su propio RNG y transmite el nuevo estado a la sala. El cliente también tiene el motor cargado, pero solo lo usa para *previsualizar* (ej. "si construís acá te queda ₲ 120.000").

### 3.3 Modelo de estado (simplificado)

```ts
interface GameState {
  roomCode: string;
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  settings: GameSettings;               // reglas caseras activadas
  players: Player[];                    // orden = orden de turno
  currentPlayerIndex: number;
  turnPhase: 'AWAITING_ROLL' | 'MOVED' | 'AWAITING_BUY' | 'AUCTION' | 'TRADE' | 'BANKRUPTCY' | 'END_TURN';
  dice: [number, number] | null;
  doublesCount: number;
  properties: Record<TileId, PropertyState>;   // owner, houses (0-5; 5 = hotel), mortgaged
  housesAvailable: number;              // 32
  hotelsAvailable: number;              // 12
  chanceDeck: CardId[];  chanceDiscard: CardId[];
  communityDeck: CardId[]; communityDiscard: CardId[];
  auction?: AuctionState;
  pendingTrade?: TradeState;
  log: GameEvent[];                     // historial completo (permite reproducir la partida)
  seed: number;                         // RNG determinista
}

interface Player {
  id: string; name: string; token: TokenId; color: string;
  cash: number; position: number;
  inJail: boolean; jailTurns: number;
  getOutOfJailCards: number;            // 0-2
  bankrupt: boolean; connected: boolean;
  isBot: boolean;
}
```

### 3.4 Protocolo Socket.IO

**Cliente → Servidor** (todos validados con Zod, todos con *ack* de éxito/error):

| Evento | Payload | Descripción |
|---|---|---|
| `room:create` | `{ name, token, settings }` | Crea sala, devuelve `roomCode` y `playerToken` (para reconectar). |
| `room:join` | `{ roomCode, name, token }` | Unirse (máx. 6 jugadores; después, espectador). |
| `room:rejoin` | `{ roomCode, playerToken }` | Reconexión tras cerrar pestaña / caída de red. |
| `room:start` | — | Solo el anfitrión. Sortea orden de turno (tirada inicial). |
| `game:roll` | — | Tirar dados. |
| `game:buy` / `game:decline` | — | Comprar la propiedad donde caíste o mandarla a subasta. |
| `game:bid` / `game:auctionPass` | `{ amount }` | Ofertar en subasta. |
| `game:build` / `game:sellBuilding` | `{ tileId }` | Construir o vender casa/hotel. |
| `game:mortgage` / `game:unmortgage` | `{ tileId }` | Hipotecar / deshipotecar. |
| `game:jailPay` / `game:jailCard` | — | Pagar ₲ 50.000 o usar carta para salir. |
| `game:tradePropose` | `{ toPlayerId, give: {...}, receive: {...} }` | Proponer intercambio (propiedades, efectivo, cartas de cárcel). |
| `game:tradeAccept` / `game:tradeReject` / `game:tradeCancel` | `{ tradeId }` | Responder. |
| `game:endTurn` | — | Terminar turno (si no hay dobles pendientes). |
| `game:declareBankruptcy` | — | Rendirse / quiebra voluntaria. |
| `chat:send` | `{ text }` | Chat de sala. |

**Servidor → Cliente:**

| Evento | Descripción |
|---|---|
| `state:full` | Estado completo (al unirse/reconectar). |
| `state:patch` | Estado tras cada acción (se envía completo; pesa < 20 KB, no vale la pena diffs). |
| `game:events` | Lista de eventos legibles para animar y loguear ("Ivan tiró 6+3", "Ivan cayó en Luque"). |
| `game:card` | Carta que hay que mostrar en pantalla antes de aplicar. |
| `game:over` | Ganador y ranking final. |
| `room:players` | Conectados / desconectados (para mostrar el ícono de "se cayó"). |
| `error` | Mensaje de error de validación. |

### 3.5 Reconexión y desconexión

Al crear/unirse, el servidor devuelve un `playerToken` que el cliente guarda en `localStorage`. Si la pestaña se cierra, al volver a entrar al link `/sala/TERERE` se reconecta al mismo jugador. Mientras alguien está desconectado la partida puede esperarlo (por defecto) o el anfitrión puede activar un temporizador de turno (60-180 s) que pasa el turno automáticamente. Una sala sin nadie conectado durante 2 horas se elimina.

---

## 4. Reglas del juego (fieles al clásico)

### 4.1 Preparación

Cada jugador recibe **₲ 1.500.000**: 2 × ₲ 500.000, 2 × ₲ 100.000, 2 × ₲ 50.000, 6 × ₲ 20.000, 5 × ₲ 10.000, 5 × ₲ 5.000, 5 × ₲ 1.000 (en digital solo importa el total). El banco tiene 32 casas y 12 hoteles. Cada jugador tira ambos dados; el mayor empieza; se juega en sentido horario.

### 4.2 El turno

1. Tirar dos dados y avanzar. Al pasar o caer en **Salida** cobrás ₲ 200.000.
2. Resolver la casilla (comprar, pagar alquiler, sacar carta, impuesto, etc.).
3. En cualquier momento de tu turno podés construir, hipotecar, deshipotecar, vender edificios y proponer intercambios.
4. Si sacaste **dobles**, volvés a tirar. **Tres dobles seguidos → a la cárcel** sin resolver la tercera casilla.
5. Terminar turno.

### 4.3 Propiedades

Al caer en una propiedad sin dueño podés **comprarla** al precio impreso o **rechazarla**, en cuyo caso el banco la **subasta** (regla oficial obligatoria) entre todos los jugadores, empezando en ₲ 10.000, sin mínimo de incremento; la puede ganar quien la rechazó. Si tiene dueño y no está hipotecada, pagás el alquiler indicado. El dueño **debe reclamarlo** antes de que el siguiente jugador tire (en digital: el alquiler se cobra automáticamente, configurable a "manual con botón" si quieren jugar estricto).

**Monopolio (grupo completo):** el alquiler de solares sin construir se **duplica**.
**Transporte (4 "ferrocarriles"):** ₲ 25.000 / 50.000 / 100.000 / 200.000 según cuántos tenga el dueño.
**Servicios (ANDE, ESSAP):** 4 × dados si tiene uno; 10 × dados si tiene ambos.

### 4.4 Construcción

Solo con el grupo completo y ninguna propiedad del grupo hipotecada. Construcción **pareja**: no podés poner una segunda casa en un solar si otro del grupo tiene cero. Máximo 4 casas, luego hotel (devuelve las 4 casas al banco). Se vende al banco a **mitad de precio**, también de forma pareja. Si el banco se queda **sin casas**, no se puede construir hasta que alguien venda (si dos o más quieren las últimas casas, se subastan). Se puede construir en cualquier momento del propio turno, incluso entre tirada y tirada.

### 4.5 Hipoteca

Valor hipotecario = mitad del precio. La propiedad hipotecada no cobra alquiler (aunque sí cuenta para completar grupo y para el múltiplo de transporte/servicios). Deshipotecar cuesta el valor + **10 %**. Al recibir una propiedad hipotecada por intercambio o quiebra, el receptor paga el 10 % de inmediato y decide si la deshipoteca ya (pagando el capital) o después (pagando otro 10 % entonces).

### 4.6 Cárcel (Tacumbú)

Vas a la cárcel por: caer en "Vaya a Tacumbú", sacar la carta correspondiente o tres dobles. No cobrás ₲ 200.000 al ir. Salís: pagando **₲ 50.000** antes de tirar, usando una carta **"Salís de Tacumbú"** (o comprándosela a otro), o sacando **dobles** (avanzás ese resultado y no volvés a tirar). Al tercer turno sin dobles, pagás ₲ 50.000 obligatoriamente y te movés. Estando preso podés cobrar alquileres, construir, hipotecar y negociar. "Solo de visita" no tiene efecto.

### 4.7 Cartas

Se barajan al inicio; se toma la de arriba y vuelve al fondo, salvo "Salís de Tacumbú", que el jugador conserva hasta usarla o venderla. Si una carta te hace avanzar por Salida, cobrás ₲ 200.000 (salvo que diga que vayas a la cárcel). "Retrocedé 3 casillas" puede caer en Impuesto a la Renta o en una casilla de carta.

### 4.8 Impuestos

**Impuesto a la Renta (SET):** ₲ 200.000 fijo o el **10 %** del patrimonio total (efectivo + precio de propiedades + costo de edificios); hay que elegir **antes** de calcular (en digital mostramos ambos; configurable para ser estricto). **Impuesto al lujo:** ₲ 100.000.

### 4.9 Estacionamiento Libre

Regla oficial: **no pasa nada**. Regla casera opcional: acumula impuestos y multas y quien cae se lo lleva.

### 4.10 Intercambios

Entre jugadores, en cualquier momento del turno de uno de los dos: propiedades (sin edificios; hay que venderlos al banco primero), efectivo y cartas de cárcel. Un intercambio es atómico: se aplica todo o nada.

### 4.11 Quiebra

Si debés más de lo que podés pagar aun vendiendo edificios e hipotecando, quebrás. Si la deuda es **con otro jugador**, recibe todo (efectivo, propiedades, cartas; paga el 10 % de las hipotecadas). Si es **con el banco**, el banco retiene las propiedades y las **subasta** de inmediato. El jugador queda fuera (puede seguir como espectador). Gana el último que queda; opcionalmente, límite de tiempo y gana el de mayor patrimonio.

### 4.12 Reglas caseras (todas apagadas por defecto)

| Opción | Efecto |
|---|---|
| Pozo en Estacionamiento Libre | Impuestos y multas se acumulan y los cobra quien cae. |
| Doble sueldo en Salida | Caer exactamente en Salida paga ₲ 400.000. |
| Sin subastas | Rechazar una propiedad simplemente la deja libre. |
| Primera vuelta sin compras | Nadie compra hasta completar una vuelta. |
| Temporizador de turno | 60 / 120 / 180 s; al expirar, acción por defecto (rechazar/terminar). |
| Límite de tiempo de partida | 60 / 90 / 120 min; gana el de mayor patrimonio. |
| Efectivo inicial | ₲ 1.000.000 / 1.500.000 / 2.000.000. |

---

## 5. El tablero paraguayo (40 casillas)

Moneda: **guaraníes (₲)**, equivalencia 1 dólar-monopoly = ₲ 1.000. Se muestra siempre con separador de miles y símbolo ₲ (ej. ₲ 1.500.000). Internamente el motor trabaja en miles (enteros pequeños) y el cliente multiplica para mostrar.

**Colores por grupo:** Marrón `#8B4513`, Celeste `#87CEEB`, Rosa `#E75480`, Naranja `#F7941D`, Rojo `#D62828`, Amarillo `#F4D03F`, Verde `#2E8B57`, Azul `#1F4E9A`. Transporte gris oscuro, servicios blanco.

| # | Casilla | Tipo | Grupo | Precio | Alquiler base | 1 casa | 2 casas | 3 casas | 4 casas | Hotel | Costo casa/hotel | Hipoteca |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | **Salida** — cobrá ₲ 200.000 | Especial | — | — | — | — | — | — | — | — | — | — |
| 1 | Villa Hayes | Solar | Marrón | 60 | 2 | 10 | 30 | 90 | 160 | 250 | 50 | 30 |
| 2 | Cooperativa | Carta | — | — | — | — | — | — | — | — | — | — |
| 3 | Mariano Roque Alonso | Solar | Marrón | 60 | 4 | 20 | 60 | 180 | 320 | 450 | 50 | 30 |
| 4 | Impuesto a la Renta (SET) — ₲ 200.000 o 10 % | Impuesto | — | — | — | — | — | — | — | — | — | — |
| 5 | Terminal de Ómnibus de Asunción | Transporte | — | 200 | 25 | (2: 50) | (3: 100) | (4: 200) | | | — | 100 |
| 6 | Caacupé | Solar | Celeste | 100 | 6 | 30 | 90 | 270 | 400 | 550 | 50 | 50 |
| 7 | Suerte | Carta | — | — | — | — | — | — | — | — | — | — |
| 8 | Paraguarí | Solar | Celeste | 100 | 6 | 30 | 90 | 270 | 400 | 550 | 50 | 50 |
| 9 | Villarrica | Solar | Celeste | 120 | 8 | 40 | 100 | 300 | 450 | 600 | 50 | 60 |
| 10 | **Tacumbú** — cárcel / solo de visita | Especial | — | — | — | — | — | — | — | — | — | — |
| 11 | Coronel Oviedo | Solar | Rosa | 140 | 10 | 50 | 150 | 450 | 625 | 750 | 100 | 70 |
| 12 | ANDE | Servicio | — | 150 | 4× dados | (ambos: 10× dados) | | | | | — | 75 |
| 13 | Concepción | Solar | Rosa | 140 | 10 | 50 | 150 | 450 | 625 | 750 | 100 | 70 |
| 14 | Pilar | Solar | Rosa | 160 | 12 | 60 | 180 | 500 | 700 | 900 | 100 | 80 |
| 15 | Aeropuerto Silvio Pettirossi | Transporte | — | 200 | 25 | 50 | 100 | 200 | | | — | 100 |
| 16 | Luque | Solar | Naranja | 180 | 14 | 70 | 200 | 550 | 750 | 950 | 100 | 90 |
| 17 | Cooperativa | Carta | — | — | — | — | — | — | — | — | — | — |
| 18 | San Lorenzo | Solar | Naranja | 180 | 14 | 70 | 200 | 550 | 750 | 950 | 100 | 90 |
| 19 | Fernando de la Mora | Solar | Naranja | 200 | 16 | 80 | 220 | 600 | 800 | 1000 | 100 | 100 |
| 20 | **Estacionamiento Libre** | Especial | — | — | — | — | — | — | — | — | — | — |
| 21 | Encarnación | Solar | Rojo | 220 | 18 | 90 | 250 | 700 | 875 | 1050 | 150 | 110 |
| 22 | Suerte | Carta | — | — | — | — | — | — | — | — | — | — |
| 23 | Pedro Juan Caballero | Solar | Rojo | 220 | 18 | 90 | 250 | 700 | 875 | 1050 | 150 | 110 |
| 24 | Ciudad del Este | Solar | Rojo | 240 | 20 | 100 | 300 | 750 | 925 | 1100 | 150 | 120 |
| 25 | Puerto de Asunción | Transporte | — | 200 | 25 | 50 | 100 | 200 | | | — | 100 |
| 26 | Av. Mariscal López | Solar | Amarillo | 260 | 22 | 110 | 330 | 800 | 975 | 1150 | 150 | 130 |
| 27 | Av. España | Solar | Amarillo | 260 | 22 | 110 | 330 | 800 | 975 | 1150 | 150 | 130 |
| 28 | ESSAP | Servicio | — | 150 | 4× dados | (ambos: 10× dados) | | | | | — | 75 |
| 29 | Av. Aviadores del Chaco | Solar | Amarillo | 280 | 24 | 120 | 360 | 850 | 1025 | 1200 | 150 | 140 |
| 30 | **Vaya a Tacumbú** | Especial | — | — | — | — | — | — | — | — | — | — |
| 31 | Villa Morra | Solar | Verde | 300 | 26 | 130 | 390 | 900 | 1100 | 1275 | 200 | 150 |
| 32 | Las Carmelitas | Solar | Verde | 300 | 26 | 130 | 390 | 900 | 1100 | 1275 | 200 | 150 |
| 33 | Cooperativa | Carta | — | — | — | — | — | — | — | — | — | — |
| 34 | Mburucuyá | Solar | Verde | 320 | 28 | 150 | 450 | 1000 | 1200 | 1400 | 200 | 160 |
| 35 | Puente de la Amistad | Transporte | — | 200 | 25 | 50 | 100 | 200 | | | — | 100 |
| 36 | Suerte | Carta | — | — | — | — | — | — | — | — | — | — |
| 37 | Costanera de Asunción | Solar | Azul | 350 | 35 | 175 | 500 | 1100 | 1300 | 1500 | 200 | 175 |
| 38 | Impuesto al lujo — ₲ 100.000 | Impuesto | — | — | — | — | — | — | — | — | — | — |
| 39 | Palacio de López | Solar | Azul | 400 | 50 | 200 | 600 | 1400 | 1700 | 2000 | 200 | 200 |

*Todos los montos en miles de guaraníes (60 = ₲ 60.000). Alquiler base se duplica con grupo completo sin construir. Para transporte, las columnas indican el alquiler con 1, 2, 3 y 4 transportes.*

**Fichas (6):** mate y bombilla, chipa, ñandutí, carreta, jaguareté, arpa paraguaya. Cada jugador elige además un color.

---

## 6. Las 32 cartas

Mismos efectos que el juego clásico; textos originales con sabor local. `+` = cobrás del banco, `−` = pagás al banco.

### 6.1 Suerte (16 cartas)

| # | Texto | Efecto |
|---|---|---|
| S1 | ¡Ganaste el sorteo de la Expo de Mariano! Avanzá hasta **Salida** y cobrá ₲ 200.000. | Ir a casilla 0, cobrar 200. |
| S2 | Viaje de compras a **Ciudad del Este**. Si pasás por Salida, cobrá ₲ 200.000. | Ir a 24; cobrar 200 si pasa Salida. |
| S3 | Te invitaron a un asado en **Coronel Oviedo**. Si pasás por Salida, cobrá ₲ 200.000. | Ir a 11; cobrar 200 si pasa Salida. |
| S4 | Se cortó la luz. Avanzá hasta el **servicio público más cercano**. Si está libre, podés comprarlo; si tiene dueño, tirá los dados y pagale 10 veces el resultado. | Ir a ANDE/ESSAP más cercano; alquiler 10× dados. |
| S5 | Salió el pasaje. Avanzá hasta el **transporte más cercano**. Si está libre, podés comprarlo; si tiene dueño, pagale el **doble** del alquiler. | Ir a transporte más cercano; alquiler ×2. |
| S6 | Salió el pasaje. Avanzá hasta el **transporte más cercano**. Si está libre, podés comprarlo; si tiene dueño, pagale el **doble** del alquiler. | (Segunda copia de S5.) |
| S7 | La cooperativa repartió excedentes. Cobrá ₲ 50.000. | +50. |
| S8 | **Salís de Tacumbú.** Guardá esta carta hasta usarla o vendérsela a otro jugador. | Carta de cárcel (se conserva). |
| S9 | Te olvidaste el tereré. **Retrocedé 3 casillas.** | Mover −3 y resolver la casilla. |
| S10 | Te agarraron en el semáforo sin cédula. **Vaya directo a Tacumbú.** No pasés por Salida, no cobrés ₲ 200.000. | Ir a 10 como preso. |
| S11 | Reparaciones generales en todas tus propiedades: pagá ₲ 25.000 por cada casa y ₲ 100.000 por cada hotel. | −25/casa, −100/hotel. |
| S12 | Multa de la Patrulla Caminera por exceso de velocidad. Pagá ₲ 15.000. | −15. |
| S13 | Viaje en colectivo a la **Terminal de Ómnibus**. Si pasás por Salida, cobrá ₲ 200.000. | Ir a 5; cobrar 200 si pasa Salida. |
| S14 | Recepción en el **Palacio de López**. Avanzá hasta ahí. | Ir a 39 (no pasa Salida). |
| S15 | Te eligieron presidente de la comisión vecinal. Pagá ₲ 50.000 a cada jugador. | −50 a cada jugador activo. |
| S16 | Venció tu certificado de ahorro. Cobrá ₲ 150.000. | +150. |

### 6.2 Cooperativa (16 cartas)

| # | Texto | Efecto |
|---|---|---|
| C1 | Fiesta de San Juan en el barrio. Avanzá hasta **Salida** y cobrá ₲ 200.000. | Ir a 0, cobrar 200. |
| C2 | Error a tu favor en la transferencia del banco. Cobrá ₲ 200.000. | +200. |
| C3 | Consulta médica en el IPS que igual pagaste particular. Pagá ₲ 50.000. | −50. |
| C4 | Vendiste tu cosecha de mandioca. Cobrá ₲ 50.000. | +50. |
| C5 | **Salís de Tacumbú.** Guardá esta carta hasta usarla o vendérsela a otro jugador. | Carta de cárcel (se conserva). |
| C6 | Te encontraron con mercadería sin factura en el Puente. **Vaya directo a Tacumbú.** No pasés por Salida, no cobrés ₲ 200.000. | Ir a 10 como preso. |
| C7 | Cobraste el aguinaldo. Cobrá ₲ 100.000. | +100. |
| C8 | La SET te devolvió el IVA. Cobrá ₲ 20.000. | +20. |
| C9 | ¡Es tu cumpleaños! Cada jugador te da ₲ 10.000. | +10 de cada jugador activo. |
| C10 | Venció tu seguro de vida. Cobrá ₲ 100.000. | +100. |
| C11 | Internación en sanatorio privado. Pagá ₲ 100.000. | −100. |
| C12 | Cuota del colegio de los chicos. Pagá ₲ 50.000. | −50. |
| C13 | Honorarios por una consultoría. Cobrá ₲ 25.000. | +25. |
| C14 | Te tocó el arreglo de las calles del barrio: pagá ₲ 40.000 por cada casa y ₲ 115.000 por cada hotel. | −40/casa, −115/hotel. |
| C15 | Segundo premio en el concurso de chipa. Cobrá ₲ 10.000. | +10. |
| C16 | Herencia de un tío en Encarnación. Cobrá ₲ 100.000. | +100. |

---

## 7. Interfaz del cliente

**Pantallas:**

1. **Inicio** — "Crear sala" / "Unirse con código". Nombre y elección de ficha.
2. **Lobby** — lista de jugadores, código para compartir (con botón copiar y link directo `nandepoly.app/sala/TERERE`), reglas caseras (solo el anfitrión), botón "Empezar" (mín. 2).
3. **Partida** — layout:
   - Centro: **tablero** 11×11 (CSS Grid), casillas con color de grupo, nombre, precio, mini-íconos de casas/hotel, fichas de los jugadores con animación de movimiento.
   - Derecha (o abajo en celular): **panel de jugadores** con efectivo, propiedades por color, cartas de cárcel, indicador de turno y conexión.
   - Barra inferior: **acciones del turno** (Tirar · Comprar · Subastar · Construir · Hipotecar · Intercambiar · Terminar turno), habilitadas solo cuando son legales.
   - Pestañas: **Registro** de eventos y **Chat**.
   - Diálogos modales: carta sacada, subasta en vivo (ofertas de todos, cuenta regresiva de 10 s tras la última oferta), propuesta de intercambio (arrastrar propiedades a cada lado), construcción (muestra el costo y respeta la regla de construcción pareja), impuesto (elegir ₲ 200.000 o 10 %), cárcel (pagar / carta / tirar).
4. **Fin** — ranking por patrimonio, botón "Revancha" (misma sala, mismos jugadores).

**Responsive:** desde 360 px (celular en vertical: tablero arriba, panel debajo con scroll) hasta escritorio. El tablero se escala con `aspect-ratio: 1` y `min(90vw, 80vh)`.

**Accesibilidad básica:** colores de grupo acompañados de nombre, foco visible, todo operable con teclado.

---

## 8. Servidor: salas y ciclo de vida

- `RoomManager` guarda `Map<roomCode, Room>`. Cada `Room` tiene el `GameState`, el mapa `playerToken → playerId`, y `lastActivity`.
- Al recibir un evento: buscar sala → validar payload (Zod) → verificar autorización (¿es el jugador correcto? ¿es su turno?) → `engine.applyAction` → guardar → `io.to(roomCode).emit('state:patch', ...)` + `game:events`.
- Cualquier excepción del motor se traduce a `error` para el emisor; el estado no cambia (el motor es puro: si tira, no hubo mutación).
- Limpieza: cada 5 min se eliminan salas sin actividad por 2 h (o se pasan a Redis con TTL de 24 h si Redis está activo).
- **Bots (opcional, fase 2):** estrategia simple — compra si tiene > ₲ 300.000 de margen, construye en su grupo más barato, paga para salir de la cárcel si puede, acepta intercambios que le den grupo completo.

---

## 9. Testing

**Unitarios del motor (Vitest):** un archivo por regla. Ejemplos de casos:
- Pasar por Salida cobra 200; caer en "Vaya a Tacumbú" no cobra.
- Tres dobles → cárcel; dos dobles → tercer tiro permitido.
- Alquiler sin monopolio, con monopolio (×2), con hotel; propiedad hipotecada no cobra.
- Construcción pareja: rechaza segunda casa si un hermano tiene cero.
- Banco sin casas: rechaza construir.
- Hipoteca y deshipoteca al 110 %; transferencia de hipotecada cobra 10 %.
- Carta "Retrocedé 3" desde 36 cae en 33 (Cooperativa) y saca otra carta.
- Quiebra con acreedor jugador transfiere todo; con el banco subasta.
- Intercambio inválido (propiedad con casas) es rechazado atómicamente.
- Partida completa simulada con RNG semillado hasta un ganador (test de humo, 2 y 6 jugadores).

**E2E (Playwright):** seis contextos de navegador crean/entran a la sala, juegan 20 turnos con acciones aleatorias legales, un jugador cierra la pestaña y reconecta, la partida sigue coherente.

---

## 10. Despliegue

Dos caminos, ambos documentados; recomiendo **empezar con la opción A** porque no depende de que tu PC esté encendida y los amigos entran con un link fijo.

### Opción A — Nube (recomendada)

**Proveedor sugerido: Fly.io** (alternativas equivalentes: Railway, Render). Costo estimado: **US$ 0-5/mes** en la instancia más chica (256 MB RAM alcanza de sobra para varias salas de 6). Región `gru` (São Paulo) para latencia de ~40 ms desde Paraguay.

```dockerfile
# Dockerfile (multi-stage)
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./public
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server/index.js"]
```

Pasos: `fly launch` → `fly deploy` → dominio `nandepoly.fly.dev` (o dominio propio con HTTPS automático). Socket.IO requiere WebSockets, que Fly/Railway/Render soportan sin configuración. Variables de entorno: `PORT`, `REDIS_URL` (opcional), `ROOM_TTL_HOURS`.

**CI/CD:** GitHub Actions corre tests y, si pasan en `main`, hace `fly deploy` automáticamente.

### Opción B — Desde tu PC

1. `pnpm install && pnpm build && pnpm start` → servidor en `http://localhost:8080`.
2. Exponer a internet **sin abrir puertos del router**:
   - **Tailscale** (gratis, privado): instalan Tailscale vos y tus amigos, se unen a tu red y entran a `http://<tu-ip-tailscale>:8080`. Ideal para un grupo fijo.
   - **ngrok** o **Cloudflare Tunnel** (gratis): `ngrok http 8080` te da un link público temporal `https://xxxx.ngrok.app` que compartís por WhatsApp. Más simple para invitados ocasionales.
3. También sirve en **LAN** para jugar en la misma casa desde celulares: `http://192.168.x.x:8080`.

Desventaja: la partida se corta si apagás la PC o se cae tu internet; las salas viven en memoria (activar el guardado en JSON local para retomar).

---

## 11. Plan de trabajo y estimación

| Fase | Entregable | Esfuerzo estimado |
|---|---|---|
| 1. Motor de reglas | `packages/engine` con tests verdes; jugable por consola. | 3-4 días |
| 2. Datos paraguayos | Tablero, cartas, fichas, textos en `es-PY`. | 1 día |
| 3. Servidor | Salas, protocolo, reconexión, persistencia en memoria. | 2 días |
| 4. Cliente web | Tablero, paneles, todos los diálogos, animaciones, responsive. | 5-6 días |
| 5. Integración y E2E | Partida de 6 en Playwright, pulido de UX. | 2 días |
| 6. Despliegue | Docker, Fly.io, CI, guía de uso. | 1 día |
| **Total** | Primera versión jugable con amigos | **~2-3 semanas** de trabajo efectivo |

Extras para una fase 2: bots, arte del tablero personalizado (ilustraciones de cada ciudad), sonidos, estadísticas de partidas, modo torneo, versión en guaraní.

---

## 12. Riesgos y decisiones abiertas

- **Nombre y arte:** confirmado "Ñandepoly". Falta definir logo y estilo visual (propongo paleta inspirada en el ñandutí y la bandera, tipografía redondeada).
- **Nombres de casillas:** la lista de la sección 5 es una propuesta; se puede cambiar cualquier ciudad/avenida sin tocar código (es un archivo de datos).
- **Estrictez de reglas digitales:** cobro de alquiler automático vs. manual, elección del impuesto antes de ver el 10 %. Propuesto: automático y "ver ambos" por defecto, con opción estricta.
- **Hosting:** Fly.io por defecto; si preferís no crear cuenta en ningún servicio, la opción B funciona desde el primer día.
- **Marca:** no usar "Monopoly" en ninguna parte visible del juego ni en el dominio.
