export function extractPreferredNameFromSummary(summaryText = '') {
  const m = summaryText.match(/^\s*APODO:\s*[-–]\s*(.+)\s*$/im);
  if (m) {
    const val = m[1].trim();
    if (val && val.toLowerCase() !== 'ninguno') return sanitizeName(val);
  }

  const heuristics = [
    /(?:me\s+llaman|prefiero\s+que\s+me\s+digas|dime|puedes\s+llamarme)\s+“?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ\-\. ]{1,32})”?/i,
    /apodo\s*:\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ\-\. ]{1,32})/i
  ];
  for (const rx of heuristics) {
    const m2 = summaryText.match(rx);
    if (m2) return sanitizeName(m2[1]);
  }
  return null;
}

function sanitizeName(s='') {
  return s.replace(/^["'“”]+|["'“”]+$/g, '').trim().slice(0, 40);
}
