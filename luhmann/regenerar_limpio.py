"""Reconstruye las demos desde caché, sin red ni llamadas nuevas a traducción."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).parent
REPO = RAIZ.parent


def correr(script, args, env):
    subprocess.run([sys.executable, str(script), *args], cwd=script.parent, env=env, check=True)


with tempfile.TemporaryDirectory(prefix='.regenerar-zk2-', dir=RAIZ) as temporal:
    trabajo = Path(temporal)
    (trabajo / 'datos').mkdir()
    shutil.copytree(RAIZ / 'datos', trabajo / 'datos', dirs_exist_ok=True)
    destino = trabajo / 'zk2'
    destino.mkdir()
    origen_meta = RAIZ / 'zk2'
    for nombre in ('bibliografia.json', 'indice.json', 'secciones.json', 'fisico.json'):
        shutil.copy2(origen_meta / nombre, destino / nombre)

    importar = (RAIZ / 'importar.py').read_text(encoding='utf-8')
    importar = importar.replace('import datetime, html, json, pathlib, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request',
                                'import datetime, html, json, os, pathlib, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request')
    importar = importar.replace('def pedir(url):\n', "def pedir(url):\n    if os.environ.get('ZK_OFFLINE') == '1':\n        raise RuntimeError('Caché incompleta: modo sin red activo')\n")
    if 'Caché incompleta: modo sin red activo' not in importar:
        raise RuntimeError('No se pudo activar el control sin red del importador')
    (trabajo / 'importar.py').write_text(importar, encoding='utf-8')
    shutil.copytree(RAIZ / 'zk2' / 'en', destino / 'en')
    fuente_en = destino / 'en' / 'FUENTE.txt'
    texto_fuente = fuente_en.read_text(encoding='utf-8').replace(
        'Ollama, qwen3.5), por capítulo', 'Ollama, qwen3.5:9b), sin revisión humana; por capítulo')
    fuente_en.write_text(texto_fuente, encoding='utf-8')
    shutil.copy2(RAIZ / 'empaquetar.py', trabajo / 'empaquetar.py')

    entorno = os.environ.copy()
    entorno['ZK_OFFLINE'] = '1'
    entorno['PYTHONIOENCODING'] = 'utf-8'
    correr(trabajo / 'importar.py', ['2', 'todo'], entorno)
    entorno['ZK_PACKAGE_SOURCE'] = str(trabajo)
    entorno['ZK_PACKAGE_OUT'] = str(REPO / 'demo')
    correr(trabajo / 'empaquetar.py', [], entorno)
