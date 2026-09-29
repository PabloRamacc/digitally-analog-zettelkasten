"""Empaqueta solo fichas publicables, el orden y la fuente para GitHub Pages."""
import json
import os
import re
from pathlib import Path

BASE = Path(os.environ.get('ZK_PACKAGE_SOURCE', Path(__file__).parent))
RAIZ = BASE / 'zk2'
SALIDA = Path(os.environ.get('ZK_PACKAGE_OUT', Path(__file__).parent.parent / 'demo'))
ID = re.compile(r'^(B?\d(?:[0-9a-z]|\^[A-Z]|[-,](?:[0-9a-z]|\^[A-Z]))*(?:\(\d+\))?|I[a-zñ#]\d*)(?: .*)?\.txt$')


def empaquetar(idioma):
    carpeta = RAIZ / idioma
    datos = {}
    for archivo in carpeta.glob('*.txt'):
        if archivo.name == 'FUENTE.txt':
            continue
        if not ID.fullmatch(archivo.name):
            continue
        id_ficha = archivo.stem.split(' ', 1)[0].replace('^', '').replace('-', '/')
        if id_ficha in datos:
            raise ValueError(f'Número repetido en {idioma}: {id_ficha}')
        texto = archivo.read_text(encoding='utf-8')
        if 'dwadaw' in texto.casefold() or re.search(r'~~[^\n]*→\s*1(?:[^0-9a-zA-Z]|$)', texto):
            raise ValueError(f'Quedó estado de prueba en {archivo}')
        datos[archivo.name] = texto
    orden = carpeta / 'orden.txt'
    fuente = carpeta / 'FUENTE.txt'
    if not orden.is_file() or not fuente.is_file():
        raise FileNotFoundError(f'Faltan orden.txt o FUENTE.txt en {carpeta}')
    datos['orden.txt'] = orden.read_text(encoding='utf-8')
    datos['FUENTE.txt'] = fuente.read_text(encoding='utf-8')
    if not datos:
        raise ValueError(f'La caja {idioma} está vacía')
    SALIDA.mkdir(exist_ok=True)
    destino = SALIDA / f'luhmann-zk2-{idioma}.json'
    destino.write_text(json.dumps(datos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{destino}: {len(datos) - 2} fichas + orden y fuente ({destino.stat().st_size:,} bytes)')


if __name__ == '__main__':
    for idioma in ('de', 'en'):
        empaquetar(idioma)
