export function sanitizePII(text = '') {
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
  text = text.replace(/\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{2,4}\b/g, '[phone]');
  text = text.replace(/\b(?:dni|doc|passport|pasaporte|id)\s*[:#-]?\s*[a-z0-9-]{5,}\b/gi, '[id]');
  text = text.replace(/\bhttps?:\/\/[^\s)]+/gi, '[url]');
  text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[card]');
  text = text.replace(/\b(Av\.?|Avenida|Jr\.?|Jirón|C\/|Calle|Mz\.?|Manzana|Lt\.?|Lote)\b[^,\n]{0,80}/gi, '[address]');
  return text;
}
