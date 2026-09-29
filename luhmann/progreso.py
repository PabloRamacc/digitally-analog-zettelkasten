# Muestra cómo van importar.py y traducir.py, sin tocarlos: cuenta lo que ya está en disco, por capítulo.
# Uso:  python luhmann/progreso.py      (se actualiza solo; Ctrl+C para salir)
#       python luhmann/progreso.py 1    (una sola vez)
import json, os, pathlib, re, sys, time

AQUI = pathlib.Path(__file__).parent
ZK = 'II'   # ponytail: solo el ZK II, que es el que se está bajando; para el ZK I cambiar acá
CAJA = AQUI / f'zk{len(ZK)}'
barra = lambda n, v: f'{"█" * round(30 * n / v):<30}  {n:>5} / {v}'


def totales():
    raiz = json.loads((AQUI / 'datos' / f'secciones_ZK{ZK}.json').read_text(encoding='utf-8'))
    def tramos(n):   # lo que recorre importar.py: las partes publicadas enteras
        if n.get('readyForPublication'):
            yield n
        else:
            for h in n.get('children', []):
                yield from tramos(h)
    t = {c['n']: sum(x.get('numberOfFrontPages') or 0 for x in tramos(c)) for c in raiz['children'] if c.get('n')}
    return {k: v for k, v in t.items() if v}


def bajadas():
    c = {}
    for nombre in os.listdir(AQUI / 'datos'):
        m = re.match(r'ZK_\d_NB_([^-_]+).*_V\.json$', nombre.replace('^', ''))
        if m:
            c[m[1]] = c.get(m[1], 0) + 1
    return c


def por_capitulo(carpeta):
    """Fichas de Luhmann (no B ni índice) de una caja, por capítulo: «536-12a.txt» → 536."""
    c = {}
    if carpeta.exists():
        for nombre in os.listdir(carpeta):
            if (m := re.match(r'(\d+)', nombre)) and nombre.endswith('.txt'):
                c[m[1]] = c.get(m[1], 0) + 1
    return c


def ritmo(clave, hecho, total, antes):
    if clave not in antes:
        antes[clave] = (hecho, time.time()); return '  ritmo  (se calcula en 10 s)'
    r = (hecho - antes[clave][0]) / max(1, time.time() - antes[clave][1])
    return f'  ritmo  {r * 60:.0f} fichas/min' + (f' · faltan ~{(total - hecho) / r / 60:.0f} min' if r > 0 and hecho < total else '')


def cola(nombre, n=2):
    p = CAJA / nombre
    return ['  ' + l for l in p.read_text(encoding='utf-8', errors='replace').splitlines()[-n:]] if p.exists() else []


def mostrar(tot, antes):
    lineas = [f'Zettelkasten {ZK} · {time.strftime("%H:%M:%S")}', '', 'DESCARGA (alemán)']
    b = bajadas(); hecho = sum(min(b.get(k, 0), v) for k, v in tot.items()); total = sum(tot.values())
    if hecho < total:
        lineas += [f'  {k:>5}  {barra(min(b.get(k, 0), v), v)}' for k, v in tot.items()]
        lineas += [f'  total  {hecho} / {total}  ({100 * hecho / total:.0f} %)', ritmo('descarga', hecho, total, antes)]
    else:
        lineas.append(f'  completa: {total} fichas recorridas')
    lineas += cola('importar.log', 1)
    de = por_capitulo(CAJA / 'de')
    for idioma in ('en', 'es'):
        tr = por_capitulo(CAJA / idioma)
        if not tr:
            continue
        hechas, todas = sum(min(tr.get(k, 0), v) for k, v in de.items()), sum(de.values())
        lineas += ['', f'TRADUCCIÓN ({idioma})']
        lineas += [f'  {k:>5}  {barra(min(tr.get(k, 0), v), v)}' for k, v in sorted(de.items(), key=lambda x: int(x[0]))]
        lineas += [f'  total  {hechas} / {todas}  ({100 * hechas / todas:.0f} %)', ritmo(idioma, hechas, todas, antes)]
    lineas += ['', *cola('traducir.log', 2)]
    print('\033[2J\033[H' + '\n'.join(lineas), flush=True)


if __name__ == '__main__':
    os.system('')   # activa los colores y el borrado de pantalla en la consola de Windows
    tot, antes = totales(), {}
    mostrar(tot, antes)
    if len(sys.argv) < 2:
        while True:
            time.sleep(10)
            mostrar(tot, antes)
