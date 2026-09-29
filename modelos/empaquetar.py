# Convierte escritorio.glb en escritorio.glb.js para que la página 3D lo pueda cargar
# también abierta desde el disco (file://), donde el navegador no deja leer archivos sueltos.
# Correr después de cada exportación desde Blender:  python modelos/empaquetar.py
import base64, pathlib

aqui = pathlib.Path(__file__).parent
datos = base64.b64encode((aqui / 'escritorio.glb').read_bytes()).decode('ascii')
(aqui / 'escritorio.glb.js').write_text(f'window.MODELO_ESCRITORIO = "{datos}";\n', encoding='ascii')
print(f'escritorio.glb.js: {len(datos) // 1024} KB')
