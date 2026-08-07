import type { ApiReq, RitualOut } from "../contracts/types.js";
import { profileFor } from "../readers/profiles.js";
import { isMappedReader, mediumRitualFor, ritualPhase } from "../readers/media/runtime.js";
import { ritualParticipation } from "../readers/media/participation.js";
import { auditModelOut } from "./audit.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;

const spanish = (req: RitualReq): boolean => req.lang.toLocaleLowerCase().startsWith("es");

function pick(values: readonly string[], seed: number): string {
  return values[Math.abs(seed) % values.length] ?? values[0] ?? "";
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
    ritual: pick(rituals, Math.floor(seed / 16)),
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
    `${name} acerca ${context.medium} al centro silencioso del espacio y deja que el movimiento encuentre un ritmo pausado.`,
    `En la quietud de la estancia, ${name} vuelve su atención hacia ${context.medium} y espera antes de continuar.`,
    `${name} dispone ${context.medium} junto a la mesa, con ${beat} como único movimiento perceptible durante unos instantes.`,
    `Sin apresurarse, ${name} atiende a ${context.medium} mientras ${beat} mantiene la escena anclada en lo físico.`,
  ] : [
    `${name} brings the ${context.medium} into the quiet centre of the space and lets the movement find an unhurried rhythm.`,
    `In the still room, ${name} returns attention to the ${context.medium} and waits before continuing.`,
    `${name} settles the ${context.medium} beside the table, with ${beat} providing the only noticeable movement for a moment.`,
    `Without hurry, ${name} attends to the ${context.medium} while ${beat} keeps the scene grounded in the physical moment.`,
  ];

  const opening = phase === "opening"
    ? context.concealment
    : (es
      ? `El movimiento anterior ya se ha calmado; ahora ${beat} sostiene la atención sin alterar lo que permanece alrededor.`
      : `The earlier movement has settled; now ${beat} holds the attention without disturbing what remains around it.`);

  let action: string;
  if (participation.actor === "querent") {
    action = querentAction(req, Math.floor(seed / 5));
  } else if (phase === "continuation" && context.continuation) {
    action = context.continuation;
  } else {
    action = context.chance;
  }

  const tails = es ? [
    `${name} espera mientras ${secondBeat} pierde movimiento y deja que la escena termine en silencio antes de hablar.`,
    `El sonido se apaga alrededor de ${secondBeat}, y ${name} permite que el gesto concluya sin forzar todavía un significado.`,
    `Cuando ${secondBeat} vuelve a la calma, ${name} mantiene la atención en la escena física y no añade ninguna interpretación.`,
    `${name} deja que ${secondBeat} se asiente por completo, sosteniendo unos instantes más la quietud del lugar.`,
  ] : [
    `${name} waits while ${secondBeat} loses its motion, letting the scene end in silence before any words are offered.`,
    `The sound fades around ${secondBeat}, and ${name} allows the movement to finish without forcing a meaning yet.`,
    `As ${secondBeat} grows still, ${name} keeps attention on the physical scene and adds no interpretation.`,
    `${name} lets ${secondBeat} settle completely, holding the quiet of the place for a few moments longer.`,
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
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const seed = req.card + attempt;
    const candidate = isMappedReader(req.reader)
      ? mapped(req, seed)
      : selena(req, seed);
    if (candidate && auditModelOut(req, candidate).valid) return candidate;
  }
  return fallback;
}
