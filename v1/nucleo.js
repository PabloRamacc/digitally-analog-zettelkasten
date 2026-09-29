// Núcleo del Zettelkasten: datos, formato en disco y reglas. Lo comparten index.html (2D) y escritorio3d.html (3D).
// Cada página define render() y empezar(); las funciones de acá los llaman.

const LIM = 700, TINTA_MIN = 5, SEP = '\n=== reverso ===\n';
const S = {cards: new Map(), archivos: new Map() /* id → nombre del .txt en disco */, papelera: new Map(), mesa: {}, dir: null, cargada: false,
  modo: 'purista', vista: 'cajon', cajon: 'P', sel: null, girada: false, filtro: '', animando: false,
  cajones: null /* los cajones de la caja: ver armarCajones */, fisico: null /* número → cajón, si la caja trae su mueble */};
const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ---------- Folgezettel ----------
// Un número de ficha: 1a2, B3, o con la numeración de Luhmann 9/8a1, 9/8,1, 1/7D1A, 21/3d5b11z/t10 y 1(2) (dos fichas
// con el mismo número). La barra o la coma, solo si sigue un número o una letra (así «→ 2a, y» sigue siendo 2a).
const ID = 'B?\\d(?:[0-9a-zA-Z]|[/,][0-9a-zA-Z])*(?:\\(\\d+\\))?';
const enlaceRe = () => new RegExp(`(?:→|->)\\s*(${ID})`, 'g');
// Tramos: números, letras y «,n» (Luhmann intercala 9/8,1 … 9/8,3 entre 9/8 y 9/8a).
const segs = id => id.match(/\(\d+\)|,\d+|\d+|[A-Z]+|[a-z]+/g) || [];
// (repetida) < coma < número < mayúscula < minúscula. Luhmann no siempre sigue una regla: su orden real viene en orden.txt.
const tipoSeg = s => s[0] === '(' ? -1 : s[0] === ',' ? 0 : /\d/.test(s) ? 1 : /[A-Z]/.test(s) ? 2 : 3;
function cmpId(a, b) {
  const A = segs(a), B = segs(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i], y = B[i];
    if (x === y) continue;
    const tx = tipoSeg(x), ty = tipoSeg(y);
    if (tx !== ty) return tx - ty;
    if (tx < 2) return x.replace(/\D/g, '') - y.replace(/\D/g, '');
    return x.length - y.length || (x < y ? -1 : 1);
  }
  return A.length - B.length;
}
// Cajas importadas del archivo de Luhmann: su orden físico (orden.txt) manda; las fichas nuevas se ubican por número.
// ponytail: una ficha nueva junto a una de Luhmann se compara con cmpId, que puede no coincidir con su orden real
const cmpOrden = (a, b) => S.orden?.has(a) && S.orden.has(b) ? S.orden.get(a) - S.orden.get(b) : cmpId(a, b);
// 1→2, a→b, z→aa, az→ba, ,3→,4
function inc(s) {
  if (s[0] === ',') return ',' + inc(s.slice(1));
  if (s[0] === '(') return `(${+s.slice(1, -1) + 1})`;
  if (/[A-Z]/.test(s)) return inc(s.toLowerCase()).toUpperCase();
  if (/\d/.test(s)) return String(+s + 1);
  const a = [...s]; let i = a.length - 1;
  while (i >= 0 && a[i] === 'z') a[i--] = 'a';
  if (i < 0) return 'a' + a.join('');
  a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1);
  return a.join('');
}
// Como Luhmann: siguiente hermano si está libre; si no, se ramifica.
function nuevaDespues(id, existe) {
  const ult = segs(id).at(-1), hermano = id.slice(0, id.length - ult.length) + inc(ult);
  if (!existe(hermano)) return hermano;
  let hijo = id + (/\d/.test(ult) ? 'a' : '1');
  while (existe(hijo)) hijo = id + inc(hijo.slice(id.length));
  return hijo;
}
// Los números que puede tomar una ficha nueva después de id, como los usaba Luhmann. Solo los libres.
function opcionesDespues(id, existe) {
  const libre = (base, primero) => { let x = base + primero; while (existe(x)) x = base + inc(x.slice(base.length)); return x; };
  const base = id.replace(/\(\d+\)$/, ''), ult = segs(base).at(-1), ops = [];   // 1(2) sigue como 1
  const hermano = base.slice(0, base.length - ult.length) + inc(ult);
  if (!existe(hermano)) ops.push({id: hermano, que: 'sigue la línea'});
  ops.push({id: libre(id, /\d/.test(ult) ? 'a' : '1'), que: 'abre una rama'});
  if (cajonDe(id) === 'P' && ult[0] !== ',') ops.push({id: libre(id, ',1'), que: 'intercala (antes de las ramas)'});
  if (/^\d+$/.test(id)) { let n = 1; while (existe(`${id}/${n}`)) n++; ops.push({id: `${id}/${n}`, que: 'subsección numerada'}); }
  return ops;
}
const elegirDespues = (id, boton) => menuFlotante(`Nueva después de ${etiqueta(id)}:`,
  opcionesDespues(id, x => S.cards.has(x)).map(o => ({valor: o.id, etiqueta: o.id, que: o.que})), boton);
// Los cajones del Principal (en una caja propia, uno solo; en un mueble, varios) y a cuál mover una ficha.
const cajonesP = () => S.cajones.filter(c => c.k[0] === 'P');
const nombreCajon = k => S.cajones.find(c => c.k === k)?.nombre ?? k;
const elegirCajon = (id, boton) => menuFlotante(`Guardar ${etiqueta(id)} en:`,
  cajonesP().filter(c => c.k !== cajonDeFicha(id)).map(c => ({valor: c.k, etiqueta: c.nombre.replace(/^Cajón /, ''), que: c.nombre})), boton);
function moverACajon(id, k) {
  if (cajonDe(id) !== 'P' || !S.fisico || !S.cajones.some(c => c.k === k)) return false;
  S.fisico.set(id, k); guardarOrden();
  return true;
}
// Menú chico junto al botón. Devuelve el valor elegido, o null si se cierra (Esc o click afuera).
function menuFlotante(titulo, ops, boton) {
  document.getElementById('menuNumero')?.remove();
  const m = document.createElement('div'); m.id = 'menuNumero';
  m.style.cssText = 'position:fixed;z-index:5000;min-width:240px;background:#1f1812;border:1px solid #6a5540;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:3px;box-shadow:0 6px 20px rgba(0,0,0,.5);color:#efe6d0;font:13px system-ui,sans-serif';
  m.innerHTML = `<div style="color:#b3a486;padding:2px 4px 4px">${esc(titulo)}</div>`
    + ops.map(o => `<button data-id="${esc(o.valor)}" style="display:flex;gap:10px;text-align:left"><b style="min-width:4.5em;font-family:ui-monospace,monospace">${esc(o.etiqueta)}</b>${esc(o.que)}</button>`).join('');
  document.body.append(m);
  const r = boton.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + 4 + h < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
  m.querySelector('button').focus();
  return new Promise(ok => {
    const cerrar = v => { m.remove(); removeEventListener('pointerdown', fuera, true); removeEventListener('keydown', tecla, true); ok(v); };
    const fuera = e => { if (!m.contains(e.target)) cerrar(null); };
    const tecla = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); cerrar(null); } };
    m.onclick = e => { const b = e.target.closest('button'); if (b) cerrar(b.dataset.id); };
    addEventListener('pointerdown', fuera, true); addEventListener('keydown', tecla, true);
  });
}
// Purista: seguir un enlace recorre el cajón hasta la ficha. Cada paso avanza un 15 % de lo que falta (al menos una),
// así lejos se pasa rápido con el dedo y cerca se frena de a una: unos 50 pasos para 3000 fichas, no 3000.
function* recorrido(i, j) {
  while (i !== j) { const r = j - i; i += Math.sign(r) * Math.max(1, Math.ceil(Math.abs(r) * .15)); yield i; }
}
// Primer número libre: si se tiró la 2, la próxima raíz vuelve a ser la 2.
function nuevaRaiz(ids, pre = '') {
  let n = 1;
  while (ids.includes(pre + n)) n++;
  return pre + n;
}

// ---------- Formato en disco ----------
function parseFicha(id, txt) {
  const [cab, ...resto] = txt.replace(/\r/g, '').split('\n');
  const titulo = resto[0]?.startsWith('# ') ? resto.shift().slice(2).trim() : '';
  const [frente, reverso = ''] = resto.join('\n').split(SEP);
  return {id, fecha: cab.trim(), titulo, frente: frente.trim(), reverso: reverso.trim()};
}
const serFicha = c => c.fecha + '\n' + (c.titulo ? '# ' + c.titulo + '\n' : '') + c.frente + (c.reverso ? SEP + c.reverso : '') + '\n';
// Solo para migrar el registro.txt de versiones anteriores al cajón Índice.
function parseRegistro(t) {
  return t.replace(/\r/g, '').split('\n').filter(l => l.includes(':')).map(l => {
    const i = l.lastIndexOf(':');
    return {termino: l.slice(0, i).trim(), ids: l.slice(i + 1).split(',').map(s => s.trim()).filter(Boolean)};
  });
}

// ---------- Cajones ----------
// B = bibliografía, I = índice (una ficha por letra: Ia, Ib… Iñ, I#), P = principal
const cajonDe = id => id[0] === 'B' ? 'B' : id[0] === 'I' ? 'I' : 'P';
const etiqueta = id => cajonDe(id) === 'I' ? id.slice(1).toUpperCase() : id;
// Los cajones del mueble. Una caja propia tiene tres: Principal, Bibliografía e Índice. Una caja que trae su mueble
// (orden.txt con «# 15» antes de las fichas de cada cajón, como la de Luhmann) reparte el Principal en esos cajones.
const CAJONES_BASE = [{k: 'P', nombre: 'Principal'}, {k: 'B', nombre: 'Bibliografía'}, {k: 'I', nombre: 'Índice'}];
function armarCajones(orden) {
  S.orden = S.fisico = null; S.cajones = CAJONES_BASE;
  if (!orden) return;
  const ids = [], fisico = new Map(), propios = [];
  let k = null;
  for (const l of orden.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (l.startsWith('#')) {
      const nombre = l.slice(1).trim();
      k = 'P' + nombre; propios.push({k, nombre: /^\d+$/.test(nombre) ? `Cajón ${nombre}` : nombre, cab: nombre});
    } else { ids.push(l); if (k) fisico.set(l, k); }
  }
  S.orden = new Map(ids.map((id, i) => [id, i]));
  if (propios.length) { S.fisico = fisico; S.cajones = [...propios, ...CAJONES_BASE.slice(1)]; }
}
// En qué cajón está una ficha. Una ficha nueva que no figura en el mueble va al cajón de la anterior por número.
function cajonDeFicha(id) {
  const t = cajonDe(id);
  if (t !== 'P' || !S.fisico) return t;
  if (!S.fisico.has(id)) {
    let mejor = null;
    for (const x of S.fisico.keys()) if (cmpId(x, id) <= 0 && (!mejor || cmpId(x, mejor) > 0)) mejor = x;
    S.fisico.set(id, mejor ? S.fisico.get(mejor) : S.cajones[0].k);
  }
  return S.fisico.get(id);
}
armarCajones(null);
// El mueble se guarda en orden.txt: «# nombre» y debajo las fichas de ese cajón, en su orden.
function guardarOrden() {
  if (!S.fisico) return;
  for (const id of S.cards.keys()) cajonDeFicha(id);   // toda ficha tiene su cajón
  const txt = S.cajones.filter(c => c.cab != null).map(c => [`# ${c.cab}`, ...[...S.fisico]
    .filter(([id, k]) => k === c.k && S.cards.has(id)).map(([id]) => id).sort(cmpOrden)].join('\n')).join('\n') + '\n';
  const cajon = S.cajon; armarCajones(txt); S.cajon = cajon;
  return escribir('orden.txt', txt);
}
// Un cajón nuevo, después del último. En una caja propia, el Principal pasa a ser el primer cajón del mueble.
// Las fichas raíz que se crean con el cajón abierto van ahí; las que responden a otra, al cajón de esa.
const siguienteCajon = () => String(S.cajones.filter(c => c.k[0] === 'P').length + 1);
function nuevoCajon(nombre) {
  nombre = nombre?.replace(/\s+/g, ' ').trim();
  if (!nombre) return null;
  if (S.cajones.some(c => c.cab === nombre || c.nombre === nombre)) { alert(`Ya hay un cajón «${nombre}».`); return null; }
  if (!S.fisico) {
    S.fisico = new Map([...S.cards.keys()].filter(id => cajonDe(id) === 'P').map(id => [id, 'PPrincipal']));
    S.cajones = [{k: 'PPrincipal', nombre: 'Principal', cab: 'Principal'}, ...CAJONES_BASE.slice(1)];
  }
  const k = 'P' + nombre, i = S.cajones.findIndex(c => c.k === 'B');
  S.cajones = [...S.cajones.slice(0, i), {k, nombre: /^\d+$/.test(nombre) ? `Cajón ${nombre}` : nombre, cab: nombre}, ...S.cajones.slice(i)];
  guardarOrden();
  S.cajon = k; S.sel = null;
  return k;
}
function letra(t) {
  const l = t.trim()[0]?.toLowerCase() ?? '';
  return l === 'ñ' ? 'ñ' : l.normalize('NFD')[0]?.match(/[a-z]/)?.[0] ?? '#';
}

// Lo tachado deja de ser enlace: los vínculos se buscan solo fuera de los <s>.
function renderTxt(t) {
  return esc(t)
    .replace(/~~(.+?)~~/gs, '<s>$1</s>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .split(/(<s>.*?<\/s>)/s)
    .map((p, i) => i % 2 ? p : p.replace(new RegExp(`(?:→|-&gt;)\\s*(${ID})`, 'g'),
      (m, id) => `<a class="ln${S.cards.has(id) ? '' : ' roto'}" data-id="${id}">→ ${id}</a>`))
    .join('');
}
// Al tirar una ficha: se tachan sus enlaces (y la línea entera en el índice). Al restaurarla, se destachan.
const noSigue = '(?![0-9a-zA-Z(]|[/,][0-9a-zA-Z])';   // «→ 9/8» no es «→ 9/8,1» ni «→ 9/8a»
const refRe = id => new RegExp(`(?:→|->)\\s*${id}${noSigue}`);
function tacharRefs(id, c) {
  const re = new RegExp(refRe(id).source, 'g'), unaRef = refRe(id);
  const tachar = t => cajonDe(c.id) === 'I'
    ? t.split('\n').map(l => !l.startsWith('~~') && unaRef.test(l) ? `~~${l}~~` : l).join('\n')
    : t.split(/(~~.*?~~)/s).map((p, i) => i % 2 ? p : p.replace(re, m => `~~${m}~~`)).join('');
  return cambiarLados(c, tachar);
}
function desTacharRefs(id, c) {
  const re = new RegExp(`~~([^~\\n]*?(?:→|->)\\s*${id})~~${noSigue}`, 'g');
  return cambiarLados(c, t => t.replace(re, '$1'));
}
function cambiarLados(c, f) {
  let cambio = false;
  for (const lado of ['frente', 'reverso']) { const n = f(c[lado]); if (n !== c[lado]) { c[lado] = n; cambio = true; } }
  return cambio;
}

const ahora = () => { const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
// Sin fecha legible («s/f», como las fichas de Luhmann): cuenta como tinta vieja.
const edadMin = c => { const t = new Date(c.fecha.replace(' ', 'T')); return isNaN(t) ? Infinity : (Date.now() - t) / 60000; };
const sepia = c => Math.min(.7, Math.max(0, edadMin(c) / 1440 / 365 * .35)).toFixed(2);
const puedeEditar = c => S.modo === 'comodo' || edadMin(c) < TINTA_MIN;
const primera = c => (c.titulo || c.frente.split('\n')[0] || '(vacía)').replace(/~~|__/g, '');
const maxZ = () => Math.max(0, ...Object.values(S.mesa).map(p => p.z || 0));

// ---------- Guardado ----------
async function escribir(nombre, txt) {
  if (!S.dir) return true; // modo ejemplo: solo en memoria
  try {
    const w = await (await S.dir.getFileHandle(nombre, {create: true})).createWritable();
    await w.write(txt); await w.close();
    return true;
  } catch (e) { alert(`No se pudo guardar ${nombre}: ${e.message}`); return false; }
}
// El nombre del archivo lleva el título: «1a2 Fichas atómicas.txt». Lo que no vale en Windows se saca.
const limpiarNombre = t => t.replace(/~~|__/g, '').replace(/[\\/:*?"<>|\t\r\n]/g, '').replace(/\s+/g, ' ')
  .trim().slice(0, 60).replace(/[. ]+$/, '');
function nombreArchivo(c) {
  const t = limpiarNombre(c.titulo);
  return t ? `${idArchivo(c.id)} ${t}.txt` : `${idArchivo(c.id)}.txt`;
}
// La barra no vale en un nombre de archivo de Windows: 9/8a → «9-8a.txt». Y Windows no distingue mayúsculas:
// 1/7D1A → «1-7^D1^A.txt», para que no pise a 1/7D1a.
const idArchivo = id => id.replaceAll('/', '-').replace(/(?<=.)[A-Z]/g, '^$&');
const archivoAId = s => s.replaceAll('^', '').replaceAll('-', '/');
const idDeArchivo = nombre => { const m = nombre.match(/^(B?\d(?:[0-9a-z]|\^[A-Z]|[-,](?:[0-9a-z]|\^[A-Z]))*(?:\(\d+\))?|I[a-zñ#]\d*)(?: .*)?\.txt$/); return m && archivoAId(m[1]); };
// Si cambió el título: primero se escribe el archivo nuevo y recién después se borra el viejo.
// Los guardados de una misma ficha van en fila, para que dos renombres no se crucen.
const colaGuardado = new Map();
function guardarFicha(c) {
  const p = (colaGuardado.get(c.id) ?? Promise.resolve()).then(async () => {
    const viejo = S.archivos.get(c.id);
    let nombre = nombreArchivo(c);
    // Windows no distingue mayúsculas: renombrar solo por mayúsculas borraría el archivo recién escrito
    if (viejo && viejo !== nombre && viejo.toLowerCase() === nombre.toLowerCase()) nombre = viejo;
    if (!await escribir(nombre, serFicha(c))) return false;
    S.archivos.set(c.id, nombre);
    if (S.dir && viejo && viejo !== nombre) try { await S.dir.removeEntry(viejo); } catch {}
    return true;
  });
  colaGuardado.set(c.id, p);
  return p;
}
const guardarMesa = () => escribir('escritorio.json', JSON.stringify(S.mesa, null, 1));
const pendientes = new Map();
function guardarLuego(c) {
  clearTimeout(pendientes.get(c.id));
  pendientes.set(c.id, setTimeout(() => { pendientes.delete(c.id); guardarFicha(c); }, 400));
}
addEventListener('beforeunload', e => { if (pendientes.size) e.preventDefault(); });

// Respaldo: al abrir la caja, una copia por día de las fichas y la mesa en respaldos/AAAA-MM-DD/.
// Se guardan los 30 días más recientes; solo se borran carpetas con nombre de fecha dentro de respaldos/.
const DIAS_RESPALDO = 30;
async function respaldar(dir) {
  const hoy = ahora().slice(0, 10), r = await dir.getDirectoryHandle('respaldos', {create: true});
  try { await r.getDirectoryHandle(hoy); return false; } catch {}   // el de hoy ya está
  // Una caja importada (trae FUENTE.txt, como la de Luhmann) se puede volver a bajar: se respalda solo lo que cambió
  // después de importarla (tus fichas, tu mesa, tus cajones). Si no, habría que copiar miles de archivos cada día.
  let desde = 0;
  try { desde = (await (await dir.getFileHandle('FUENTE.txt')).getFile()).lastModified; } catch {}
  const d = await r.getDirectoryHandle(hoy, {create: true});
  try {
    const hs = [];
    for await (const [nombre, h] of dir.entries())
      if (h.kind === 'file' && (idDeArchivo(nombre) || nombre === 'escritorio.json' || nombre === 'orden.txt')) hs.push([nombre, h]);
    await enParalelo(hs, 16, async ([nombre, h]) => {
      const f = await h.getFile();
      if (f.lastModified <= desde) return;
      const w = await (await d.getFileHandle(nombre, {create: true})).createWritable();
      await w.write(f); await w.close();
    });
  } catch (e) { await r.removeEntry(hoy, {recursive: true}).catch(() => {}); throw e; }   // a medias no cuenta: se reintenta la próxima vez
  const fechas = [];
  for await (const [n, h] of r.entries()) if (h.kind === 'directory' && /^\d{4}-\d\d-\d\d$/.test(n)) fechas.push(n);
  for (const n of fechas.sort().slice(0, -DIAS_RESPALDO)) await r.removeEntry(n, {recursive: true});
  return true;
}

// De a n a la vez: leer miles de archivos uno por uno tarda (la caja de Luhmann tiene ~9.600).
async function enParalelo(items, n, f) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({length: n}, async () => { while (i < items.length) { const k = i++; res[k] = await f(items[k]); } }));
  return res;
}

// ---------- Armar texto: las fichas de la mesa, en orden de lectura, pasan a un borrador en Markdown ----------
const FILA_PX = 120;   // fichas con menos de esto de diferencia en y cuentan como la misma fila
function ordenLectura() {
  const fichas = Object.entries(S.mesa).filter(([id]) => S.cards.has(id) && cajonDe(id) === 'P').sort((a, b) => a[1].y - b[1].y);
  const filas = [];
  for (const f of fichas) {
    const fila = filas.at(-1);
    if (fila && f[1].y - fila[0][1].y < FILA_PX) fila.push(f); else filas.push([f]);
  }
  return filas.flatMap(f => f.sort((a, b) => a[1].x - b[1].x)).map(([id]) => id);
}
// Lo tachado es tinta anulada: se omite. __x__ → *x*, «→ 2b» → «(→ 2b)».
const aMd = t => t.replace(/~~.*?~~/gs, '').replace(/__(.+?)__/gs, '*$1*')
  .replace(enlaceRe(), '(→ $1)').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').trim();
const citadasB = t => [...t.replace(/~~.*?~~/gs, '').matchAll(/(?:→|->)\s*(B\d[0-9a-z]*)/g)].map(m => m[1]);
// ponytail: las B e I sobre la mesa no entran como secciones; las B cuentan para la bibliografía
function armarTexto() {
  const ids = ordenLectura();
  if (!ids.length) return '';
  const cs = ids.map(id => S.cards.get(id)), tit = c => aMd(c.titulo);
  const bib = new Set([...Object.keys(S.mesa).filter(id => cajonDe(id) === 'B' && S.cards.has(id)),
    ...cs.flatMap(c => citadasB(c.frente + '\n' + c.reverso)).filter(id => S.cards.has(id))]);
  let md = `# ${tit(cs[0]) || primera(cs[0])}\n`;
  for (const c of cs) md += `\n## ${tit(c) ? tit(c) + ' ' : ''}(${c.id})\n\n` + [aMd(c.frente), aMd(c.reverso)].filter(Boolean).join('\n\n') + '\n';
  if (bib.size) md += '\n## Bibliografía\n\n' + [...bib].sort(cmpId).map(id => `- ${id}. ${(aMd(S.cards.get(id).frente) || tit(S.cards.get(id))).replace(/\s*\n\s*/g, ' ')}`).join('\n') + '\n';
  return md;
}
// Muestra el borrador y, con carpeta abierta, lo guarda en borradores/.
async function armarBorrador() {
  const md = armarTexto();
  if (!md) return alert('No hay fichas del cajón Principal sobre la mesa.');
  let nota = 'Modo ejemplo: el borrador no se guarda.';
  if (S.dir) {
    const nombre = `${ahora().replace(':', '')} ${limpiarNombre(md.split('\n')[0].slice(2))}.md`.trim();
    try {
      const w = await (await (await S.dir.getDirectoryHandle('borradores', {create: true})).getFileHandle(nombre, {create: true})).createWritable();
      await w.write(md); await w.close();
      nota = `Guardado en borradores/${nombre}`;
    } catch (e) { nota = `No se pudo guardar: ${e.message}`; }
  }
  mostrarBorrador(md, nota);
}
function mostrarBorrador(md, nota = '') {
  document.getElementById('borrador')?.remove();
  const d = document.createElement('div'); d.id = 'borrador';
  d.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(10,7,5,.7);display:flex;align-items:center;justify-content:center;padding:16px';
  d.innerHTML = `<div style="background:#1f1812;border:1px solid #6a5540;border-radius:8px;padding:12px;width:min(760px,100%);height:min(80vh,100%);display:flex;flex-direction:column;gap:8px;color:#efe6d0;font:14px system-ui,sans-serif">
    <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Borrador</b><button data-b="copiar">Copiar</button><button data-b="cerrar">Cerrar</button></div>
    <textarea spellcheck="false" style="flex:1;resize:none;background:#f5eed8;color:#1f2d57;border:0;border-radius:4px;padding:12px;font:14px/1.5 ui-monospace,Consolas,monospace"></textarea>
    <small style="color:#b3a486">${esc(nota)}</small></div>`;
  d.querySelector('textarea').value = md;
  d.onclick = async e => {
    const b = e.target.dataset?.b;
    if (b === 'copiar') { await navigator.clipboard.writeText(d.querySelector('textarea').value); e.target.textContent = 'Copiado ✓'; }
    if (b === 'cerrar' || e.target === d) d.remove();
  };
  d.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') d.remove(); };   // las teclas no llegan al escritorio de atrás
  document.body.append(d);
}

// IndexedDB: recordar la carpeta entre sesiones
const idb = (modo, f) => new Promise((ok, mal) => {
  const r = indexedDB.open('zettelkasten', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => mal(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('kv', modo), q = f(tx.objectStore('kv'));
    tx.oncomplete = () => ok(q.result); tx.onerror = () => mal(tx.error); };
});

async function abrirCarpeta(dir) {
  if (!dir) {
    if (!window.showDirectoryPicker) return alert('Este navegador no puede abrir carpetas. Usá Chrome o Edge.');
    try { dir = await showDirectoryPicker({id: 'zettelkasten', mode: 'readwrite'}); } catch { return; }
  } else if (await dir.requestPermission({mode: 'readwrite'}) !== 'granted') return;
  try { await respaldar(dir); } catch (e) { alert(`No se pudo hacer el respaldo de hoy (${e.message}). La caja se abre igual.`); }
  S.dir = dir; S.cards.clear(); S.archivos.clear(); S.mesa = {}; S.papelera.clear(); armarCajones(null);
  const fechas = new Map();
  try {
    for await (const [nombre, h] of (await dir.getDirectoryHandle('papelera')).entries()) {
      const m = h.kind === 'file' && nombre.match(/^(\S+) (.+)\.txt$/);
      if (m) S.papelera.set(nombre, {c: parseFicha(archivoAId(m[1]), await (await h.getFile()).text()), borrada: m[2]});
    }
  } catch {} // todavía no hay papelera
  let registroViejo = null;
  const hs = [];
  for await (const [nombre, h] of dir.entries()) if (h.kind === 'file') hs.push([nombre, h]);
  const leidos = await enParalelo(hs, 32, async ([nombre, h]) => { const archivo = await h.getFile(); return {nombre, archivo, txt: await archivo.text()}; });
  for (const {nombre, archivo, txt} of leidos) {
    const id = idDeArchivo(nombre);
    if (nombre === 'registro.txt') registroViejo = txt;
    else if (nombre === 'orden.txt') armarCajones(txt);
    else if (nombre === 'escritorio.json') { try { S.mesa = JSON.parse(txt) || {}; } catch {} }
    // ponytail: si quedaron dos archivos con el mismo número, gana el modificado más reciente; el otro queda en disco sin tocar
    else if (id && !(fechas.get(id) > archivo.lastModified)) {
      S.cards.set(id, parseFicha(id, txt)); S.archivos.set(id, nombre); fechas.set(id, archivo.lastModified);
    }
  }
  idb('readwrite', s => s.put(dir, 'dir')).catch(() => {});
  // Los archivos viejos («1a.txt») pasan a llevar el título en el nombre.
  for (const c of S.cards.values()) if (S.archivos.get(c.id) !== nombreArchivo(c)) await guardarFicha(c);
  if (registroViejo && ![...S.cards.keys()].some(id => cajonDe(id) === 'I'))
    for (const e of parseRegistro(registroViejo)) for (const id of e.ids) agregarIndice(e.termino, id, true);
  if (!S.cards.size && confirm('La carpeta está vacía. ¿Copiar las fichas de ejemplo para empezar?')) {
    cargarEjemplo();
    for (const c of S.cards.values()) await guardarFicha(c);
    await guardarMesa();
  }
  indexarSecas();
  empezar(dir.name);
}
function cargarEjemplo() {
  S.cards.clear(); S.archivos.clear(); S.papelera.clear(); armarCajones(null);
  for (const [id, t] of Object.entries(EJEMPLO.fichas)) S.cards.set(id, parseFicha(id, t));
  S.mesa = structuredClone(EJEMPLO.mesa);
  indexarSecas();
}

// ---------- Cajón, índice, papelera ----------
function lista() {
  if (!S.cajones.some(c => c.k === S.cajon)) S.cajon = S.cajones[0].k;   // otra caja, otros cajones
  let ids = [...S.cards.keys()].filter(id => cajonDeFicha(id) === S.cajon)
    .sort(S.cajon === 'I' ? (a, b) => a.localeCompare(b, 'es') : cmpOrden);
  if (S.modo === 'comodo' && S.filtro) {
    const q = S.filtro.toLowerCase();
    ids = ids.filter(id => { const c = S.cards.get(id); return (id + ' ' + c.titulo + ' ' + c.frente + ' ' + c.reverso).toLowerCase().includes(q); });
  }
  return ids;
}

function citantes(id) {
  const re = refRe(id), sinTachar = t => t.replace(/~~.*?~~/gs, '');
  return [...S.cards.values()].filter(c => c.id !== id && re.test(sinTachar(c.frente + '\n' + c.reverso))).map(c => c.id).sort(cmpId);
}

// cajon: dónde va una ficha raíz (el cajón abierto). Sin él, va al cajón de la ficha anterior por número.
function nuevaFicha(id, cajon = null) {
  const c = {id, fecha: ahora(), titulo: '', frente: '', reverso: ''};
  S.cards.set(id, c); guardarFicha(c);
  if (S.fisico && cajonDe(id) === 'P') {
    S.fisico.set(id, cajon?.[0] === 'P' && S.cajones.some(x => x.k === cajon) ? cajon : cajonDeFicha(id));
    guardarOrden();
  }
  return c;
}
// Agrega "término → id" al final de la ficha de su letra, como quien escribe una línea más en el papel.
// libre = sin el límite de 3 entradas (migración).
// Las fichas del índice de una letra: Ia, Ia2, Ia3… Cuando una se llena, se sigue en la próxima.
function fichasIndice(l) {
  const r = [];
  for (let n = 1, id; S.cards.has(id = 'I' + l + (n > 1 ? n : '')); n++) r.push(S.cards.get(id));
  return r;
}
const lineasIndice = cs => cs.flatMap(c => (c.frente + '\n' + c.reverso).split('\n'));
function agregarIndice(termino, id, libre = false) {
  const l = letra(termino), fichas = fichasIndice(l);
  const linea = `${termino} → ${id}`, lineas = lineasIndice(fichas)
    .filter(l => !l.startsWith('~~')).map(l => l.replace(/__/g, '').trim().toLowerCase()); // las tachadas no cuentan
  if (lineas.includes(linea.toLowerCase())) return 'ya está';
  if (!libre && S.modo === 'purista' && lineas.filter(l => l.startsWith(termino.toLowerCase() + ' →')).length >= 3)
    return `«${termino}» ya tiene 3 fichas de entrada. El índice solo guarda puntos de entrada: enlazá desde una de ellas.`;
  // cuando el frente se llena se sigue en el reverso, y cuando se llenan las dos caras, en una ficha nueva de la misma letra
  let c = fichas.at(-1), lado = c && ['frente', 'reverso'].find(k => (c[k] + '\n' + linea).length <= LIM);
  if (!lado) { c = nuevaFicha('I' + l + (fichas.length ? fichas.length + 1 : '')); lado = 'frente'; }
  c[lado] = c[lado] ? c[lado] + '\n' + linea : linea;
  guardarFicha(c);
  return 'ok';
}

// Al secarse la tinta, el título de cada ficha del cajón Principal entra solo al índice.
// Si la línea ya está, aunque tachada (la sacaste a propósito, o la ficha se tiró), no se vuelve a agregar.
function yaEnIndice(termino, id) {
  const buscada = `${termino} → ${id}`.toLowerCase();
  return lineasIndice(fichasIndice(letra(termino))).some(l => l.replace(/~~|__/g, '').trim().toLowerCase() === buscada);
}
function indexarSecas() {
  let alguna = false;
  for (const c of [...S.cards.values()]) {
    const t = c.titulo.replace(/~~|__/g, '').trim();
    if (cajonDe(c.id) !== 'P' || !t || edadMin(c) < TINTA_MIN || yaEnIndice(t, c.id)) continue;
    if (agregarIndice(t, c.id) === 'ok') alguna = true;   // si el término ya tiene 3 entradas, queda afuera sin avisar
  }
  return alguna;
}
// Cada 30 s, salvo mientras escribís (para no sacarte el cursor): se reintenta en la próxima vuelta.
setInterval(() => {
  if (S.cargada && !document.activeElement?.matches?.('input,textarea') && indexarSecas()) render();
}, 30000);
// Papelera: primero se copia a papelera/, después se borra el original. Nunca se pierde nada.
async function tirar(id) {
  const c = S.cards.get(id), citan = citantes(id);
  if (!confirm(`¿Tirar la ficha ${etiqueta(id)}${c.titulo ? ` «${c.titulo}»` : ''} a la papelera?`
    + (citan.length ? `\n\nLa citan: ${citan.map(etiqueta).join(', ')}. Esos enlaces se van a tachar.` : ''))) return;
  // ponytail: la misma ficha tirada dos veces en el mismo minuto pisa la copia anterior; agregar segundos si pasa
  const borrada = ahora(), nombre = `${idArchivo(id)} ${borrada.replace(':', '')}.txt`;
  clearTimeout(pendientes.get(id)); pendientes.delete(id);
  await colaGuardado.get(id);   // que termine cualquier guardado en curso antes de mover el archivo
  if (S.dir) {
    try {
      const pap = await S.dir.getDirectoryHandle('papelera', {create: true});
      const w = await (await pap.getFileHandle(nombre, {create: true})).createWritable();
      await w.write(serFicha(c)); await w.close();
      await S.dir.removeEntry(S.archivos.get(id) ?? idArchivo(id) + '.txt');
    } catch (e) { return alert(`No se pudo tirar ${id}: ${e.message}`); }
  }
  S.archivos.delete(id);
  const ids = lista(), i = ids.indexOf(id);
  if (S.sel === id) S.sel = ids[i + 1] ?? ids[i - 1] ?? null;
  S.cards.delete(id);
  S.papelera.set(nombre, {c, borrada: borrada.replace(':', '')});
  for (const otra of S.cards.values()) if (tacharRefs(id, otra)) guardarFicha(otra);
  if (S.mesa[id]) { delete S.mesa[id]; guardarMesa(); }
  render();
}

// Primero vuelve a escribirse la ficha; solo si salió bien se borra de papelera/.
async function restaurar(nombre) {
  const {c} = S.papelera.get(nombre);
  let id = c.id;
  if (S.cards.has(id)) {
    if (cajonDe(id) === 'I') return alert(`Ya existe la ficha ${etiqueta(id)} del índice. Copiá sus líneas a mano.`);
    id = nuevaRaiz([...S.cards.keys()], cajonDe(id) === 'B' ? 'B' : '');
    if (!confirm(`El número ${c.id} ya lo usa otra ficha. ¿Restaurarla como ${id}?`)) return;
  }
  const r = {...c, id};
  if (!await guardarFicha(r)) return;
  if (S.dir) try { await (await S.dir.getDirectoryHandle('papelera')).removeEntry(nombre); } catch {}
  S.cards.set(id, r); S.papelera.delete(nombre);
  if (id === c.id) for (const otra of S.cards.values()) if (desTacharRefs(id, otra)) guardarFicha(otra);
  render();
}

// Tachar/subrayar: ubicar la k-ésima aparición de un texto.
const contar = (s, t) => { let n = 0, i = 0; while ((i = s.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; };
function nth(s, t, k) { let i = s.indexOf(t); while (i >= 0 && k-- > 0) i = s.indexOf(t, i + t.length); return i; }

// ---------- Caja de ejemplo (mismo formato que los .txt) ----------
const EJEMPLO = {
  fichas: {
    '1': '2024-03-02 10:15\n# Caja como interlocutor\nEl Zettelkasten no es un archivo: es un compañero de comunicación. Uno le pregunta y la caja responde con algo que no se había guardado explícitamente. → 1a',
    '1a': '2024-03-02 10:40\n# El segundo cerebro\nLuhmann lo describe como un «segundo cerebro» con el que se conversa. → B1\n=== reverso ===\nLa conversación exige que la caja tenga estructura propia: si solo devuelve lo que pusiste, es un espejo.',
    '1a1': '2024-05-11 18:02\n# Sorpresa\nSorpresa: la caja devuelve conexiones que nadie planeó. Ver serendipia → 3',
    '1b': '2024-03-09 09:30\n# Fichas atómicas\nFichas atómicas: una idea por ficha. El tamaño fijo (A6) obliga. → 2a',
    '1b1': '2024-03-09 09:45\n# Una idea, una ficha\nSi una idea no entra en la ficha, no es una idea: son dos.',
    '1c': '2024-06-20 21:10\n# Ubicar, no clasificar\nLos números no clasifican, ubican. Una ficha no «pertenece» a un tema: está al lado de otra. → 2',
    '2': '2024-04-01 11:00\n# Folgezettel\nFolgezettel: la posición es significado. Una ficha nueva se coloca detrás de la ficha a la que responde.\n=== reverso ===\n1 → 1a → 1a1 → 1b → 2\nSi 1b ya existe, lo nuevo después de 1a va en 1a1.',
    '2a': '2024-04-01 11:20\n# Ramificación ilimitada\nInsertar en cualquier lugar: la ramificación es ilimitada, el orden nunca se reorganiza. → 2b',
    '2b': '2024-04-03 16:05\n# Enlaces de un solo sentido\nLos enlaces van en un solo sentido: la ficha de destino no sabe que la citan. → 4',
    '2b1': '2025-01-14 08:50\n# El problema de los backlinks\nLos backlinks digitales cambian el sistema: si todo remite a todo, nada remite a nada.',
    '3': '2024-07-07 19:30\n# Serendipia\nSerendipia: al buscar una ficha se ven las vecinas. El camino importa tanto como el destino. → 1a1',
    '3a': '2025-02-02 12:00\n# Contra la búsqueda\nLa búsqueda de texto completo salta directo al resultado y se pierde el camino. → 3',
    '4': '2024-08-15 10:10\n# El índice\nEl índice de palabras clave tiene pocas entradas por término: solo puntos de entrada. Desde ahí se sigue por enlaces. → 1',
    '4a': '2025-06-01 17:45\n# Tinta\nTinta: no se ~~borra~~ corrige. Se tacha, se __subraya__ o se comenta con otra ficha. → 2',
    '5': '2026-01-10 15:00\n# El escritorio\nEscritorio: para escribir, las fichas se sacan de la caja, se ordenan sobre la mesa y después vuelven a su lugar.',
    'B1': '2024-03-02 10:30\n# Luhmann 1981\nLuhmann, N. (1981). «Kommunikation mit Zettelkästen».\n=== reverso ===\nEnsayo donde describe la caja como compañero de comunicación.',
    'B2': '2025-01-14 08:40\n# Schmidt 2016\nSchmidt, J. F. K. (2016). «Niklas Luhmann\'s Card Index: Thinking Tool, Communication Partner, Publication Machine».',
    'Ic': '2024-03-02 11:00\ncomunicación → 1',
    'Ie': '2024-04-03 16:10\nenlaces → 2b',
    'If': '2024-04-01 11:05\nFolgezettel → 2',
    'Is': '2024-07-07 19:40\nserendipia → 3\nserendipia → 1a1',
    'It': '2025-06-01 17:50\ntinta → 4a',
  },
  mesa: {'1': {x: 40, y: 70, z: 1}, '2b': {x: 360, y: 140, z: 2}},
};

// Self-check: abrir index.html#test y mirar la consola.
function test() {
  let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.error('✗', m); } };
  const orden = ['2', '1b', '10', '1a2', '1', '1a', '9', '1a1', '1aa', '1z'].sort(cmpId).join(' ');
  ok(orden === '1 1a 1a1 1a2 1b 1z 1aa 2 9 10', 'orden: ' + orden);
  const hay = (...ids) => x => ids.includes(x);
  ok(nuevaDespues('1a', hay('1a')) === '1b', 'hermano libre');
  ok(nuevaDespues('1a', hay('1a', '1b')) === '1a1', 'ramifica');
  ok(nuevaDespues('1a', hay('1a', '1b', '1a1')) === '1a2', 'siguiente rama');
  ok(nuevaDespues('1', hay('1', '2')) === '1a', 'rama de un número');
  ok(nuevaDespues('1z', hay('1z')) === '1aa', 'z → aa');
  ok(nuevaDespues('B3', hay('B3')) === 'B4', 'bibliografía');
  ok(nuevaRaiz(['1', '3', 'B9']) === '2' && nuevaRaiz(['1', '2']) === '3', 'raíz: primer número libre');
  ok(nuevaRaiz(['B1', 'B3', '1'], 'B') === 'B2', 'raíz B');
  const lejos = [...recorrido(0, 3000)], cerca = [...recorrido(7, 3)];
  ok(lejos.length < 70 && lejos.at(-1) === 3000 && lejos.slice(-3).join() === '2998,2999,3000' && cerca.join() === '6,5,4,3', 'recorrido: rápido lejos, de a una al final');
  // numeración de Luhmann: 9/8, 9/8,1 … 9/8a1
  const lu = ['9/8b', '9/8a1', '9/8,3', '9/8', '9/8a', '9/8,1', '9/9', '9/8j'].sort(cmpId).join(' ');
  ok(lu === '9/8 9/8,1 9/8,3 9/8a 9/8a1 9/8b 9/8j 9/9', 'orden Luhmann: ' + lu);
  ok(nuevaDespues('9/8j', hay('9/8j')) === '9/8k' && nuevaDespues('9/8,3', hay('9/8,3')) === '9/8,4'
    && nuevaDespues('9/8,3', hay('9/8,3', '9/8,4')) === '9/8,3a', 'nueva después, Luhmann');
  const opc = (id, ...hay_) => opcionesDespues(id, hay(id, ...hay_)).map(o => o.id).join(' ');
  ok(opc('9') === '10 9a 9,1 9/1', 'opciones de una raíz: ' + opc('9'));
  ok(opc('9/8', '9/9', '9/8a', '9/8,1') === '9/8b 9/8,2', 'opciones: sin hermano libre, sin barra: ' + opc('9/8', '9/9', '9/8a', '9/8,1'));
  ok(opc('9/8,1') === '9/8,2 9/8,1a', 'después de una coma no se intercala otra: ' + opc('9/8,1'));
  ok(opc('9', '9/1', '9/2') === '10 9a 9,1 9/3' && opc('B2') === 'B3 B2a', 'subsección libre y bibliografía');
  ok([...'ver → 9/8,1, y → 2a, luego → 9/8.'.matchAll(enlaceRe())].map(m => m[1]).join(' ') === '9/8,1 2a 9/8', 'enlaces con barra y coma');
  ok(!refRe('9/8').test('→ 9/8,1') && !refRe('9/8').test('→ 9/8a') && refRe('9/8').test('→ 9/8 y'), 'una referencia no es otra más larga');
  ok(nombreArchivo({id: '9/8,1', titulo: ''}) === '9-8,1.txt' && idDeArchivo('9-8,1.txt') === '9/8,1' && idDeArchivo('9-8a1 Algo.txt') === '9/8a1', 'archivo ↔ número Luhmann');
  // mayúsculas y números repetidos: 1/7D1A no pisa a 1/7D1a en Windows
  ok(nombreArchivo({id: '1/7D1A', titulo: ''}) === '1-7^D1^A.txt' && idDeArchivo('1-7^D1^A.txt') === '1/7D1A'
    && idDeArchivo('1-7^D1a.txt') === '1/7D1a' && nombreArchivo({id: 'B3', titulo: ''}) === 'B3.txt' && idDeArchivo('1(2).txt') === '1(2)', 'archivo con mayúsculas y repetidas');
  ok([...'→ 1/7D1A y → 1(2).'.matchAll(enlaceRe())].map(m => m[1]).join(' ') === '1/7D1A 1(2)', 'enlaces con mayúscula y repetida');
  ok(['1/7D1a', '1/7D1A', '1/7D1', '1,1', '1(2)', '1(1)'].sort(cmpId).join(' ') === '1(1) 1(2) 1,1 1/7D1 1/7D1A 1/7D1a', 'orden con mayúsculas');
  ok(opcionesDespues('1/7D', hay('1/7D')).map(o => o.id).join(' ') === '1/7E 1/7D1 1/7D,1' && inc('Z') === 'AA', 'nuevas con mayúscula');
  const ordenAntes = S.orden; S.orden = new Map([['1/7Da', 0], ['1/7D1', 1]]);
  ok(['1/7D1', '1/7Da'].sort(cmpOrden).join(' ') === '1/7Da 1/7D1', 'el orden de la caja manda');
  S.orden = ordenAntes;
  // el mueble de la caja: «# n» abre un cajón; una ficha nueva va al cajón de la anterior por número
  const [cajAntes, fisAntes] = [S.cajones, S.fisico];
  armarCajones('# 1\n1\n1a\n# 2\n2\n2a\n');
  ok(S.cajones.map(c => c.k).join() === 'P1,P2,B,I' && S.cajones[1].nombre === 'Cajón 2', 'cajones del mueble');
  ok(cajonDeFicha('1a') === 'P1' && cajonDeFicha('2a') === 'P2' && cajonDeFicha('1b') === 'P1' && cajonDeFicha('2b') === 'P2'
    && cajonDeFicha('B1') === 'B' && S.orden.get('2') === 2, 'ficha → cajón');
  armarCajones(null);
  ok(S.cajones.map(c => c.k).join() === 'P,B,I' && cajonDeFicha('1b') === 'P', 'caja propia: tres cajones');
  // cajones creados por el usuario: el Principal pasa a ser el primero; las raíces van al cajón abierto
  const [cardsAntes, dirAntes2, cajonAntes] = [S.cards, S.dir, S.cajon];
  S.cards = new Map(); S.dir = null;
  for (const id of ['1', '1a', '2']) S.cards.set(id, {id, fecha: '2020-01-01 10:00', titulo: '', frente: '', reverso: ''});
  const k2 = nuevoCajon('2');
  ok(k2 === 'P2' && S.cajones.map(c => c.nombre).join() === 'Principal,Cajón 2,Bibliografía,Índice' && cajonDeFicha('1a') === 'PPrincipal', 'nuevo cajón');
  nuevaFicha('3', S.cajon); nuevaFicha('1b');
  ok(cajonDeFicha('3') === 'P2' && cajonDeFicha('1b') === 'PPrincipal', 'raíz al cajón abierto, respuesta al cajón de la anterior');
  const alertAntes = window.alert; window.alert = () => {};
  ok(nuevoCajon('2') === null && nuevoCajon(' ') === null, 'sin nombres repetidos ni vacíos');
  window.alert = alertAntes;
  [S.cards, S.dir, S.cajon] = [cardsAntes, dirAntes2, cajonAntes];
  [S.cajones, S.fisico, S.orden] = [cajAntes, fisAntes, ordenAntes];
  ok(idDeArchivo(nombreArchivo({id: '21/3d5b11z,u37', titulo: ''})) === '21/3d5b11z,u37' && !idDeArchivo('1,.txt'), 'coma y letra');
  ok([...'→ 21/A y → 21/3d5b11z/t10, → 2/ nada'.matchAll(enlaceRe())].map(m => m[1]).join(' ') === '21/A 21/3d5b11z/t10 2', 'barra y letra');
  ok(idDeArchivo(nombreArchivo({id: '21/3d5b11z/tB3', titulo: ''})) === '21/3d5b11z/tB3' && idDeArchivo('21-^A.txt') === '21/A', 'archivo con barra y letra');
  ok(edadMin({fecha: 's/f'}) === Infinity && sepia({fecha: 's/f'}) === '0.70', 'sin fecha: tinta vieja');
  ok(!renderTxt('~~s → 1~~').includes('class="ln'), 'lo tachado no es enlace');
  const normal = {id: '5', frente: 'ver → 3 y → 3a', reverso: 'otra → 3'}, idx = {id: 'Is', frente: 'serendipia → 3\nsorpresa → 1', reverso: ''};
  const copia = o => JSON.stringify(o), n0 = copia(normal), i0 = copia(idx);
  tacharRefs('3', normal); tacharRefs('3', idx);
  ok(normal.frente === 'ver ~~→ 3~~ y → 3a' && normal.reverso === 'otra ~~→ 3~~', 'tachar enlaces: ' + normal.frente);
  ok(idx.frente === '~~serendipia → 3~~\nsorpresa → 1', 'tachar línea del índice');
  ok(!tacharRefs('3', normal), 'tachar dos veces no cambia nada');
  desTacharRefs('3', normal); desTacharRefs('3', idx);
  ok(copia(normal) === n0 && copia(idx) === i0, 'destachar vuelve al original');
  const f = {id: '1', fecha: '2026-01-01 10:00', titulo: 'Un título', frente: 'hola\nmundo', reverso: 'atrás'};
  ok(JSON.stringify(parseFicha('1', serFicha(f))) === JSON.stringify(f), 'ida y vuelta');
  const g = parseFicha('2', '2026-01-01 10:00\nsolo frente\n');
  ok(g.reverso === '' && g.titulo === '' && g.frente === 'solo frente', 'sin título ni reverso');
  ok(renderTxt('a ~~b~~ __c__ -> 1a') === 'a <s>b</s> <u>c</u> <a class="ln roto" data-id="1a">→ 1a</a>', 'render');
  ok(nth('x foo foo', 'foo', 1) === 6, 'nth');
  const na = (id, titulo) => nombreArchivo({id, titulo});
  ok(na('1a2', 'Fichas atómicas') === '1a2 Fichas atómicas.txt' && na('3', '') === '3.txt', 'nombre con título');
  ok(na('2', '¿Qué es? ~~no~~ a/b: "c"...') === '2 ¿Qué es no ab c.txt', 'nombre sin caracteres prohibidos: ' + na('2', '¿Qué es? ~~no~~ a/b: "c"...'));
  ok(idDeArchivo('1a2 Fichas atómicas.txt') === '1a2' && idDeArchivo('B3.txt') === 'B3' && idDeArchivo('Iñ.txt') === 'Iñ', 'id desde el nombre');
  ok(!idDeArchivo('escritorio.json') && !idDeArchivo('registro.txt') && !idDeArchivo('notas 1.txt'), 'otros archivos no son fichas');
  ok(['Serendipia', 'Émile', 'ñandú', '3D'].map(letra).join('') === 'señ#', 'letra');
  ok(etiqueta('Iñ') === 'Ñ' && etiqueta('1a') === '1a' && cajonDe('Is') === 'I' && cajonDe('B2') === 'B', 'cajones');
  const antes = new Map(S.cards), dirAntes = S.dir; S.dir = null; S.cards.clear(); // índice en memoria, sin carpeta
  ok(agregarIndice('Árbol', '1') === 'ok' && S.cards.get('Ia').frente === 'Árbol → 1', 'índice: agrega');
  ok(agregarIndice('árbol', '1') === 'ya está', 'índice: no duplica');
  agregarIndice('Árbol', '2'); agregarIndice('Árbol', '3');
  ok(agregarIndice('Árbol', '4') !== 'ok' && agregarIndice('Árbol', '4', true) === 'ok', 'índice: 3 entradas en purista');
  for (let i = 0; i < 150; i++) agregarIndice(`Alfa ${i}`, String(i), true);   // ~2000 caracteres: llena las dos caras de Ia
  ok(S.cards.has('Ia2') && yaEnIndice('Alfa 149', '149') && agregarIndice('Alfa 149', '149', true) === 'ya está'
    && idDeArchivo('Ia2.txt') === 'Ia2' && etiqueta('Ia2') === 'A2', 'índice: sigue en Ia2');
  // índice automático al secarse la tinta
  S.cards.clear();
  const vieja = {id: '7', fecha: '2020-01-01 10:00', titulo: 'Tinta seca', frente: '', reverso: ''};
  const fresca = {id: '8', fecha: ahora(), titulo: 'Tinta fresca', frente: '', reverso: ''};
  const fuente = {id: 'B5', fecha: '2020-01-01 10:00', titulo: 'Una fuente', frente: '', reverso: ''};
  for (const c of [vieja, fresca, fuente]) S.cards.set(c.id, c);
  ok(indexarSecas() && S.cards.get('It').frente === 'Tinta seca → 7', 'auto: indexa la seca');
  ok(!indexarSecas() && S.cards.get('It').frente === 'Tinta seca → 7', 'auto: no duplica ni indexa la fresca');
  ok(!S.cards.has('Iu'), 'auto: la bibliografía no se indexa sola');
  S.cards.get('It').frente = '~~Tinta seca → 7~~';
  ok(!indexarSecas() && S.cards.get('It').frente === '~~Tinta seca → 7~~', 'auto: lo tachado no vuelve');
  // armar texto: orden de lectura (filas, después x), marcas convertidas, bibliografía
  S.cards.clear();
  const mesaAntes = S.mesa;
  const fichas = {'1': '2020-01-01 10:00\n# Uno\nHola ~~chau~~ __ojo__ → 2 → B1', '2': '2020-01-01 10:00\n# Dos\nSegunda\n=== reverso ===\natrás',
    '3': '2020-01-01 10:00\nsin título', 'B1': '2020-01-01 10:00\n# L\nLuhmann (1981).', 'B2': '2020-01-01 10:00\nNo citada', 'Ia': '2020-01-01 10:00\na → 1'};
  for (const [id, t] of Object.entries(fichas)) S.cards.set(id, parseFicha(id, t));
  S.mesa = {'3': {x: 0, y: 300}, '2': {x: 400, y: 80}, '1': {x: 10, y: 10}, 'Ia': {x: 5, y: 5}};
  ok(ordenLectura().join(' ') === '1 2 3', 'armar: orden de lectura ' + ordenLectura().join(' '));
  const md = armarTexto();
  ok(md.startsWith('# Uno\n\n## Uno (1)\n\nHola *ojo* (→ 2) (→ B1)\n'), 'armar: marcas\n' + md);
  ok(md.includes('## Dos (2)\n\nSegunda\n\natrás') && md.includes('## (3)\n\nsin título'), 'armar: reverso y sin título');
  ok(md.endsWith('## Bibliografía\n\n- B1. Luhmann (1981).\n') && !md.includes('No citada') && !md.includes('a → 1'), 'armar: bibliografía');
  S.cards = antes; S.dir = dirAntes; S.mesa = mesaAntes;
  console.log(fallos ? `✗ ${fallos} fallos` : '✓ todos los tests pasan');
  document.title = fallos ? '✗ tests' : '✓ tests';
  testRespaldo();
}
// Respaldo contra el sistema de archivos interno del navegador (OPFS): nada toca la carpeta real.
async function testRespaldo() {
  const raiz = await navigator.storage.getDirectory();
  await raiz.removeEntry('prueba-respaldo', {recursive: true}).catch(() => {});
  const dir = await raiz.getDirectoryHandle('prueba-respaldo', {create: true});
  const poner = async (d, n, t) => { const w = await (await d.getFileHandle(n, {create: true})).createWritable(); await w.write(t); await w.close(); };
  await poner(dir, '1 Uno.txt', 'x'); await poner(dir, 'escritorio.json', '{}'); await poner(dir, 'notas.txt', 'no');
  const r = await dir.getDirectoryHandle('respaldos', {create: true});
  for (let i = 1; i <= 31; i++) await r.getDirectoryHandle(`2000-01-${String(i).padStart(2, '0')}`, {create: true});
  await r.getDirectoryHandle('mío', {create: true});
  const hecho = await respaldar(dir), otra = await respaldar(dir);
  const nombres = async d => { const n = []; for await (const k of d.keys()) n.push(k); return n.sort(); };
  const hoy = await r.getDirectoryHandle(ahora().slice(0, 10)), dias = await nombres(r);
  const bien = hecho && !otra && (await nombres(hoy)).join('|') === '1 Uno.txt|escritorio.json'
    && dias.length === 31 && !dias.includes('2000-01-01') && !dias.includes('2000-01-02') && dias.includes('mío');
  await raiz.removeEntry('prueba-respaldo', {recursive: true});
  console[bien ? 'log' : 'error'](bien ? '✓ respaldo' : '✗ respaldo: ' + dias.join(' '));
  if (!bien) document.title = '✗ tests';
}
if (location.hash === '#test') test();
