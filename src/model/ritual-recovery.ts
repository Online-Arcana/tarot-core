import type { ApiReq, RitualOut } from "../contracts/types.js";
import { profileFor } from "../readers/profiles.js";
import { isMappedReader, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { ritualParticipation } from "../readers/media/participation.js";
import { auditModelOut } from "./audit.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;

const spanish = (req: RitualReq): boolean => req.lang.toLocaleLowerCase().startsWith("es");

const AMBIENT_EN = [
  "A narrow band of lamplight drifts across the floor and fades beneath the table.",
  "Cool air brushes the room once, leaving the surrounding shadows unusually sharp.",
  "A muted scrape from the surface briefly interrupts the stillness, then disappears.",
  "The distant hush deepens as a little warmth gathers close to the working space.",
  "Soft reflected light catches a rough edge nearby before sliding back into darkness.",
  "A dry whisper of movement passes through the space and leaves no echo behind.",
  "The tabletop holds a faint vibration for a heartbeat before becoming completely still.",
  "A small change in the air makes the quiet feel closer and more concentrated.",
  "Dim light gathers along the working space while the corners of the room recede.",
  "A nearly inaudible rustle crosses the silence and vanishes before it can repeat.",
  "The cooler edge of the room contrasts with the slight warmth held near the centre.",
  "One soft shadow shifts across the surface, then settles into an unfamiliar angle.",
  "The surrounding stillness sharpens every tiny sound without giving any one of them importance.",
  "The air remains motionless long enough for the smallest remaining sound to become distinct.",
  "A dull glimmer appears briefly on the surface and disappears as the angle changes.",
  "The pause lengthens just enough for the room's ordinary noises to fall away.",
] as const;

const AMBIENT_ES = [
  "Una franja estrecha de luz cruza el suelo y se apaga bajo la mesa.",
  "El aire fresco roza la estancia una vez y deja las sombras alrededor más definidas.",
  "Un roce apagado sobre la superficie interrumpe brevemente la quietud y luego desaparece.",
  "El silencio lejano se hace más profundo mientras un poco de calor se reúne cerca del espacio de trabajo.",
  "La luz reflejada atrapa un borde áspero cercano antes de retirarse otra vez hacia la oscuridad.",
  "Un susurro seco de movimiento atraviesa el espacio y no deja ningún eco detrás.",
  "La mesa conserva una vibración tenue durante un instante antes de quedar completamente inmóvil.",
  "Un pequeño cambio en el aire hace que la quietud parezca más cercana y concentrada.",
  "La luz tenue se reúne sobre el espacio de trabajo mientras los rincones de la estancia retroceden.",
  "Un roce casi inaudible cruza el silencio y desaparece antes de poder repetirse.",
  "El borde más fresco de la estancia contrasta con el leve calor que permanece cerca del centro.",
  "Una sombra suave se desplaza sobre la superficie y luego se asienta en un ángulo distinto.",
  "La quietud alrededor vuelve nítido cada sonido pequeño sin dar importancia especial a ninguno.",
  "El aire permanece inmóvil el tiempo suficiente para que el sonido más leve se vuelva claro.",
  "Un brillo apagado aparece un instante sobre la superficie y desaparece cuando cambia el ángulo.",
  "La pausa se alarga lo suficiente para que los ruidos habituales de la estancia se desvanezcan.",
] as const;

function pick(values: readonly string[], seed: number): string {
  return values[Math.abs(seed) % values.length] ?? values[0] ?? "";
}

function ambient(req: RitualReq, seed: number): string {
  return pick(spanish(req) ? AMBIENT_ES : AMBIENT_EN, seed);
}

function querentAction(req: RitualReq, seed: number): string {
  const es = spanish(req);
  if (req.reader === "ngaru") {
    return pick(es ? [
      "Tú introduces la mano en la bolsa sin mirar y sacas una concha únicamente por el tacto.",
      "Sin mirar, tú sacas una concha de la bolsa por el tacto y mantienes oculta su superficie pintada.",
      "Tú metes una mano en la bolsa desgastada por el mar y extraes una concha sin mirar.",
      "Tú tomas una concha de la bolsa a ciegas, guiándote sólo por la textura fría bajo los dedos.",
    ] : [
      "You reach into the sea-worn bag without looking and withdraw one shell by touch alone.",
      "Without looking, you draw one shell from the opaque bag and keep its painted surface unseen.",
      "You put one hand into the sea-worn bag and take a single shell without looking.",
      "You pick one shell from the bag by touch alone, guided only by its cool texture.",
    ], seed);
  }
  return pick(es ? [
    "Tú introduces la mano en el recipiente sin mirar y sacas un cordón por el primer extremo que encuentras.",
    "Sin mirar, tú extraes un cordón del recipiente opaco por el primer extremo que toca tu mano.",
    "Tú metes una mano en el recipiente alto y tomas un cordón sin ver su color ni sus nudos.",
    "Tú sacas un cordón del recipiente únicamente por el tacto y dejas que el primer extremo encontrado guíe el movimiento.",
  ] : [
    "You reach into the tall opaque vessel without looking and draw one cord by the first end you encounter.",
    "Without looking, you withdraw one cord from the opaque vessel by the first end that meets your hand.",
    "You put one hand into the tall vessel and take a single cord without seeing its colour or knots.",
    "You draw one cord from the vessel by touch alone, letting the first end encountered guide the movement.",
  ], seed);
}

function selena(req: RitualReq, seed: number): RitualOut {
  const es = spanish(req);
  const name = profileFor(req.reader).public.name;
  const gestures = es ? [
    `${name} sostiene la baraja entre ambas manos y deja que el murmullo de la estancia se apague alrededor de la mesa.`,
    `${name} reúne la baraja cerca del borde de la mesa y acomoda sus manos con un movimiento lento y preciso.`,
    `Bajo la luz tranquila, ${name} acerca la baraja y deja un instante de silencio antes de moverla de nuevo.`,
    `${name} apoya la baraja frente a sí, endereza sus bordes y espera a que la quietud vuelva a la estancia.`,
  ] : [
    `${name} steadies the deck between both hands and lets the room grow quiet around the table.`,
    `${name} gathers the deck near the table edge and settles both hands around it with a slow, precise movement.`,
    `Under the softened light, ${name} draws the deck close and leaves a moment of silence before moving it again.`,
    `${name} rests the deck before her, squares its edges and waits for stillness to return to the room.`,
  ];
  const openings = es ? [
    "La pregunta permanece en el aire mientras el sonido leve del papel se vuelve lo único que rompe la quietud.",
    "Una pausa medida deja espacio para la pregunta sin apresurar ninguna respuesta ni convertirla todavía en interpretación.",
    "Las cartas permanecen cubiertas entre sus manos mientras la respiración de la estancia recupera un ritmo más lento.",
    "El silencio se alarga apenas un momento y la atención queda centrada en el gesto, no en lo que aún no se muestra.",
  ] : [
    "The question remains in the air while the faint sound of paper becomes the only break in the stillness.",
    "A measured pause gives the question room without rushing an answer or turning the moment into interpretation.",
    "The cards remain covered between her hands while the room settles into a slower, quieter rhythm.",
    "The silence lengthens for a moment and attention stays with the movement rather than what has not yet been shown.",
  ];
  const rituals = es ? [
    `${name} corta la baraja una vez, vuelve a unirla y deja la siguiente carta cubierta hasta que todo movimiento termina.`,
    `${name} mezcla con suavidad, detiene la baraja entre las palmas y separa una carta sin girarla todavía.`,
    `${name} desplaza una parte de la baraja, reúne de nuevo los montones y deja una carta preparada boca abajo.`,
    `${name} hace un último movimiento breve con la baraja y mantiene la carta siguiente oculta mientras la mesa vuelve a quedar inmóvil.`,
  ] : [
    `${name} cuts the deck once, joins it again and leaves the next card covered until every movement has stopped.`,
    `${name} shuffles softly, stills the deck between her palms and separates one card without turning it yet.`,
    `${name} shifts part of the deck, brings the packets together again and leaves one card waiting face down.`,
    `${name} makes one final quiet movement with the deck and keeps the next card concealed as the table becomes still again.`,
  ];
  return {
    gesture: pick(gestures, seed),
    opening: pick(openings, Math.floor(seed / 4)),
    ritual: `${pick(rituals, Math.floor(seed / 16))} ${ambient(req, seed)}`,
  };
}

function mapped(req: RitualReq, seed: number): RitualOut | null {
  if (!isMappedReader(req.reader)) return null;
  const context = mediumRitualFor(req.reader, req.lang);
  if (!context) return null;

  const es = spanish(req);
  const name = profileFor(req.reader).public.name;
  const phase = ritualPhase(req);
  const beat = pick(context.beats, Math.floor(seed / 4));
  const secondBeat = pick(context.beats, Math.floor(seed / 20) + 2);
  const participation = ritualParticipation(req.reader);

  const gestures = es ? [
    `${name} acerca ${context.medium} y deja que ${beat} ocupe el centro de la atención.`,
    `${name} vuelve hacia ${context.medium}; durante un instante, sólo ${beat} rompe la quietud.`,
    `Junto a la mesa, ${name} atiende a ${context.medium} mientras ${beat} marca el movimiento.`,
    `${name} dispone ${context.medium} sin prisa, con ${beat} sosteniendo la escena física.`,
  ] : [
    `${name} brings the ${context.medium} close and lets ${beat} take the centre of attention.`,
    `${name} turns back to the ${context.medium}; for a moment, only ${beat} breaks the stillness.`,
    `Beside the table, ${name} attends to the ${context.medium} while ${beat} marks the movement.`,
    `${name} settles the ${context.medium} without hurry, with ${beat} grounding the physical scene.`,
  ];

  const opening = phase === "opening" ? context.concealment : ambient(req, seed);

  let action: string;
  if (participation.actor === "querent") {
    action = querentAction(req, Math.floor(seed / 5));
  } else if (phase === "continuation" && context.continuation) {
    action = context.continuation;
  } else {
    action = context.chance;
  }

  const tails = es ? [
    `${name} espera hasta que ${secondBeat} queda en calma.`,
    `Al apagarse ${secondBeat}, ${name} deja que vuelva el silencio.`,
    `${name} observa cómo ${secondBeat} pierde su último movimiento.`,
    `Cuando ${secondBeat} se aquieta, ${name} no fuerza ningún significado.`,
    `${name} deja que ${secondBeat} termine de asentarse en silencio.`,
    `La atención de ${name} permanece con ${secondBeat} hasta que todo se calma.`,
    `${name} mantiene la pausa mientras ${secondBeat} deja de moverse.`,
    `Sin interpretar todavía, ${name} espera junto a ${secondBeat}.`,
  ] : [
    `${name} waits until ${secondBeat} becomes still.`,
    `As ${secondBeat} fades, ${name} lets silence return.`,
    `${name} watches ${secondBeat} lose its final movement.`,
    `When ${secondBeat} settles, ${name} forces no meaning onto it.`,
    `${name} lets ${secondBeat} finish settling in silence.`,
    `${name}'s attention remains with ${secondBeat} until everything grows quiet.`,
    `${name} holds the pause while ${secondBeat} stops moving.`,
    `Without interpreting yet, ${name} waits beside ${secondBeat}.`,
  ];

  return {
    gesture: pick(gestures, seed),
    opening,
    ritual: `${action} ${pick(tails, Math.floor(seed / 4) + 1)}`,
  };
}

export function recoverRitual(
  req: RitualReq,
  fallback: RitualOut,
): RitualOut {
  for (let attempt = 0; attempt < 192; attempt += 1) {
    const seed = req.card + attempt;
    const candidate = isMappedReader(req.reader)
      ? mapped(req, seed)
      : selena(req, seed);
    if (candidate && auditModelOut(req, candidate).valid) return candidate;
  }
  return fallback;
}
