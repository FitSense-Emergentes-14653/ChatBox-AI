export function extractWeekDay(message = '') {
  const msg = message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  const wkRx = /semana\s+(\d{1,2})/i;
  const dyRx = /d[ií]a\s+(\d{1,2})/i;

  const week = (msg.match(wkRx) || [])[1] ? parseInt((msg.match(wkRx) || [])[1], 10) : null;
  const day  = (msg.match(dyRx) || [])[1] ? parseInt((msg.match(dyRx) || [])[1], 10) : null;

  return { week, day };
}
