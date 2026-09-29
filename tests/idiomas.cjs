const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const context = {window: {}, document: {querySelectorAll: () => []}, navigator: {languages: ['en']},
  localStorage: {getItem: () => 'en', setItem() {}}, addEventListener() {}, MutationObserver: class { observe() {} }};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('idiomas.js', 'utf8'), context);
const archivos = ['nucleo.js', 'index.html', '2d.html'];
const claves = new Set();
for (const archivo of archivos) {
  const fuente = fs.readFileSync(archivo, 'utf8');
  for (const m of fuente.matchAll(/(?<![\w$.])(?:window\.)?t\((['"])((?:\\.|(?!\1)[\s\S])*)\1/g))
    try { claves.add(vm.runInNewContext(m[1] + m[2] + m[1])); } catch {}
  if (archivo.endsWith('.html')) for (const m of fuente.matchAll(/<([a-z][\w:-]*)\b(?=[^>]*\bdata-t\b)[^>]*>([\s\S]*?)<\/\1\s*>/gi))
    claves.add(m[2].trim());
}
const missing = [...claves].map(k => [k, ['en', 'de'].filter(lang => !Object.hasOwn(vm.runInContext(`TEXTOS.${lang}`, context), k))]).filter(([, langs]) => langs.length);
if (missing.length) { console.error(`Faltan ${missing.length} claves:`, missing.map(([k, langs]) => `${JSON.stringify(k)} (${langs.join(',')})`).join('\n')); process.exitCode = 1; }
else console.log(`✓ ${claves.size} claves traducidas en inglés y alemán`);
