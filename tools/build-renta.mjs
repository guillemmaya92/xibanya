// Genera renta.js: renta neta media por persona de cada municipio (INE, Atlas de Distribución de Renta de los Hogares).
// El INE publica una tabla por provincia; se descargan todas en streaming y se quedan solo las filas municipales.
// Uso: node tools/build-renta.mjs
import { writeFileSync, appendFileSync } from 'node:fs';

const LOG = new URL('./build-renta.log', import.meta.url);
const log = msg => { appendFileSync(LOG, msg + '\n'); console.log(msg); };
writeFileSync(LOG, '');

const list = await (await fetch('https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/ADRH')).json();
const tables = list.filter(t => t.Nombre === 'Indicadores de renta media y mediana' && t.Codigo === 'DIST-SECC-MUN').map(t => t.Id);
log(`tablas provinciales: ${tables.length}`);

const best = {}; // código -> { year, value }

async function processTable(id) {
  const res = await fetch(`https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/${id}.csv`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const decoder = new TextDecoder('utf-8');
  let rest = '', n = 0;
  const handle = line => {
    const [mun, dist, secc, ind, periodo, total] = line.split(';');
    if (dist || secc || ind !== 'Renta neta media por persona') return;
    const code = mun.slice(0, 5);
    if (!/^\d{5}$/.test(code)) return;
    const value = Number(String(total).replace(/\./g, '').replace(',', '.'));
    const year = Number(periodo);
    if (!Number.isFinite(value) || !total.trim()) return;
    if (!best[code] || year > best[code].year) best[code] = { year, value };
    n++;
  };
  for await (const chunk of res.body) {
    const text = rest + decoder.decode(chunk, { stream: true });
    const lines = text.split(/\r?\n/);
    rest = lines.pop();
    lines.forEach(handle);
  }
  if (rest) handle(rest);
  return n;
}

// concurrencia limitada para no saturar el servidor del INE
const queue = [...tables];
let done = 0;
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const n = await processTable(id);
        log(`[${++done}/${tables.length}] tabla ${id}: ${n} filas municipales`);
        break;
      } catch (e) {
        log(`tabla ${id} intento ${attempt} falló: ${e.message}`);
        if (attempt === 3) { done++; log(`tabla ${id} OMITIDA`); }
      }
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const codes = Object.keys(best);
const year = Math.max(...codes.map(c => best[c].year));
const out = Object.fromEntries(codes.map(c => [c, best[c].value]));
writeFileSync(new URL('../renta.js', import.meta.url),
  `// Renta neta media por persona (€) por municipio. INE, Atlas de Distribución de Renta de los Hogares ${year}.\n` +
  `// Generado por tools/build-renta.mjs\nwindow.RENTA_YEAR = ${year};\nwindow.RENTA = ${JSON.stringify(out)};\n`);
log(`FIN municipios: ${codes.length}, año ${year}, Madrid 28079 = ${out['28079']}, Pozuelo 28115 = ${out['28115']}`);
