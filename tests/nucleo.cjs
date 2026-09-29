// Pruebas aisladas: nunca abren carpetas del usuario.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const events = {}, alerts = [];
const context = {console, structuredClone, setTimeout, clearTimeout, setInterval: () => {},
  addEventListener: (name, fn) => { events[name] = fn; },
  document: {querySelector: () => null, querySelectorAll: () => [], documentElement: {setAttribute() {}, removeAttribute() {}}},
  location: {hash: ''}, alert: message => alerts.push(message), confirm: () => true,
  assert, render() {}, empezar() {}};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('idiomas.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('nucleo.js', 'utf8'), context);
vm.runInContext(`(async () => {
  cambiarIdioma('es');
  testRespaldo = async () => {}; // El test OPFS se ejecuta en navegador.
  await test();
  assert.equal(document.title, '✓ tests');
  assert.equal(refRe('1(2)').test('→ 1(2)'), true);
  assert.equal(refRe('1(2)').test('→ 12'), false);
  const c = {id:'5', frente:'→ 1(2) y → 12', reverso:''};
  tacharRefs('1(2)', c); assert.equal(c.frente, '~~→ 1(2)~~ y → 12');
  desTacharRefs('1(2)', c); assert.equal(c.frente, '→ 1(2) y → 12');
  assert(mismoNombre('1 ó.txt', '1 o\\u0301.txt'));
  const log = [];
  let falla = false;
  const dir = nombre => ({getFileHandle: async archivo => ({createWritable: async () => ({
    write: async texto => { await new Promise(r => setTimeout(r, 5)); if (falla) throw Error('disco'); log.push([nombre, archivo, texto]); },
    close: async () => {}, abort: async () => {}
  })}), removeEntry: async archivo => log.push([nombre, 'borrar', archivo])});
  S.dir = dir('A'); S.archivos = new Map();
  const ficha = {id:'1', fecha:'s/f', titulo:'', frente:'caja A', reverso:''};
  const guardado = guardarFicha(ficha); S.dir = dir('B'); await guardado;
  assert.equal(log.at(-1)[0], 'A');
  S.dir = dir('A'); S.cards = new Map([['1', ficha]]);
  guardarLuego(ficha);
  assert(await cambiarDeCaja(async () => () => { S.dir = dir('B'); }));
  assert.equal(log.at(-1)[0], 'A');
  falla = true; await guardarFicha(ficha);
  let cambio = false;
  assert.equal(await cambiarDeCaja(async () => () => { cambio = true; }), false);
  assert.equal(cambio, false);
  falla = false; assert(await terminarGuardados());
  const antes = S.cards;
  assert.equal(await cambiarDeCaja(async () => { throw Error('lectura fallida'); }), false);
  assert.equal(S.cards, antes);
  escribir('escritorio.json', 'primero'); escribir('escritorio.json', 'último');
  await terminarGuardados(); assert.equal(log.at(-1)[2], 'último');
  console.log('✓ regresiones: referencias, Unicode, destino, transición, errores y orden de escrituras');
})()`, context).catch(error => { console.error(error); process.exitCode = 1; });
