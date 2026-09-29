"""Arma el sitio con una lista cerrada de archivos públicos."""
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
SITE = ROOT / '_site'
ARCHIVOS = (
    'index.html', '2d.html', 'nucleo.js', 'idiomas.js', 'sesion.js',
    'vendor/three.js', 'modelos/escritorio.glb.js',
    'demo/luhmann-zk2-de.json', 'demo/luhmann-zk2-en.json',
)

if SITE.is_symlink() or SITE.resolve().parent != ROOT.resolve():
    raise RuntimeError(f'Ruta de salida inesperada: {SITE}')
if SITE.exists():
    shutil.rmtree(SITE)
SITE.mkdir()
for nombre in ARCHIVOS:
    origen = ROOT / nombre
    if not origen.is_file():
        raise FileNotFoundError(origen)
    destino = SITE / nombre
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(origen, destino)
print(f'{SITE}: {len(ARCHIVOS)} archivos públicos')
