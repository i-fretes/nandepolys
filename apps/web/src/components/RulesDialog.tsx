import { useState } from 'react';
import { useStore } from '../store';
import Modal from './Modal';

const SECTIONS: { title: string; icon: string; body: React.ReactNode }[] = [
  {
    title: 'Objetivo', icon: '🏆',
    body: <p>Ser el último jugador con plata. Comprás propiedades, cobrás alquiler a los que caen en ellas, construís casas y hoteles para cobrar más, y hacés quebrar a los demás. Si la partida tiene límite de tiempo, gana el de mayor patrimonio (efectivo + propiedades + edificios).</p>,
  },
  {
    title: 'Tu turno', icon: '🎲',
    body: <p>Tocá <b>Tirar dados</b> y tu ficha avanza. Resolvés la casilla (comprar, pagar alquiler, carta, impuesto). Si sacaste <b>dobles</b>, volvés a tirar; con <b>tres dobles seguidos</b> vas preso. Cuando terminás, <b>Terminar turno</b>. Cada vez que pasás por Salida cobrás ₲ 200.000.</p>,
  },
  {
    title: 'Comprar y subastar', icon: '🏷️',
    body: <p>Si caés en una propiedad libre, podés comprarla al precio de la casilla. Si no la comprás, <b>se subasta</b> entre todos (vos incluido): la oferta mínima es ₲ 10.000 y gana la más alta cuando los demás se retiran. Hay 20 segundos entre ofertas para que nadie trabe la partida.</p>,
  },
  {
    title: 'Alquileres', icon: '💵',
    body: (
      <p>Caer en una propiedad ajena paga alquiler automáticamente. Con el <b>grupo de color completo</b> el alquiler de los solares se duplica, y ahí podés construir. Los <b>transportes</b> cobran ₲ 25.000 / 50.000 / 100.000 / 200.000 según cuántos tenga el dueño (1 a 4). <b>ANDE y ESSAP</b> cobran 4 veces los dados (o 10 veces con ambos), en miles. Una propiedad hipotecada no cobra. Tocá cualquier casilla para ver su título con todos los valores.</p>
    ),
  },
  {
    title: 'Construir', icon: '🏠',
    body: <p>Con el grupo completo y sin hipotecas en el grupo, en <b>Propiedades</b> comprás casas (hasta 4 por solar) y luego un hotel. Se construye <b>parejo</b>: no podés poner la segunda casa en un solar si otro del grupo tiene cero. Se venden al banco a mitad de precio, también parejo. El banco tiene 32 casas y 12 hoteles; si se acaban, hay que esperar a que alguien venda.</p>,
  },
  {
    title: 'Hipotecas', icon: '🏦',
    body: <p>Podés hipotecar una propiedad sin edificios por la <b>mitad de su precio</b>. Mientras esté hipotecada no cobra alquiler (pero sí cuenta para completar el grupo). Para levantar la hipoteca pagás el valor <b>más 10 %</b>.</p>,
  },
  {
    title: 'Negociar', icon: '🤝',
    body: <p>Con <b>Intercambiar</b> le proponés a otro jugador un canje: efectivo, propiedades y cartas de "Salís de Tacumbú", en cualquier combinación. El otro acepta o rechaza y se aplica todo junto. Podés negociar en cualquier momento, incluso fuera de tu turno o estando preso. Las propiedades con casas no se intercambian: vendé las casas primero. Usá el chat para regatear.</p>,
  },
  {
    title: 'Cartas', icon: '❓',
    body: <p>Al caer en <b>Suerte</b> o <b>Cooperativa</b> sacás una carta y su efecto se aplica solo: cobrar, pagar, moverte, ir preso o reparaciones (pagás por cada casa y hotel). La carta <b>"Salís de Tacumbú"</b> la guardás (aparece un 🎟️ al lado de tu nombre) hasta usarla o vendérsela a alguien.</p>,
  },
  {
    title: 'Impuestos', icon: '🧾',
    body: <p><b>Impuesto a la Renta (SET)</b>: elegís pagar ₲ 200.000 o el 10 % de tu patrimonio; te mostramos ambos montos. <b>Impuesto al lujo</b>: ₲ 100.000. Con la regla casera del pozo, impuestos y multas se acumulan en Estacionamiento Libre y se los lleva quien cae ahí.</p>,
  },
  {
    title: 'Tacumbú (cárcel)', icon: '🚔',
    body: <p>Vas preso por caer en "Vaya a Tacumbú", por una carta o por tres dobles seguidos. No cobrás Salida al ir. Para salir: pagás ₲ 50.000 antes de tirar, usás una carta 🎟️, o sacás dobles (avanzás y no repetís). Al tercer turno sin dobles, pagás ₲ 50.000 sí o sí y avanzás. Preso podés cobrar alquileres, construir y negociar. Caer en la casilla "solo de visita" no hace nada.</p>,
  },
  {
    title: 'Deudas y quiebra', icon: '💸',
    body: <p>Si tenés que pagar y no te alcanza el efectivo, el juego te frena: hipotecá, vendé edificios o negociá hasta juntar la plata y tocá <b>Pagar</b>. Si ni vendiendo todo alcanza, quebrás: tus bienes pasan a quien le debías (o vuelven al banco y se subastan si era el banco). Quedás como espectador.</p>,
  },
  {
    title: 'Casino (dos casillas) y Jackpot', icon: '🎰',
    body: <p>Con la opción activada, las dos casillas 🎰 (a los lados del tablero) son <b>Casinos</b>. Sin la opción son casillas de descanso. Al caer podés apostar una vez (o irte sin apostar): <b>Ruleta</b> (49 % ganás lo apostado), <b>Quiniela</b> (elegís la suma de los dados: el 7 paga 5 veces, el 2 y el 12 pagan 30), <b>Doble o nada</b> (par dobla, impar perdés todo; retirate cuando quieras, hasta 4 pasos), <b>Carrera de carretas</b> (seis carretas, paga 5 a 1). Con el <b>Jackpot</b> activo, todo lo que se pierde se acumula y se lo lleva quien saque doble seis en su tirada normal.</p>,
  },
  {
    title: 'Doble o nada en alquileres', icon: '🎲',
    body: <p>Con la opción activada, al caer en propiedad ajena podés <b>pagar</b> o <b>proponer doble o nada</b>. El dueño decide si acepta: si acepta, tirás los dados; con <b>7 o más no pagás nada</b>, con <b>6 o menos pagás el doble</b>. Si rechaza, pagás lo normal. Solo podés proponerlo si podrías cubrir el doble.</p>,
  },
  {
    title: 'Desafíos', icon: '⚔️',
    body: <p>Con la opción activada, en tu turno podés <b>Desafiar</b> a otro jugador por una apuesta; puede rechazar. Además entran dos cartas <b>¡Desafío!</b> al mazo: si la sacás, elegís rival y mini-juego por ₲ 100.000 y <b>no puede negarse</b>. Mini-juegos: <b>Duelo de dados</b> (mayor gana), <b>Piedra, papel o tijera</b> (mejor de tres, elecciones secretas), <b>Trivia paraguaya</b> (primero que acierta gana; si fallan los dos, otra pregunta, hasta tres) y <b>Tereré caliente</b> (cuando aparece el tereré, tocá primero; si te adelantás, perdés).</p>,
  },
  {
    title: 'La Arena', icon: '🏟️',
    body: (
      <div className="space-y-2">
        <p>Con la opción activada, hay dos casillas 🏟️ (arriba y abajo). Cuando alguien cae, <b>todos juegan a la vez</b> un mini-juego: se sortean 3 y se <b>vota</b> durante 8 segundos (empate: al azar). Nadie apuesta plata: <b>el banco paga</b> ₲ 300.000 / 150.000 / 50.000 a los tres primeros, y si gana el jugador que tiene <b>menos efectivo</b>, <b>cobra doble</b> (₲ 600.000).</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>🧠 Trivia relámpago</b>: 3 preguntas, 15 s cada una; 3 puntos por acertar + bonus por rapidez.</li>
          <li><b>🍬 Caña dulce</b>: 5 segundos tocando la pantalla lo más rápido posible.</li>
          <li><b>🎯 Frená la barra</b>: la aguja va y viene; frenala en el centro. 3 intentos, cuenta el mejor.</li>
          <li><b>🔢 ¿Cuántos hay?</b>: una pregunta con número; gana quien más se acerca.</li>
          <li><b>💣 Palabra bomba</b>: escribí una palabra que contenga la sílaba (TOM → TOMATE) antes de que explote; la mecha es secreta. Sin acentos y da igual mayúsculas. 2 vidas. Vale el diccionario español y los paraguayismos.</li>
          <li><b>🐸 Carrera de sapos</b>: pista vertical de 3 carriles; el sapo salta solo y cada vez más rápido. Vos solo cambiás de carril con ← → (A / D) o los dos botones del celular. Si caés en un charco quedás afuera. Gana el primero que llega a la meta (fila 60); después, quien llegó más lejos.</li>
          <li><b>🤠 Duelo del Oeste</b>: esperá la campana y tocá a quién disparar; el más rápido dispara primero. Disparar antes traba el revólver.</li>
          <li><b>⚡ Esquivá el rayo</b>: elegí una casilla; en 3 segundos caen rayos en un tercio del tablero. El último en pie gana.</li>
          <li><b>⚽ Penales</b>: tres penales; un toque fija la fuerza (ni flojo ni por arriba) y otro la dirección. El arquero se tira a un lado.</li>
          <li><b>🎈 Ruleta rusa de globos</b>: un globo esconde la aguja; por turnos cada uno pincha uno. Quien la encuentra queda afuera, se inflan globos nuevos y siguen los demás hasta que queda uno.</li>
          <li><b>🎨 Adiviná el dibujo</b>: quien cayó dibuja; el primero que acierta gana y el dibujante también cobra.</li>
        </ul>
      </div>
    ),
  },
  {
    title: 'Caja sorpresa', icon: '🎁',
    body: <p>Con la opción activada, al pasar por Salida <b>no cobrás ₲ 200.000 fijos</b>: se abre un carrete con premios que frena al azar. Hay billetes de ₲ 100.000 a 500.000, una <b>casa gratis</b> (si tenés un grupo completo; si no, ₲ 100.000), una carta de <b>Salís de Tacumbú</b>, una <b>tirada extra</b> y, con poca suerte, una <b>multa</b> de ₲ 50.000. En promedio da ≈ ₲ 200.000, así que la partida no se desbalancea.</p>,
  },
  {
    title: 'Misiones secretas', icon: '🎯',
    body: <p>Al empezar recibís <b>3 misiones</b> que solo vos ves (los demás ven cuántas cumpliste). Por ejemplo: completar un grupo, cobrar 3 alquileres en una misma vuelta, ganar un desafío, hipotecar y deshipotecar, sacar dobles seguidos… Se controlan solas y <b>se pagan al instante</b> (₲ 100.000 a 300.000) con una animación dorada.</p>,
  },
  {
    title: 'Eventos globales', icon: '🌪️',
    body: <p>Cada vez que la mesa completa una <b>vuelta</b> (vuelve a tirar quien abrió la ronda), gira una <b>ruleta</b> de 20 eventos. <b>2 de cada 3 giros salen "Tranquilidad"</b> (no pasa nada). Los demás duran una vuelta o se aplican al instante: Hora feliz (alquileres ×2), Paro de la ANDE (servicios y transportes no cobran), Aguinaldo (todos cobran 100), Control de la SET (el más rico paga 10 %), Boom inmobiliario (construir a mitad de precio), Inflación (alquileres ×1,5), Día del Niño (el más pobre cobra 200), Ruta cortada (se mueve con un solo dado), Amnistía (salen todos los presos), Sequía (solares sin casas no cobran), San Juan (sueldo doble en Salida), Mudanza (dos jugadores cambian de lugar), Cooperativa solidaria (el más rico le da 100 al más pobre), Corte de ruta (transportes ×3), Remate del banco (se subasta una propiedad libre), Terremoto (una casa al azar se cae), Lotería (quien saque la suma sorteada cobra 300), Noche de casino (ruleta paga ×3 y apuesta máxima ×2) y Visita del presidente (el Palacio no cobra y regala 100).</p>,
  },
  {
    title: 'Duelo mayor', icon: '🔫',
    body: (
      <div className="space-y-2">
        <p>Cada <b>3 vueltas</b> completas ganás una <b>ficha</b> 🔫. En tu turno la gastás para retar a alguien por <b>hasta ₲ 500.000</b>. Si el rival se niega, te paga ₲ 50.000 y conservás la ficha. El anfitrión puede anular un duelo trabado.</p>
        <p><b>Escopeta</b>: se cargan de 1 a 4 cartuchos de verdad y de 1 a 4 de fogueo, mezclados; se anuncia cuántos hay de cada uno. Por turnos elegís <b>dispararte</b> (si sale de fogueo, seguís vos) o <b>disparar al rival</b> (pasa el turno). 3 vidas cada uno. Ítems: 🔍 <b>lupa</b> (mirás el próximo cartucho), 🍺 <b>cerveza</b> (lo expulsás) y ⛓️ <b>esposas</b> (el rival pierde el turno). Cuando se vacía, se recarga.</p>
        <p><b>Truco paraguayo</b> mano a mano, <b>a 2 manos</b> (gana el que suma más puntos; si empatan, una mano más; a 15 termina antes): envido (2), envido + envido (4), real envido (3), falta envido (lo que le falta al que va ganando), <b>flor</b> (3 cartas del mismo palo: 3 puntos automáticos), truco (2), retruco (3) y vale cuatro (4). El 1 de espada manda; después 1 de basto, 7 de espada, 7 de oro, los 3, los 2, los 1 falsos, 12, 11, 10, 7 falsos, 6, 5 y 4. Solo vos ves tu mano.</p>
      </div>
    ),
  },
  {
    title: 'Si alguien se va', icon: '🚪',
    body: <p>Si un jugador se desconecta, puede volver con el mismo link y sigue con su jugador. Si no vuelve, el anfitrión puede <b>reemplazarlo por un bot</b> (recupera el control cuando regrese) o <b>sacarlo</b> de la partida (sus propiedades se subastan). También podés activar un tiempo por turno en el lobby para que la partida nunca quede trabada.</p>,
  },
];

export default function RulesDialog() {
  const open = useStore(s => s.rulesOpen);
  const setOpen = useStore(s => s.setRulesOpen);
  const settings = useStore(s => s.state?.settings);
  const [active, setActive] = useState(0);
  const houseRules = settings ? [
    settings.freeParkingPot && 'Pozo en Estacionamiento Libre',
    settings.doubleGoSalary && 'Doble sueldo al caer exacto en Salida',
    !settings.auctions && 'Sin subastas (la propiedad rechazada queda libre)',
    settings.noBuyFirstLap && 'Sin compras en la primera vuelta',
    settings.turnTimerSeconds > 0 && `Tiempo por turno: ${settings.turnTimerSeconds} s`,
    settings.timeLimitMinutes > 0 && `Duración máxima: ${settings.timeLimitMinutes} min`,
    settings.startingCash !== 1500 && `Efectivo inicial: ₲ ${(settings.startingCash * 1000).toLocaleString('es-PY')}`,
    settings.casino && `Casinos (apuesta máxima ₲ ${(settings.casinoMaxBet * 1000).toLocaleString('es-PY')})`,
    settings.jackpot && 'Jackpot del Casino (doble seis)',
    settings.rentDoubleOrNothing && 'Alquiler a doble o nada',
    settings.challenges && 'Desafíos entre jugadores y cartas ¡Desafío!',
    settings.duels && 'Duelo mayor (ficha cada 3 vueltas: Escopeta o Truco)',
    settings.arena && 'La Arena (mini-juegos para todos)',
    settings.lootbox && 'Caja sorpresa al pasar por Salida',
    settings.missions && 'Misiones secretas',
    settings.events && 'Eventos globales (ruleta cada vuelta de mesa)',
  ].filter(Boolean) as string[] : [];

  return (
    <Modal open={open} onClose={() => setOpen(false)} width="max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">📖 Cómo se juega</h2>
        <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {SECTIONS.map((s, i) => (
            <button key={s.title} onClick={() => setActive(i)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm font-semibold ${i === active ? 'bg-py-red text-white' : 'bg-cream hover:bg-black/5'}`}>
              {s.icon} {s.title}
            </button>
          ))}
        </nav>
        <div className="rounded-2xl bg-cream p-4 text-[15px] leading-relaxed">
          <h3 className="text-lg font-black">{SECTIONS[active].icon} {SECTIONS[active].title}</h3>
          <div className="mt-2">{SECTIONS[active].body}</div>
          {active === 0 && houseRules.length > 0 && (
            <div className="mt-4 rounded-xl bg-white p-3 text-sm">
              <b>Reglas caseras activas en esta sala:</b>
              <ul className="mt-1 list-inside list-disc">{houseRules.map(r => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {active === 0 && houseRules.length === 0 && settings && (
            <p className="mt-4 text-sm text-ink/60">Esta sala juega con las reglas oficiales, sin reglas caseras.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
