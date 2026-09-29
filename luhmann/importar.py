# Importa fichas del Zettelkasten de Niklas Luhmann (Niklas Luhmann-Archiv) como caja de la app.
# Uso:  python luhmann/importar.py 2 9/8      una sección del ZK II
#       python luhmann/importar.py 2 21       un capítulo (solo lo ya publicado por el archivo)
#       python luhmann/importar.py 2 todo     todos los capítulos, en orden
# Cada caja va en luhmann/zk1/de o luhmann/zk2/de: las dos repiten números (las dos tienen un 7/10).
# Se puede cortar y volver a correr: lo bajado queda en luhmann/datos/ (solo los campos que se usan).
# Contenido: CC BY-NC-SA 4.0, Niklas Luhmann-Archiv, Universität Bielefeld.
import datetime, html, json, pathlib, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

AQUI = pathlib.Path(__file__).parent
DATOS = AQUI / 'datos'
API = 'https://v0.api.niklas-luhmann-archiv.de/ZK/zettel/'
SECCIONES = 'https://niklas-luhmann-archiv.de/assets/Inhalts%C3%BCbersicht_ZK{}.json'
WEB = 'https://niklas-luhmann-archiv.de/bestand/'
ID = re.compile(r'B?\d(?:[0-9a-zA-Z]|[/,][0-9a-zA-Z])*(?:\(\d+\))?')   # igual que ID en nucleo.js: 1/7D1a, 9/8,1, 21/A, 1(2)
# Windows no distingue mayúsculas: 1/7D1A y 1/7D1a serían el mismo archivo. La mayúscula lleva un ^ adelante.
a_archivo = lambda s: re.sub(r'(?<=.)([A-Z])', r'^\1', s)
LIM, SEP = 700, '\n=== reverso ===\n'
PAUSA = .4   # entre pedidos al servidor del archivo, para no cargarlo


def pedir(url):
    for intento in range(4):
        time.sleep(PAUSA)
        try:
            pedido = urllib.request.Request(url, headers={'User-Agent': 'zettelkasten-importar/1'})
            with urllib.request.urlopen(pedido, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(5 * (intento + 1))
    raise RuntimeError(f'El archivo no responde: {url}')


def ficha(ekin, fresca=False):
    """Los datos de una cara de ficha, de datos/ o del archivo. None si el archivo no la publica."""
    p = DATOS / (re.sub(r'[\\/:*?"<>|\x00-\x1f]', '~', a_archivo(ekin)) + '.json')   # hay enlaces con errores de tipeo (7\25g46b)
    if p.exists() and not fresca:
        j = json.loads(p.read_text(encoding='utf-8'))
        if 'html' in j or 'error' in j:
            return None if 'error' in j else j
    else:
        DATOS.mkdir(exist_ok=True)
        try:
            j = pedir(API + urllib.parse.quote(ekin))
        except urllib.error.HTTPError as e:
            j = {'error': e.code}
        if not j.get('ekin'):   # no existe o no está publicada (a veces el archivo contesta 200 sin ficha)
            p.write_text(json.dumps({'ekin': ekin, 'error': j.get('error', 'vacía')}), encoding='utf-8')
            return None
    nav = lambda k, f: next((n['ekin'] for n in j.get('navigation', {}).get(k, []) if f(n['relation'])), None)
    t = j.get('transcription') or {}
    s = {'ekin': j['ekin'], 'shortTitle': j.get('shortTitle', ''), 'html': t.get('html') or '',
         'ready': bool(t.get('readyForPublication')),
         'next': nav('corrected_physical', lambda r: 'naechsten' in r), 'atras': nav('original_physical', lambda r: r == 'kehrseite'),
         'sw': [x['label'] for x in (j.get('index') or {}).get('luhmann_SW1', []) if x.get('label')],
         # dónde estaba en el mueble: cajón (Auszug), tanda y número de escaneo, de la imagen «ZK_2_15_52_081_…»
         # (sin escaneo: solo el cajón, al final de ese cajón)
         'lugar': (m := re.match(r'ZK_\d_(\d+_\d+_\d+)', (j.get('image') or {}).get('id') or '')) and m[1]
                  or (f'{int(j["auszug"]):02d}_99_999' if str(j.get('auszug') or '').isdigit() else None)}
    p.write_text(json.dumps(s, ensure_ascii=False), encoding='utf-8')
    return s


def numero(ekin):
    j = ficha(ekin)
    # ponytail: si el destino no está publicado, se adivina desde el ekin (ZK_2_NB_9-8_V → 9/8)
    return j['shortTitle'] if j and j['shortTitle'] else re.sub(r'^ZK_\d_NB_|_[VR]$', '', ekin).replace('-', '/', 1)


class Bibliografia:   # clave de literatura → (B n, cita corta); se guarda, así los números no cambian entre corridas
    def __init__(self, p):
        self.p, self.d = p, json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
        self.nuevas = set()

    def id(self, clave, texto):
        if clave not in self.d:
            self.d[clave] = [f'B{len(self.d) + 1}', re.sub(r',\s*S\..*$', '', texto).strip()]
            self.nuevas.add(clave)
        return self.d[clave][0]

    def guardar(self):
        self.p.write_text(json.dumps(self.d, ensure_ascii=False, indent=0), encoding='utf-8')


def a_texto(h, bib):
    """HTML de la transcripción → texto de ficha: __subrayado__, → enlaces, párrafos en renglones."""
    h = re.sub(r'\s+', ' ', h)   # los saltos del HTML no son del texto: los párrafos salen de </p>
    h = re.sub(r'<span class="(?:zettel-nummer|add_editor)"[^>]*>[^<]*</span>', '', h)
    h = re.sub(r'<span>-</span>\s*<br\s*/?>', '', h)          # palabra cortada al final del renglón
    h = re.sub(r'<br\s*/?>', ' ', h)
    h = re.sub(r'<a href="/bestand/zettelkasten/zettel/([^"]+)"[^>]*>.*?</a>', lambda m: f' → {numero(m[1].replace(chr(92), "-"))} ', h)   # «7\25g46b» es 7/25g46b mal tipeado
    h = re.sub(r'<a href="/bestand/literatur/item/([^"]+)"[^>]*>(.*?)</a>',
               lambda m: (t := re.sub(r'<[^>]+>', '', m[2])) + ' → ' + bib.id(m[1], t), h)
    # spans de adentro hacia afuera: el subrayado pasa a __x__, el resto deja solo su texto
    patron = re.compile(r'<span(?: class="([^"]*)")?[^>]*>([^<]*)</span>')
    while (n := patron.sub(lambda m: f'__{m[2].strip()}__' if m[1] in ('underline', 'underline-red') and m[2].strip() else m[2], h)) != h:
        h = n
    h = html.unescape(re.sub(r'<[^>]+>', '', h.replace('</p>', '\n')))
    return '\n'.join(re.sub(r'\s+', ' ', l).strip() for l in h.split('\n') if l.strip())


def letra(t):
    l = t.strip()[:1].lower()
    if l == 'ñ':
        return 'ñ'
    l = unicodedata.normalize('NFD', l)[:1]
    return l if 'a' <= l <= 'z' else '#'


def limpiar(t):   # igual que limpiarNombre en nucleo.js
    t = re.sub(r'[\\/:*?"<>|\t\r\n]', '', t.replace('~~', '').replace('__', ''))
    return re.sub(r'[. ]+$', '', re.sub(r'\s+', ' ', t).strip()[:60])


def guardar(id, titulo, frente, reverso='', carpeta=None):
    nombre = a_archivo(id).replace('/', '-') + (f' {limpiar(titulo)}' if titulo else '') + '.txt'
    txt = 's/f\n' + (f'# {titulo}\n' if titulo else '') + frente + (SEP + reverso if reverso else '') + '\n'
    (carpeta / nombre).write_text(txt, encoding='utf-8')
    return len(frente) > LIM or len(reverso) > LIM


def escribir_indice(carpeta, lineas):
    """Las fichas del índice, una serie por letra: Ia, Ia2, Ia3… (frente y reverso de hasta 700 caracteres)."""
    for viejo in carpeta.glob('I*.txt'):
        if re.fullmatch(r'I[a-zñ#]\d*', viejo.stem):
            viejo.unlink()
    por_letra = {}
    for l in sorted(set(lineas), key=str.casefold):
        por_letra.setdefault(letra(l), []).append(l)
    for l, ls in por_letra.items():
        caras, cara = [], ''
        for x in ls:
            if cara and len(cara) + 1 + len(x) > LIM:
                caras.append(cara); cara = ''
            cara = f'{cara}\n{x}' if cara else x
        caras.append(cara)
        for k in range(0, len(caras), 2):
            guardar(f'I{l}{k // 2 + 1 if k else ""}', '', caras[k], caras[k + 1] if k + 1 < len(caras) else '', carpeta)


def tramos(nodo):
    """Las partes publicadas de un capítulo: si una parte está entera se recorre de una vez, si no se baja a sus hijas."""
    if nodo.get('readyForPublication'):
        yield nodo
    else:
        for h in nodo.get('children', []):
            yield from tramos(h)


def recorrer(nodo, vistas):
    e, pasadas = nodo['start_ekin'], set()
    while e and e not in pasadas and len(pasadas) <= 3 * (nodo.get('numberOfFrontPages') or 0) + 50:   # nunca en círculo
        pasadas.add(e)
        j = ficha(e)
        if not j:
            break
        if e.endswith('_V') and j['ready'] and e not in vistas:
            vistas.add(e)
            yield j
        if nodo['end_ekin'] in (e, j['atras']):
            break
        e = j['next']


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('1', '2'):
        sys.exit('Uso: python luhmann/importar.py 2 9/8   |   2 21   |   2 todo')
    zk, que = sys.argv[1], sys.argv[2]
    raiz = json.loads((DATOS / f'secciones_ZK{"I" * int(zk)}.json').read_text(encoding='utf-8')) \
        if (DATOS / f'secciones_ZK{"I" * int(zk)}.json').exists() else pedir(SECCIONES.format('I' * int(zk)))
    todos = lambda n: [n] + [x for h in n.get('children', []) for x in todos(h)]
    if que == 'todo':
        capitulos = [c for c in raiz['children'] if c.get('n')]   # sin bibliografías ni registros
    else:
        capitulos = [n for n in todos(raiz) if n.get('n') == que][:1] or sys.exit(f'No existe {que} en el ZK {"I" * int(zk)}.')
    caja = AQUI / f'zk{zk}'
    salida = caja / 'de'
    salida.mkdir(parents=True, exist_ok=True)
    bib = Bibliografia(caja / 'bibliografia.json')
    p_ind, p_sec, p_fis = caja / 'indice.json', caja / 'secciones.json', caja / 'fisico.json'
    fisico = json.loads(p_fis.read_text(encoding='utf-8')) if p_fis.exists() else {}   # id → lugar en el mueble («15_52_081»)
    indice = json.loads(p_ind.read_text(encoding='utf-8')) if p_ind.exists() else []
    secciones = json.loads(p_sec.read_text(encoding='utf-8')) if p_sec.exists() else []
    saltadas, largas = [], 0
    for cap in capitulos:
        vistas, total = set(), 0
        for tramo in tramos(cap):
            antes = total
            for j in recorrer(tramo, vistas):
                id = j['shortTitle']
                if not ID.fullmatch(id):   # ponytail: números raros (9/9 (1)) se saltean; habría que mapearlos
                    saltadas.append(f'{id}\t{j["ekin"]}')
                    continue
                if 'lugar' not in j:   # bajada antes de guardar el lugar: se vuelve a pedir una vez
                    j = ficha(j['ekin'], fresca=True)
                if (j['lugar'] or '00').startswith('00'):   # ficha que falta en la caja: el archivo pone un aviso (dummy)
                    fisico.pop(id, None)
                    (salida / (a_archivo(id).replace('/', '-') + '.txt')).unlink(missing_ok=True)
                    continue
                atras = ficha(j['atras']) if j['atras'] else None
                largas += guardar(id, '', a_texto(j['html'], bib), a_texto(atras['html'], bib) if atras else '', salida)
                indice += [f'{sw} → {id}' for sw in j['sw']]
                fisico[id] = j['lugar'] or '99_99_999'
                total += 1
            if total > antes and tramo.get('n') and tramo.get('title'):   # los títulos de sección son las entradas al índice
                indice.append(f'{tramo["title"]} → {tramo["n"]}')
        if total:
            indice.append(f'{cap["title"]} → {cap["n"]}')
            secciones = sorted(set(secciones) | {cap['n']}, key=lambda s: [int(x) if x.isdigit() else x for x in re.findall(r'\d+|\D+', s)])
        print(f'ZK {"I" * int(zk)} {cap["n"]} «{cap.get("title", "")[:50]}»: {total} fichas', flush=True)
        bib.guardar()   # se guarda por capítulo: si se corta, lo hecho queda
        p_ind.write_text(json.dumps(sorted(set(indice)), ensure_ascii=False, indent=0), encoding='utf-8')
        p_sec.write_text(json.dumps(secciones), encoding='utf-8')
        p_fis.write_text(json.dumps(fisico, ensure_ascii=False), encoding='utf-8')
    for clave, (id, cita) in bib.d.items():   # todas, por si una corrida anterior se cortó antes de escribirlas
        guardar(id, cita, f'{cita}\n{WEB}literatur/item/{clave}', '', salida)
    escribir_indice(salida, indice)
    # el mueble de Luhmann: sus cajones (Auszüge) y el orden de las fichas en cada uno (no siempre sigue una regla:
    # en 1/7D las ramas «a» van antes que «1»). La app arma un cajón por cada «# …» y ordena las fichas así.
    lineas, cajon = [], None
    for id in sorted(fisico, key=fisico.get):
        if (c := fisico[id].split('_')[0]) != cajon:
            cajon = c; lineas.append(f'# {int(c)}')
        lineas.append(id)
    (salida / 'orden.txt').write_text('\n'.join(lineas) + '\n', encoding='utf-8')
    if not (salida / 'escritorio.json').exists():   # la mesa es tuya: no se pisa
        (salida / 'escritorio.json').write_text('{}', encoding='utf-8')
    (salida / 'FUENTE.txt').write_text(
        f'Niklas Luhmann, Zettelkasten {"I" * int(zk)} ({"1952-1962" if zk == "1" else "1963-1997"}), fichas sin fecha.\n'
        f'Capítulos y secciones importados: {", ".join(secciones)} (solo lo ya publicado por el archivo).\n'
        f'Transcripción: Niklas Luhmann-Archiv, Universität Bielefeld. Última importación: {datetime.date.today()}.\n'
        'Licencia: CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/\n'
        'Adaptado al formato de esta app: subrayado como __x__, referencias como → número, sin escaneos.\n'
        f'Cada ficha en el archivo: {WEB}zettelkasten/zettel/ZK_{zk}_NB_<número con - en vez de / y ,>_V\n', encoding='utf-8')
    if saltadas:
        (caja / 'saltadas.txt').write_text('\n'.join(saltadas) + '\n', encoding='utf-8')
    print(f'Listo → {salida}. {len(bib.nuevas)} bibliográficas nuevas, {largas} fichas de más de {LIM} caracteres'
          + (f', {len(saltadas)} salteadas (ver saltadas.txt)' if saltadas else ''))


if __name__ == '__main__':
    main()
