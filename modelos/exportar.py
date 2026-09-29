# Exporta el .blend al modelo de la página 3D, con las texturas achicadas para la web (el .blend no se toca).
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b modelos\escritorio_03.blend --python modelos\exportar.py
#   python modelos\empaquetar.py
# Con texturas nuevas de Substance en otra carpeta, sin volver a enlazarlas en Blender:
#   ... --python modelos\exportar.py -- modelos\Substance\Textures\03
# Las texturas pasan a JPEG y, si miden más de 2048 px, se achican (la de color en PNG a 4096 pesa unos 16 MB).
# Roughness y metallic se juntan solas en una sola textura (glTF). Los modificadores (biseles) se aplican.
import bpy, pathlib, sys

LADO = 2048   # ponytail: 4096 se ve más nítido de cerca, pero cuadruplica la memoria de video; subirlo si hace falta
DESTINO = pathlib.Path(bpy.data.filepath).parent / 'escritorio.glb'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

if args:   # misma textura, otra carpeta: se usa la del mismo nombre
    carpeta = pathlib.Path(args[0]).resolve()
    for img in bpy.data.images:
        nueva = carpeta / pathlib.Path(bpy.path.abspath(img.filepath)).name if img.filepath else None
        if nueva and nueva.exists():
            img.filepath = str(nueva); img.reload()
            print(f'{img.name}: desde {nueva}')
for img in bpy.data.images:   # solo en memoria
    if img.size[0] > LADO or img.size[1] > LADO:
        print(f'{img.name}: {tuple(img.size)} -> {LADO}')
        img.scale(LADO, LADO)
bpy.ops.export_scene.gltf(filepath=str(DESTINO), export_format='GLB',
                          export_image_format='JPEG', export_jpeg_quality=88, export_apply=True)
print(f'Exportado: {DESTINO}. Ahora: python modelos/empaquetar.py')
