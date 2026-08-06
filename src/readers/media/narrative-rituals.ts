import type { ReaderId } from "../../contracts/types.js";

type Lang = "en" | "es";
type MappedReader = Exclude<ReaderId, "selena">;
export type NarrativeText = Readonly<Record<Lang, string>>;
export type NarrativeList = Readonly<Record<Lang, readonly string[]>>;

export interface NarrativeRitual {
  readonly medium: NarrativeText;
  readonly concealment: NarrativeText;
  readonly chance: NarrativeText;
  readonly continuation?: NarrativeText;
  readonly upright: NarrativeText;
  readonly reversed: NarrativeText;
  readonly beats: NarrativeList;
}

/**
 * These are physical and sensory generation ingredients, not finished prose.
 * The language model remains the sole author of the ritual scene shown to the
 * user. Archive provenance, mapping mechanics, counts and state-machine rules
 * deliberately do not appear here.
 */
const RITUALS: Readonly<Record<MappedReader, NarrativeRitual>> = {
  brennos: {
    medium: {
      en: "individually carved bones",
      es: "huesos tallados individualmente",
    },
    concealment: {
      en: "The carved bones remain hidden inside a shallow iron shield.",
      es: "Los huesos tallados permanecen ocultos dentro de un escudo de hierro poco profundo.",
    },
    chance: {
      en: "Brennos shakes the shield until one bone escapes the rim and strikes the fire-scarred table.",
      es: "Brennos agita el escudo hasta que un hueso supera el borde y golpea la mesa marcada por el fuego.",
    },
    upright: {
      en: "The bone rests wholly between the burnt cracks.",
      es: "El hueso queda por completo entre las grietas quemadas.",
    },
    reversed: {
      en: "The bone touches or crosses a burnt crack.",
      es: "El hueso toca o cruza una grieta quemada.",
    },
    beats: {
      en: ["iron shield", "bones striking iron", "one bone escaping", "impact on the table", "burnt cracks"],
      es: ["escudo de hierro", "huesos golpeando el hierro", "un hueso que escapa", "impacto sobre la mesa", "grietas quemadas"],
    },
  },
  yejide: {
    medium: {
      en: "large individually carved seeds",
      es: "semillas grandes talladas individualmente",
    },
    concealment: {
      en: "The carved seeds remain hidden in an opaque woven bag.",
      es: "Las semillas talladas permanecen ocultas en una bolsa tejida opaca.",
    },
    chance: {
      en: "Yejide reaches into the bag without looking, takes a concealed handful and casts it so that one seed separates from the rest.",
      es: "Yejide introduce la mano en la bolsa sin mirar, toma un puñado oculto y lo lanza para que una semilla se separe de las demás.",
    },
    upright: {
      en: "The chosen seed settles with its carving visible.",
      es: "La semilla elegida queda con la talla visible.",
    },
    reversed: {
      en: "The chosen seed settles with its carving against the surface, and Yejide turns it after the movement has ended.",
      es: "La semilla elegida queda con la talla contra la superficie, y Yejide la gira después de que termina el movimiento.",
    },
    beats: {
      en: ["opaque woven bag", "concealed handful", "seeds striking the desk", "one seed separating", "brief stillness before it is turned"],
      es: ["bolsa tejida opaca", "puñado oculto", "semillas golpeando la mesa", "una semilla que se separa", "breve quietud antes de girarla"],
    },
  },
  ngaru: {
    medium: {
      en: "painted seashells",
      es: "conchas marinas pintadas",
    },
    concealment: {
      en: "Painted shells remain hidden inside an opaque sea-worn bag.",
      es: "Las conchas pintadas permanecen ocultas dentro de una bolsa opaca desgastada por el mar.",
    },
    chance: {
      en: "The bag is brought close so one shell can be withdrawn by touch alone without seeing its painted surface.",
      es: "La bolsa se acerca para que se extraiga una concha solo mediante el tacto, sin ver su superficie pintada.",
    },
    upright: {
      en: "The shell carries its painting on the outer curved surface.",
      es: "La concha lleva la pintura en la superficie exterior curvada.",
    },
    reversed: {
      en: "The shell carries its painting on the inner hollow surface.",
      es: "La concha lleva la pintura en la superficie interior cóncava.",
    },
    beats: {
      en: ["sea-worn opaque bag", "shells shifting beneath cloth", "blind reach", "one shell withdrawn", "cool shell texture"],
      es: ["bolsa opaca desgastada por el mar", "conchas moviéndose bajo la tela", "búsqueda a ciegas", "una concha extraída", "textura fría de la concha"],
    },
  },
  ame: {
    medium: {
      en: "sakura, hasu, fuji and ajisai petals on collected rainwater",
      es: "pétalos de sakura, hasu, fuji y ajisai sobre agua de lluvia recogida",
    },
    concealment: {
      en: "Ame holds one gathered handful of sakura, hasu, fuji and ajisai petals above a shallow basin of collected rainwater.",
      es: "Ame sostiene un puñado de pétalos de sakura, hasu, fuji y ajisai sobre una cuenca poco profunda de agua de lluvia recogida.",
    },
    chance: {
      en: "Ame casts the full handful once across the basin, where the mixed petals touch the water and settle into separate areas.",
      es: "Ame lanza una sola vez el puñado completo sobre la cuenca, donde los pétalos mezclados tocan el agua y se posan en zonas separadas.",
    },
    continuation: {
      en: "Ame studies another area of the same basin while the petals from the first cast continue to rest or drift.",
      es: "Ame observa otra zona de la misma cuenca mientras los pétalos del primer lanzamiento continúan reposando o derivando.",
    },
    upright: {
      en: "The relevant petals have become still on the rainwater.",
      es: "Los pétalos pertinentes han quedado quietos sobre el agua de lluvia.",
    },
    reversed: {
      en: "The relevant petals continue to drift across the rainwater.",
      es: "Los pétalos pertinentes continúan a la deriva sobre el agua de lluvia.",
    },
    beats: {
      en: ["shallow basin of rainwater", "one mixed handful", "petals touching the water", "quiet movement in one area", "attention shifting across the basin"],
      es: ["cuenca poco profunda de agua de lluvia", "un puñado mezclado", "pétalos tocando el agua", "movimiento leve en una zona", "atención desplazándose por la cuenca"],
    },
  },
  amaru: {
    medium: {
      en: "knotted cords drawn from an opaque vessel",
      es: "cordones anudados extraídos de un recipiente opaco",
    },
    concealment: {
      en: "The knotted cords remain hidden inside a tall opaque vessel while Amaru mixes them by touch.",
      es: "Los cordones anudados permanecen ocultos dentro de un recipiente alto y opaco mientras Amaru los mezcla al tacto.",
    },
    chance: {
      en: "The vessel is brought close so one cord can be drawn without seeing its colour, knots or emerging end.",
      es: "El recipiente se acerca para que se extraiga un cordón sin ver su color, sus nudos ni el extremo que emerge.",
    },
    upright: {
      en: "The cord emerges from its marked front end.",
      es: "El cordón emerge por su extremo frontal marcado.",
    },
    reversed: {
      en: "The cord emerges from its marked rear end.",
      es: "El cordón emerge por su extremo posterior marcado.",
    },
    beats: {
      en: ["tall opaque vessel", "cords moving under Amaru's hand", "one cord drawn unseen", "one end emerging first", "knots settling along the stone"],
      es: ["recipiente alto y opaco", "cordones moviéndose bajo la mano de Amaru", "un cordón extraído sin verlo", "un extremo que emerge primero", "nudos posándose sobre la piedra"],
    },
  },
  nahid: {
    medium: {
      en: "incense-smoke patterns",
      es: "patrones de humo de incienso",
    },
    concealment: {
      en: "Heat, air currents and the changing ember keep the next smoke shape indistinct until it gathers.",
      es: "El calor, las corrientes de aire y la brasa cambiante mantienen indistinta la siguiente forma de humo hasta que se reúne.",
    },
    chance: {
      en: "Nahid lights the incense and waits without forcing the smoke while the first curls respond to the room's air.",
      es: "Nahid enciende el incienso y espera sin forzar el humo mientras las primeras volutas responden al aire de la estancia.",
    },
    upright: {
      en: "The smoke shape gathers and becomes clear.",
      es: "La forma de humo se reúne y se vuelve clara.",
    },
    reversed: {
      en: "The smoke shape separates while it is becoming clear.",
      es: "La forma de humo se separa mientras se vuelve clara.",
    },
    beats: {
      en: ["incense touching flame", "ember taking hold", "uncontrolled first curls", "smoke responding to air", "a shape gathering or loosening"],
      es: ["incienso tocando la llama", "una brasa que prende", "primeras volutas incontroladas", "humo respondiendo al aire", "una forma que se reúne o se afloja"],
    },
  },
  mictli: {
    medium: {
      en: "carved stone disks",
      es: "discos de piedra tallados",
    },
    concealment: {
      en: "The carved stone disks remain hidden in a dark covered vessel.",
      es: "Los discos de piedra tallados permanecen ocultos dentro de un recipiente oscuro y cubierto.",
    },
    chance: {
      en: "Mictli mixes the disks beneath the cover and draws one without exposing its carving.",
      es: "Mictli mezcla los discos bajo la cubierta y extrae uno sin exponer su talla.",
    },
    upright: {
      en: "The disk rests aligned with the line cut into the table.",
      es: "El disco queda alineado con la línea tallada en la mesa.",
    },
    reversed: {
      en: "The disk rests turned across the line cut into the table.",
      es: "El disco queda girado sobre la línea tallada en la mesa.",
    },
    beats: {
      en: ["covered stone vessel", "stone grinding against stone", "one disk drawn unseen", "weight settling on the table", "silence after the stone stops"],
      es: ["recipiente de piedra cubierto", "piedra rozando contra piedra", "un disco extraído sin verlo", "peso posándose sobre la mesa", "silencio cuando la piedra se detiene"],
    },
  },
};

export function narrativeRitualFor(reader: MappedReader): NarrativeRitual {
  return RITUALS[reader];
}
