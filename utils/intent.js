function normalizeStr(s='') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
const NEGATIONS = [
  /no (quiero|deseo).*\b(plan|rutina|horario)\b/,
  /\bsolo (hablar|conversar|charlar)\b/,
  /no te pedi un horario/, /no te pedi.*(plan|rutina)/,
  /\bsin (plan|rutina)\b/
];

export function wantsPlan(message = '', forcePlan = false) {
  if (forcePlan) return true;
  const m = normalizeStr(message);
  if (!m) return false;
  if (NEGATIONS.some(rx => rx.test(m))) return false;

  const mentionsCore = /\b(plan|rutina|programa|horario)\b/.test(m);
const wantsAction = /\b(quiero|quisiera|haz(me)?|crea(r)?|arma(r)?|hacer|cambiar|ajust(ar|e)|modificar|actualizar|generar|elaborar|diseñar)\b/.test(m);

  return mentionsCore && wantsAction;
}

export function asksWhatToday(msg='') {
  return /\b(qué me toca hoy|que me toca hoy|qué entreno hoy|que entreno hoy|hoy que toca|qué toca hoy)\b/i.test(msg);
}
export function asksShowRoutine(msg='') {
  return /\b(mi rutina|ver rutina|mostrar rutina|qué rutina tengo|que rutina tengo)\b/i.test(msg);
}
export function asksRecentHistory(msg='') {
  return /\b(qué hice|que hice|últimos ejercicios|historial|qué entrené|que entrené)\b/i.test(msg);
}
