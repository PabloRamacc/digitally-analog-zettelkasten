// Una pestaña puede probar la caja sin convertir la demo en archivos del usuario.
let sesionId, errorSesion = false, colaSesion = Promise.resolve();
try {
  sesionId = sessionStorage.getItem('zettelkasten-sesion') || crypto.randomUUID();
  sessionStorage.setItem('zettelkasten-sesion', sesionId);
} catch {}
const claveSesion = origen => `sesion:${sesionId}:${origen}`;
function fotoCaja() {
  return {cards: [...S.cards], archivos: [...S.archivos], papelera: [...S.papelera], mesa: S.mesa,
    cajones: S.cajones.map(c => ({k: c.k, cab: c.cab})), orden: S.orden && [...S.orden],
    fisico: S.fisico && [...S.fisico], nombre: S.nombre, origen: S.origen,
    modo: S.modo, cajon: S.cajon, nuevas: [...recienCreadas]};
}
function guardarSesion() {
  if (!S.cargada || S.dir || !S.origen) return Promise.resolve(true);
  const clave = claveSesion(S.origen), foto = structuredClone(fotoCaja());
  colaSesion = colaSesion.catch(() => {}).then(async () => {
    try {
      if (!sesionId) throw Error('Almacenamiento de sesión no disponible');
      await idb('readwrite', s => s.put(foto, clave)); errorSesion = false; return true;
    } catch { errorSesion = true; return false; }
  });
  return colaSesion;
}
window.guardarSesion = guardarSesion;
async function recuperarSesion(origen) {
  if (!sesionId) return null;
  try { return await idb('readonly', s => s.get(claveSesion(origen))); } catch { return null; }
}
function instalarSesion(foto) {
  Object.assign(S, {dir: null, cards: new Map(foto.cards), archivos: new Map(foto.archivos),
    papelera: new Map(foto.papelera), mesa: foto.mesa, modo: foto.modo, origen: foto.origen, nombre: foto.nombre});
  armarCajones(foto.cajones.filter(c => c.cab != null).map(c => '# ' + c.cab).join('\n'));
  S.orden = foto.orden && new Map(foto.orden); S.fisico = foto.fisico && new Map(foto.fisico);
  S.cajon = foto.cajon; recienCreadas.clear(); foto.nuevas?.forEach(id => recienCreadas.add(id));
  empezar(S.nombre);
}
window.antesDeCambiarCaja = async () => {
  if (await guardarSesion()) return true;
  alert(t('No se pudo conservar la sesión temporal. Reintentá antes de salir.'));
  return false;
};
async function navegarVista(url) {
  if (cambiandoCaja) return;
  cambiandoCaja = true; generacionCaja++;
  cancelarMenus();
  try {
    await window.alCambiarCaja?.();
    if (!await terminarGuardados() || !await window.antesDeCambiarCaja()) return;
    location.href = url + (S.origen ? '#caja=' + encodeURIComponent(S.origen) : '');
  } finally { cambiandoCaja = false; }
}
async function abrirDemo(nombre, reiniciar = false) {
  if (!['luhmann-zk2-de', 'luhmann-zk2-en'].includes(nombre)) return;
  const origen = 'demo:' + nombre;
  return cambiarDeCaja(async () => {
    const foto = !reiniciar && await recuperarSesion(origen);
    if (foto) return () => instalarSesion(foto);
    const r = await fetch('demo/' + nombre + '.json');
    if (!r.ok) throw Error(t('No se pudo descargar la demo ({n}).', {n: r.status}));
    const datos = await r.json();
    if (!datos || typeof datos !== 'object' || Array.isArray(datos) || !Object.values(datos).every(x => typeof x === 'string')) throw Error(t('La demo no tiene un formato válido.'));
    const caja = leerArchivos(Object.entries(datos).map(([nombre, txt]) => ({nombre, txt})));
    return () => instalarCaja(caja, null, origen, nombre.endsWith('-de') ? 'Luhmann ZK II · Deutsch' : 'Luhmann ZK II · English');
  });
}
async function abrirEjemplo(reiniciar = false) {
  if (!reiniciar) {
    const foto = await recuperarSesion('ejemplo');
    if (foto) return cambiarDeCaja(async () => () => instalarSesion(foto));
  }
  return cargarEjemplo();
}
function actualizarEstado() {
  if (!S.cargada) return;
  $('#estado').textContent = S.dir ? S.nombre : (S.origen === 'ejemplo' ? t('Ejemplo') : S.nombre) + ' · ' + t('sesión temporal');
  $('#btnReiniciar')?.classList.toggle('oculto', !!S.dir);
  if (location.hash !== '#test') history.replaceState(null, '', '#caja=' + encodeURIComponent(S.origen));
}
addEventListener('beforeunload', e => { if (errorSesion) { e.preventDefault(); e.returnValue = ''; } });
// Los eventos ya modificaron el núcleo al llegar a window. Guardamos el estado actual, sin esperar un debounce.
for (const evento of ['input', 'click', 'pointerup', 'keydown']) addEventListener(evento, () => {
  if (!cambiandoCaja) guardarSesion();
});
addEventListener('load', async () => {
  if (location.hash === '#test') return;
  $('#btnEjemplo').onclick = () => abrirEjemplo();
  $('#btnReiniciar').onclick = async () => {
    if (!confirm(t('¿Reiniciar esta caja temporal y descartar sus cambios?'))) return;
    if (S.origen === 'ejemplo') await abrirEjemplo(true);
    else if (S.origen?.startsWith('demo:')) await abrirDemo(S.origen.slice(5), true);
    await guardarSesion();
  };
  for (const b of document.querySelectorAll('[data-demo]')) {
    b.hidden = !/^https?:$/.test(location.protocol);
    b.onclick = () => abrirDemo(b.dataset.demo);
  }
  const origen = new URLSearchParams(location.hash.slice(1)).get('caja');
  if (origen === 'ejemplo') await abrirEjemplo();
  else if (origen?.startsWith('demo:')) await abrirDemo(origen.slice(5));
  else if (origen === 'carpeta') {
    try {
      const h = await idb('readonly', s => s.get('dir'));
      if (h && await h.queryPermission({mode: 'readwrite'}) === 'granted') await abrirCarpeta(h);
    } catch {}
  }
});
