export interface FallbackCatalogue {
  readonly invite: string;
  readonly fitReason: string;
  readonly fitOffer: string;
  readonly ritualGesture: string;
  readonly ritualOpening: string;
  readonly ritual: string;
  readonly readGesture: string;
  readonly readOpening: string;
  readonly readLink: string;
  readonly cardText: string;
  readonly synthesis: string;
  readonly reading: string;
  readonly closing: string;
  readonly note: string;
  readonly chatGesture: string;
  readonly chatResponse: string;
  readonly suggestions: readonly [string, string, string];
  readonly continuation: string;
  readonly title: string;
  readonly handoverSummary: string;
  readonly handoverUnresolved: string;
  readonly returning: string;
}

const en: FallbackCatalogue = {
  invite: "Tell me what you would like the cards to explore.",
  fitReason: "Your question can be explored thoughtfully with this reader.",
  fitOffer: "You can continue here, and the reading will stay focused on your question.",
  ritualGesture: "The reader steadies the deck between both hands and lets the room become quiet around you.",
  ritualOpening: "A measured breath creates enough space for your question to settle without forcing an answer.",
  ritual: "When you are ready, the next card can be revealed and considered with care.",
  readGesture: "The reader gathers the cards into a clear line and pauses so each image can hold its own place.",
  readOpening: "Your question remains at the centre while the spread is considered as one connected pattern.",
  readLink: "The message now moves from the individual cards towards what they ask you to notice together.",
  cardText: "This card draws your attention to the choices, feelings and circumstances surrounding this position. Consider what it asks you to recognise before deciding how you want to respond.",
  synthesis: "Taken together, the cards ask you to separate what is already clear from what still needs time. You can move forward by trusting the consistent themes while remaining open about the parts that have not fully settled.",
  reading: "The reading points you towards a careful, grounded response rather than a rushed conclusion. Notice which part of the message feels immediately recognisable, then compare it with the practical choices available to you. The cards can clarify a pattern, but you remain responsible for deciding what is true, useful and appropriate in your circumstances.",
  closing: "Keep what feels honest and useful to you, and let the rest become clearer with time.",
  note: "This interpretation is a reflective reading of the supplied cards and positions.",
  chatGesture: "The reader rests a hand beside the spread and studies the arrangement without rushing you. A quiet pause gives your follow-up question room to settle, while the earlier cards remain visible as context for the answer that follows.",
  chatResponse: "Your follow-up returns to the central pattern already visible in the reading. Focus on the part you can verify in your own experience, then use that clarity to decide what deserves action and what still needs observation. You do not have to force certainty where the situation remains genuinely open.",
  suggestions: [
    "Which part of this reading should I act on first?",
    "What tension in these cards needs more attention?",
    "How can I apply this message to my situation?",
  ],
  continuation: "You can ask about any part of the reading that still feels unresolved.",
  title: "A Pattern Coming Clear",
  handoverSummary: "The user is continuing an existing tarot conversation and needs the next reader to preserve the established question, cards and unresolved themes without inventing new facts.",
  handoverUnresolved: "Clarify the user’s current question without changing the conclusions already established.",
  returning: "I remember the thread of your earlier reading, and you can continue from whatever now feels most important.",
};

const es: FallbackCatalogue = {
  invite: "Cuéntame qué te gustaría explorar con las cartas.",
  fitReason: "Tu pregunta puede explorarse con cuidado junto a este lector.",
  fitOffer: "Puedes continuar aquí y la lectura se mantendrá centrada en tu pregunta.",
  ritualGesture: "El lector sostiene la baraja entre ambas manos y deja que el espacio a tu alrededor se vuelva tranquilo.",
  ritualOpening: "Una respiración pausada permite que tu pregunta se asiente sin obligarla a producir una respuesta inmediata.",
  ritual: "Cuando quieras, la siguiente carta puede revelarse y considerarse con atención.",
  readGesture: "El lector ordena las cartas en una línea clara y hace una pausa para que cada imagen conserve su lugar.",
  readOpening: "Tu pregunta permanece en el centro mientras la tirada se contempla como un patrón conectado.",
  readLink: "El mensaje pasa ahora de cada carta individual hacia aquello que, en conjunto, te piden observar.",
  cardText: "Esta carta dirige tu atención hacia las decisiones, emociones y circunstancias de esta posición. Considera lo que te pide reconocer antes de decidir cómo quieres responder.",
  synthesis: "En conjunto, las cartas te piden distinguir lo que ya está claro de aquello que aún necesita tiempo. Puedes avanzar confiando en los temas constantes y manteniendo apertura ante lo que todavía no se ha asentado por completo.",
  reading: "La lectura te orienta hacia una respuesta cuidadosa y realista, no hacia una conclusión apresurada. Observa qué parte del mensaje reconoces de inmediato y compárala con las opciones prácticas que tienes. Las cartas pueden aclarar un patrón, pero tú decides qué resulta verdadero, útil y apropiado para tus circunstancias.",
  closing: "Conserva lo que te resulte honesto y útil, y permite que lo demás se aclare con el tiempo.",
  note: "Esta interpretación es una lectura reflexiva de las cartas y posiciones proporcionadas.",
  chatGesture: "El lector apoya una mano junto a la tirada y observa la disposición sin apresurarte. Una pausa tranquila permite que tu pregunta de seguimiento se asiente, mientras las cartas anteriores permanecen visibles como contexto para la respuesta que sigue.",
  chatResponse: "Tu pregunta de seguimiento vuelve al patrón central que ya aparece en la lectura. Concéntrate en la parte que puedes comprobar en tu propia experiencia y utiliza esa claridad para decidir qué merece acción y qué todavía requiere observación. No tienes que forzar certeza cuando la situación sigue realmente abierta.",
  suggestions: [
    "¿Sobre qué parte de esta lectura debería actuar primero?",
    "¿Qué tensión de estas cartas necesita más atención?",
    "¿Cómo puedo aplicar este mensaje a mi situación?",
  ],
  continuation: "Puedes preguntar por cualquier parte de tu lectura que todavía sientas sin resolver.",
  title: "Un Patrón Se Aclara",
  handoverSummary: "La persona continúa una conversación de tarot existente y necesita que el siguiente lector preserve la pregunta, las cartas y los temas pendientes sin inventar hechos nuevos.",
  handoverUnresolved: "Aclara la pregunta actual sin cambiar las conclusiones que ya se establecieron.",
  returning: "Recuerdo el hilo de tu lectura anterior y puedes continuar desde aquello que ahora te resulte más importante.",
};

export const fallbackFor = (lang: string): FallbackCatalogue =>
  lang.toLocaleLowerCase().startsWith("es") ? es : en;
