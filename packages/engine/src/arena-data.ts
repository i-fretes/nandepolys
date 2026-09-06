import type { ArenaGame, GlobalEventId } from './types';

export const ARENA_GAMES: { id: ArenaGame; name: string; icon: string; desc: string; seconds: number }[] = [
  { id: 'trivia', name: 'Trivia relámpago', icon: '🧠', desc: 'Tres preguntas para todos. Puntos por acertar y por velocidad.', seconds: 45 },
  { id: 'cana', name: 'Caña dulce', icon: '🍬', desc: 'Cinco segundos: tocá la pantalla la mayor cantidad de veces.', seconds: 8 },
  { id: 'barra', name: 'Frená la barra', icon: '🎯', desc: 'La aguja va y viene. Frenala lo más cerca del centro. Tres intentos.', seconds: 25 },
  { id: 'cuantos', name: '¿Cuántos hay?', icon: '🔢', desc: 'Una pregunta con número. El que más se acerca gana.', seconds: 20 },
  { id: 'bomba', name: 'Palabra bomba', icon: '💣', desc: 'Escribí una palabra que contenga la sílaba antes de que explote. Dos vidas.', seconds: 180 },
  { id: 'sapos', name: 'Carrera de sapos', icon: '🐸', desc: 'Alterná izquierda y derecha con ritmo. Cada vez más rápido. Primero en llegar gana.', seconds: 25 },
  { id: 'oeste', name: 'Duelo del Oeste', icon: '🤠', desc: 'Cuando suene la campana, tocá a quién disparar. El más rápido dispara primero.', seconds: 60 },
  { id: 'rayo', name: 'Esquivá el rayo', icon: '⚡', desc: 'Elegí dónde pararte. Caen rayos. El último en pie gana.', seconds: 60 },
  { id: 'penales', name: 'Penales', icon: '⚽', desc: 'Tres penales: frená la fuerza y la dirección. El arquero se tira a un lado.', seconds: 40 },
  { id: 'globos', name: 'Ruleta rusa de globos', icon: '🎈', desc: 'Un globo tiene la aguja. Por turnos, pinchá uno. El que la encuentra, afuera.', seconds: 90 },
  { id: 'dibujo', name: 'Adiviná el dibujo', icon: '🎨', desc: 'Uno dibuja, los demás adivinan. El primero que acierta gana; el dibujante también cobra.', seconds: 60 },
];

export const ARENA_REWARDS = [300, 150, 50];

/** ¿Cuántos hay? — pregunta numérica y respuesta. */
export const CUANTOS: { q: string; a: number; unit?: string }[] = [
  { q: '¿Cuántos kilómetros hay de Asunción a Ciudad del Este por la Ruta PY02?', a: 327, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Encarnación?', a: 370, unit: 'km' },
  { q: '¿Cuántos departamentos tiene Paraguay?', a: 17 },
  { q: '¿En qué año se fundó Asunción?', a: 1537 },
  { q: '¿En qué año terminó la Guerra del Chaco?', a: 1935 },
  { q: '¿Cuántos metros de altura tiene el Cerro Tres Kandú?', a: 842, unit: 'm' },
  { q: '¿Cuántos kilómetros de largo tiene la represa de Itaipú (su muro)?', a: 8, unit: 'km' },
  { q: '¿Cuántos megavatios de potencia instalada tiene Itaipú?', a: 14000, unit: 'MW' },
  { q: '¿Cuántos habitantes tiene Paraguay aproximadamente (en millones, redondeá)?', a: 7 },
  { q: '¿Cuántos senadores tiene el Congreso paraguayo?', a: 45 },
  { q: '¿Cuántos diputados tiene la Cámara?', a: 80 },
  { q: '¿En qué año se independizó Paraguay?', a: 1811 },
  { q: '¿En qué año cayó Stroessner?', a: 1989 },
  { q: '¿Cuántos metros de largo tiene el Puente de la Amistad?', a: 552, unit: 'm' },
  { q: '¿Cuántas cuerdas tiene el arpa paraguaya clásica?', a: 36 },
  { q: '¿A qué altura sobre el nivel del mar está Asunción, aproximadamente?', a: 43, unit: 'm' },
  { q: '¿Cuántos kilómetros cuadrados tiene Paraguay (redondeá en miles)?', a: 406752, unit: 'km²' },
  { q: '¿Cuántos kilómetros tiene el río Paraguay?', a: 2621, unit: 'km' },
  { q: '¿En qué año Olimpia ganó su primera Copa Libertadores?', a: 1979 },
  { q: '¿En qué año ganó Paraguay la medalla de plata olímpica en fútbol?', a: 2004 },
  { q: '¿Cuántos jugadores tiene un equipo de fútbol en cancha?', a: 11 },
  { q: '¿Cuántas casas tiene el banco en Ñandepoly?', a: 32 },
  { q: '¿Cuántas casillas tiene el tablero de Ñandepoly?', a: 44 },
  { q: '¿Cuántos guaraníes (en miles) cuesta el Palacio de López en el tablero?', a: 400 },
  { q: '¿Cuántos grados llegó la temperatura récord en Paraguay (aprox.)?', a: 45, unit: '°C' },
  { q: '¿En qué año se promulgó la Constitución vigente?', a: 1992 },
  { q: '¿Cuántos kilómetros hay de Asunción a Concepción?', a: 415, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Pedro Juan Caballero?', a: 460, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Caacupé?', a: 54, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Villarrica?', a: 173, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Filadelfia (Chaco)?', a: 470, unit: 'km' },
  { q: '¿Cuántos kilómetros hay de Asunción a Pilar?', a: 358, unit: 'km' },
  { q: '¿Cuántos minutos dura un partido de fútbol sin alargue?', a: 90 },
  { q: '¿Cuántos años duró la dictadura de Stroessner?', a: 35 },
  { q: '¿Cuántos hijos tuvieron Tau y Kerana en la mitología guaraní?', a: 7 },
  { q: '¿Cuántas estrellas tiene el escudo de la bandera paraguaya?', a: 1 },
  { q: '¿En qué año murió el Mariscal López?', a: 1870 },
  { q: '¿Cuántos kilómetros tiene la Costanera de Asunción (primera etapa)?', a: 3, unit: 'km' },
  { q: '¿Cuántos días tiene un año bisiesto?', a: 366 },
  { q: '¿Cuántos guaraníes (en miles) cobrás al pasar por Salida?', a: 200 },
];

/** Sílabas para la Palabra bomba, de más fáciles a más difíciles. */
export const BOMB_SYLLABLES = {
  facil: ['CA', 'MA', 'TA', 'RA', 'PA', 'LA', 'SA', 'NA', 'DA', 'TO', 'CO', 'MO', 'RO', 'LO', 'TE', 'RE', 'ME', 'SE', 'DE', 'LE', 'AR', 'ER', 'OR', 'EN', 'AN', 'ES', 'AS', 'ON', 'IN', 'AL', 'EL'],
  medio: ['TOM', 'CAR', 'MAR', 'PAR', 'TRA', 'PRE', 'CON', 'COM', 'POR', 'PER', 'TER', 'MEN', 'CAN', 'TAN', 'SAN', 'PLA', 'BRA', 'GRA', 'FRE', 'DOR', 'DAD', 'CIA', 'CIO', 'ENT', 'ANT', 'IST', 'AST', 'OST', 'UND', 'AMB'],
  dificil: ['ÑA', 'ÑO', 'GUA', 'QUI', 'ZO', 'JU', 'XI', 'YU', 'HUE', 'PSI', 'BLI', 'CRU', 'FLU', 'GNO', 'TRU', 'OBS', 'ABS', 'ADJ', 'INM', 'EXT'],
};

/** Palabras paraguayas y guaraníes que también valen en la Palabra bomba (sin acentos). */
export const PARAGUAYISMOS = [
  'terere', 'chipa', 'mbeju', 'sopa', 'vori', 'kivevé', 'kiveve', 'mbaipy', 'chipaguasu', 'mburucuya', 'nanduti', 'aopoi', 'guarania', 'polca',
  'pombero', 'kurupi', 'jasy', 'jatere', 'luison', 'moñai', 'monai', 'tejujagua', 'karai', 'kuñatai', 'kunatai', 'mita', 'jaha', 'aguyje', 'nande', 'ñande',
  'mbarakaja', 'jagua', 'kavaju', 'karumbe', 'mborevi', 'kapiyva', 'yvyra', 'kaaguy', 'oga', 'tape', 'jopara', 'guarani', 'mate', 'yerba',
  'chipero', 'chipera', 'cocido', 'clerico', 'mandioca', 'tembiu', 'asado', 'chaco', 'guasu', 'mbokaja', 'yvoty', 'mbarete', 'kaigue', 'pytu', 'pyta', 'hovy', 'moroti',
  'sayju', 'pirevai', 'ñembo', 'nembo', 'vyro', 'tavy', 'mbore', 'nderakore', 'ndera', 'chake', 'nde', 'che', 'ore', 'pee', 'hae', 'aipo', 'kore', 'purete', 'mbaeteko',
  'tereremo', 'chipazo', 'guaranies', 'asuncion', 'luque', 'encarnacion', 'caacupe', 'villarrica', 'pilar', 'concepcion', 'itaipu', 'yacyreta', 'tacumbu',
  'lambare', 'capiata', 'aregua', 'itaugua', 'ypacarai', 'paraguari', 'caaguazu', 'guaira', 'itapua', 'misiones', 'amambay', 'boqueron', 'chaqueño', 'chaqueno',
  'sapukai', 'purahei', 'galopera', 'chamame', 'kyre', 'yvaga', 'jopoi', 'tupa', 'tupasy', 'karaiguasu', 'mbaracaya', 'jaguarete', 'mburuvicha', 'tekove', 'tekoha',
];

/** Palabras para Adiviná el dibujo (objetos y cosas paraguayas). */
export const DRAW_WORDS = [
  'mate', 'terere', 'chipa', 'arpa', 'carreta', 'sopa paraguaya', 'bombilla', 'guampa', 'jaguarete', 'carpincho', 'tucan', 'ñandu', 'lapacho', 'cocotero',
  'puente', 'represa', 'colectivo', 'moto', 'estadio', 'pelota', 'bandera', 'escudo', 'palacio', 'catedral', 'rio', 'canoa', 'pescado', 'surubi', 'sandia', 'mandioca',
  'asado', 'parrilla', 'sombrero', 'poncho', 'guitarra', 'acordeon', 'globo', 'cohete', 'toro', 'vaca', 'caballo', 'gallo', 'pombero', 'luna', 'sol', 'tormenta',
  'arbol', 'flor', 'ñanduti', 'hamaca', 'casa', 'iglesia', 'cerro', 'aeropuerto', 'avion', 'tren', 'bicicleta', 'heladera', 'ventilador', 'termo', 'yerba',
];

export const EVENTS: { id: GlobalEventId; name: string; icon: string; desc: string; instant: boolean }[] = [
  { id: 'tranquilidad', name: 'Tranquilidad', icon: '😌', desc: 'Una vuelta normal. Disfrutá la calma.', instant: true },
  { id: 'hora_feliz', name: 'Hora feliz', icon: '🍻', desc: 'Todos los alquileres se cobran doble durante esta vuelta.', instant: false },
  { id: 'paro_ande', name: 'Paro de la ANDE', icon: '🔌', desc: 'Servicios y transportes no cobran alquiler esta vuelta.', instant: false },
  { id: 'aguinaldo', name: 'Aguinaldo', icon: '💰', desc: 'Todos cobran ₲ 100.000 del banco.', instant: true },
  { id: 'control_set', name: 'Control de la SET', icon: '🕵️', desc: 'El que más efectivo tiene paga el 10 % al banco.', instant: true },
  { id: 'boom', name: 'Boom inmobiliario', icon: '🏗️', desc: 'Casas y hoteles a mitad de precio durante esta vuelta.', instant: false },
  { id: 'inflacion', name: 'Inflación', icon: '📈', desc: 'Todos los alquileres suben 50 % durante esta vuelta.', instant: false },
  { id: 'dia_nino', name: 'Día del Niño', icon: '🎈', desc: 'El jugador con menor patrimonio cobra ₲ 200.000.', instant: true },
  { id: 'ruta_cortada', name: 'Ruta cortada', icon: '🚧', desc: 'Esta vuelta se mueve con un solo dado.', instant: false },
  { id: 'amnistia', name: 'Amnistía', icon: '🕊️', desc: 'Todos los presos salen de Tacumbú gratis.', instant: true },
  { id: 'sequia', name: 'Sequía', icon: '🌵', desc: 'Los solares sin casas no cobran alquiler esta vuelta.', instant: false },
  { id: 'san_juan', name: 'Fiesta de San Juan', icon: '🔥', desc: 'Pasar por Salida paga el doble durante esta vuelta.', instant: false },
  { id: 'mudanza', name: 'Mudanza', icon: '🚚', desc: 'Dos jugadores al azar intercambian su posición en el tablero.', instant: true },
  { id: 'solidaria', name: 'Cooperativa solidaria', icon: '🤲', desc: 'El de mayor efectivo le da ₲ 100.000 al de menor.', instant: true },
  { id: 'corte_ruta', name: 'Corte de ruta', icon: '🛣️', desc: 'Los transportes cobran el triple durante esta vuelta.', instant: false },
  { id: 'remate', name: 'Remate del banco', icon: '🔨', desc: 'Se subasta una propiedad libre al azar, desde ₲ 10.000.', instant: true },
  { id: 'terremoto', name: 'Terremoto', icon: '🌋', desc: 'Cada jugador pierde una casa al azar (el banco la recompra a mitad de precio).', instant: true },
  { id: 'loteria', name: 'Lotería', icon: '🎟️', desc: 'Sale un número: quien saque esa suma en su tirada esta vuelta cobra ₲ 300.000.', instant: false },
  { id: 'noche_casino', name: 'Noche de casino', icon: '🎰', desc: 'La ruleta paga doble y la apuesta máxima se duplica esta vuelta.', instant: false },
  { id: 'presidente', name: 'Visita del presidente', icon: '🎩', desc: 'Nadie paga alquiler en el Palacio de López esta vuelta, y quien caiga ahí cobra ₲ 100.000.', instant: false },
];

export interface MissionDef { id: string; text: string; reward: number; check: string }
/** Catálogo de misiones secretas. `check` es el nombre del contador/condición que evalúa el motor. */
export const MISSIONS: MissionDef[] = [
  { id: 'grupo', text: 'Completá un grupo de color', reward: 250, check: 'fullGroup' },
  { id: 'tres_alq', text: 'Cobrá 3 alquileres en una misma vuelta', reward: 200, check: 'rentsThisLap>=3' },
  { id: 'cinco_alq', text: 'Cobrá 5 alquileres en la partida', reward: 150, check: 'rentsCollected>=5' },
  { id: 'subasta_barata', text: 'Ganá una subasta por menos de ₲ 100.000', reward: 150, check: 'cheapAuctionWins>=1' },
  { id: 'subastas', text: 'Ganá 2 subastas', reward: 200, check: 'auctionsWon>=2' },
  { id: 'trivia', text: 'Ganá un desafío de trivia', reward: 200, check: 'triviaWins>=1' },
  { id: 'desafios', text: 'Ganá 2 desafíos', reward: 250, check: 'challengesWon>=2' },
  { id: 'casino', text: 'Ganá una apuesta en el Casino', reward: 150, check: 'casinoWins>=1' },
  { id: 'casas', text: 'Construí 4 casas', reward: 200, check: 'housesBuilt>=4' },
  { id: 'hotel', text: 'Construí un hotel', reward: 300, check: 'hotelsBuilt>=1' },
  { id: 'trade', text: 'Cerrá un intercambio con otro jugador', reward: 150, check: 'trades>=1' },
  { id: 'trades2', text: 'Cerrá 2 intercambios', reward: 250, check: 'trades>=2' },
  { id: 'preso', text: 'Caé preso en Tacumbú (y salí)', reward: 100, check: 'jailVisits>=1' },
  { id: 'efectivo', text: 'Tené ₲ 2.500.000 en efectivo', reward: 200, check: 'cash>=2500' },
  { id: 'patrimonio', text: 'Alcanzá un patrimonio de ₲ 3.000.000', reward: 250, check: 'netWorth>=3000' },
  { id: 'vueltas', text: 'Completá 4 vueltas al tablero', reward: 150, check: 'laps>=4' },
  { id: 'dobles', text: 'Sacá dobles 3 veces', reward: 150, check: 'doubles>=3' },
  { id: 'transportes', text: 'Tené 3 transportes', reward: 250, check: 'transports>=3' },
  { id: 'servicios', text: 'Tené ANDE y ESSAP', reward: 200, check: 'utilities>=2' },
  { id: 'ocho_prop', text: 'Tené 8 propiedades', reward: 250, check: 'properties>=8' },
  { id: 'hipoteca', text: 'Deshipotecá una propiedad', reward: 100, check: 'mortgagesRedeemed>=1' },
  { id: 'arena', text: 'Ganá una Arena', reward: 200, check: 'arenaWins>=1' },
  { id: 'don', text: 'Ganá un doble o nada de alquiler', reward: 150, check: 'donWins>=1' },
  { id: 'duelo', text: 'Ganá un Duelo mayor', reward: 300, check: 'duelsWon>=1' },
  { id: 'jackpot', text: 'Llevate el Jackpot', reward: 300, check: 'jackpots>=1' },
  { id: 'azul', text: 'Comprá una propiedad azul', reward: 150, check: 'ownsGroupAny:azul' },
  { id: 'marron', text: 'Tené las dos propiedades marrones', reward: 150, check: 'fullGroup:marron' },
  { id: 'palacio', text: 'Sé dueño del Palacio de López', reward: 200, check: 'owns:43' },
  { id: 'costanera', text: 'Sé dueño de la Costanera', reward: 200, check: 'owns:41' },
  { id: 'salidas', text: 'Pasá por Salida 3 veces', reward: 100, check: 'salaries>=3' },
];

/** Premios de la caja sorpresa de Salida. Promedio ≈ ₲ 200.000. */
export const LOOTBOX: { id: string; label: string; amount: number; weight: number }[] = [
  { id: 'g100', label: '₲ 100.000', amount: 100, weight: 16 },
  { id: 'g150', label: '₲ 150.000', amount: 150, weight: 20 },
  { id: 'g200', label: '₲ 200.000', amount: 200, weight: 22 },
  { id: 'g250', label: '₲ 250.000', amount: 250, weight: 15 },
  { id: 'g300', label: '₲ 300.000', amount: 300, weight: 10 },
  { id: 'g500', label: '₲ 500.000', amount: 500, weight: 5 },
  { id: 'casa', label: '¡Casa gratis!', amount: 0, weight: 4 },
  { id: 'carcel', label: 'Carta: Salís de Tacumbú', amount: 0, weight: 3 },
  { id: 'tirada', label: '¡Tirada extra!', amount: 0, weight: 3 },
  { id: 'multa', label: 'Multa de tránsito: −₲ 50.000', amount: -50, weight: 2 },
];
