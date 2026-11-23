// Genera poblacion.js (padrón INE, tabla 29005) y municipios.js (geometría es-atlas)
// Uso: node tools/build-data.mjs <ruta-csv-ine> <ruta-municipalities.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [csvPath, topoPath] = process.argv.slice(2);
const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1);

const best = {}; // código -> { year, pop }
for (const line of lines) {
  const [mun, sexo, periodo, total] = line.split(';');
  if (!mun || sexo !== 'Total') continue;
  const code = mun.slice(0, 5);
  if (!/^\d{5}$/.test(code)) continue;
  const pop = Number(String(total).replace(/\./g, '').replace(',', '.'));
  const year = Number(periodo);
  if (!Number.isFinite(pop)) continue;
  if (!best[code] || year > best[code].year) best[code] = { year, pop };
}

const codes = Object.keys(best);
const year = Math.max(...codes.map(c => best[c].year));
const out = Object.fromEntries(codes.map(c => [c, best[c].pop]));
writeFileSync(new URL('../poblacion.js', import.meta.url),
  `// Población por municipio (INE, Padrón ${year}). Generado por tools/build-data.mjs\n` +
  `window.POBLACION_YEAR = ${year};\nwindow.POBLACION = ${JSON.stringify(out)};\n`);

const topo = readFileSync(topoPath, 'utf8');
writeFileSync(new URL('../municipios.js', import.meta.url),
  `// Límites municipales (es-atlas 0.6.0, IGN). Generado por tools/build-data.mjs\nwindow.MUNICIPIOS = ${topo};\n`);

console.log(`municipios con población: ${codes.length}, año ${year}, Madrid 28079 = ${out['28079']}`);
