function normalizeStr(s='') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const NEGATIONS = [
  /\bno (quiero|deseo|necesito).*\b(plan|rutina|horario)\b/,
  /\bsolo (hablar|conversar|charlar|preguntar|saber|entender)\b/,
  /\bno te pedi(.*)(plan|rutina|horario)\b/,
  /\bsin (plan|rutina|horario)\b/,
];

const INFO_ONLY = [
  /\b(que|qué) usas\b/,
  /\bcomo eliges\b/,
  /\bcomo decides\b/,
  /\bcriterio(s)?\b/,
  /\bexplica(me)?\b/,
  /\b(quiero|quisiera) saber\b/,
  /\b(quiero|quisiera) entender\b/,
  /\ben base a que\b/,
  /\bpolitica de seleccion\b/,
];

export function wantsPlan(message = '', forcePlan = false) {
  if (forcePlan) return true;
  const m = normalizeStr(message);
  if (!m) return false;

  // 1) Bloquea negaciones
  if (NEGATIONS.some(rx => rx.test(m))) return false;

  // 2) Preguntas informativas (NO crear plan)
  if (INFO_ONLY.some(rx => rx.test(m))) return false;

  // 3) Señales claras de acción + núcleo (plan/rutina)
  const mentionsCore = /\b(plan|rutina|programa|horario)\b/.test(m);

  const wantsAction = [
    /\b(quiero|quisiera|necesito|me gustaria|haz(me)?|dame|crea(r)?|arma(r)?|generar|elaborar|dise(n|ñ)ar|actualizar|cambiar|ajustar|modificar)\b/,
    /\b(nueva|otra)\s+(rutina|plan)\b/,
    /\b(poner|crear)\s+rutina\b/,
  ].some(rx => rx.test(m));

  return mentionsCore && wantsAction;
}

export function asksWhatToday(msg='') {
  const m = normalizeStr(msg);
  return /\b(que me toca hoy|que entreno hoy|hoy que toca|que toca hoy)\b/.test(m);
}

export function asksShowRoutine(msg='') {
  const m = normalizeStr(msg);
  return /\b(mi rutina|ver rutina|mostrar rutina|que rutina tengo|cual es mi rutina)\b/.test(m);
}

export function asksRecentHistory(msg='') {
  const m = normalizeStr(msg);
  return /\b(que hice|ultimos ejercicios|historial|que entrene)\b/.test(m);
}
