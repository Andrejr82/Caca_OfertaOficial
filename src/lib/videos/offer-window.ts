/** Início da janela diária de ofertas para o fluxo Gemini, em Brasília. */
export function getBrazilVideoOfferCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  // Brasília é UTC-3; o ciclo diário começa às 04:00 BRT = 07:00 UTC.
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 7));
}
