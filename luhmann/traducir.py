# Traduce un capítulo o sección de la caja luhmann/zkN/de al inglés (zkN/en) y al castellano (zkN/es).
# Uso:  python luhmann/traducir.py 2 9/8                una sección, a los dos idiomas, con DeepL
#       python luhmann/traducir.py 2 21 en             un capítulo, solo al inglés
#       python luhmann/traducir.py 2 21 en ollama      con una IA local (Ollama, qwen3.5:9b), sin cupo
#       python luhmann/traducir.py 2 21 en ollama modelo=aya-expanse:8b
#       python luhmann/traducir.py 2 todo en           todo lo importado
#       python luhmann/traducir.py 2 21 en prueba      solo dice cuánto cupo de DeepL haría falta, sin traducir
# DeepL: clave en la variable DEEPL_API_KEY o en luhmann/.clave-deepl (no se sube a GitHub).
# Lo ya traducido queda en luhmann/datos/traduccion-zkN-xx.json (DeepL) y …-xx-ollama.json: no se traduce dos veces,
# y una ficha que ya tradujo DeepL no la vuelve a traducir Ollama.
#
# DeepL: se traducen los tramos entre enlaces, así cada «→ 9/8,1» queda donde Luhmann lo puso; cada tramo va con la ficha
# entera como contexto (no se cobra), para que «er» siga siendo la ficha. El subrayado viaja como <u>. Un glosario fija
# los términos de la caja.
# Ollama: la ficha va entera, con la instrucción de no tocar enlaces, subrayados ni renglones. Si en la respuesta falta un
# enlace o cambian los renglones, se reintenta; si vuelve a fallar, se traduce por tramos, como con DeepL.
import collections, html, json, os, pathlib, re, shutil, sys, urllib.request
from importar import DATOS, ID, SEP, escribir_indice, guardar

AQUI = pathlib.Path(__file__).parent
IDIOMAS = {'en': ('EN-US', 'inglés', 'English'), 'es': ('ES', 'castellano', 'Spanish')}
GLOSARIO = {'en': {'Zettelkasten': 'Zettelkasten', 'Zettel': 'card'},
            'es': {'Zettelkasten': 'Zettelkasten', 'Zettel': 'ficha'}}
ENLACE = re.compile(rf'(?:→|->)\s*{ID.pattern}')
TRAMOS = re.compile(rf'((?:→|->)\s*{ID.pattern})')
OLLAMA = 'http://localhost:11434/api/chat'
INSTRUCCIONES = """You translate cards from Niklas Luhmann's Zettelkasten (card index) from German into {lengua}.
Rules:
- Output only the translation, with no comments, quotes or explanations.
- Keep exactly the same line breaks: one output line for each input line.
- References to other cards appear as {{1}}, {{2}}, {{3}}…: keep each one exactly once, in the matching place in the
  sentence. Never add one that is not in the input.
- Underlined words are marked in bold, **like this**: keep the ** markers around the translated words.
- Leave the word "Zettelkasten" untranslated. Translate "Zettel" as "{zettel}".
- Keep abbreviations, names, book titles and quotations in other languages as they are."""


def clave():
    k = os.environ.get('DEEPL_API_KEY') or (AQUI / '.clave-deepl').exists() and (AQUI / '.clave-deepl').read_text().strip()
    if not k:
        sys.exit('Falta la clave de DeepL: DEEPL_API_KEY o luhmann/.clave-deepl')
    return k


a_xml = lambda t: re.sub(r'__(.+?)__', r'<u>\1</u>', html.escape(t, quote=False))
de_xml = lambda t: html.unescape(re.sub(r'<u>(.*?)</u>', r'__\1__', t))
piezas = lambda t: [TRAMOS.split(r) for r in t.split('\n')]
a_pedir = lambda ps: {p.strip() for renglon in ps for p in renglon if not TRAMOS.fullmatch(p) and re.search(r'[^\W\d_]', p)}


def armar(ps, T):
    """Vuelve a juntar los renglones con los tramos traducidos; los enlaces y los espacios quedan como estaban."""
    return '\n'.join(re.sub(r' {2,}', ' ', ''.join(
        p if p.strip() not in T else p[:len(p) - len(p.lstrip())] + T[p.strip()] + p[len(p.rstrip()):] for p in r)) for r in ps)


def pedir_deepl(trad, textos, codigo, glosario, T, contexto=None):
    faltan = sorted(textos - T.keys())
    for i in range(0, len(faltan), 50):   # DeepL acepta hasta 50 textos por pedido
        hechos = trad.translate_text([a_xml(p) for p in faltan[i:i + 50]], source_lang='DE', target_lang=codigo,
                                     context=contexto, tag_handling='xml', glossary=glosario)
        T.update(zip(faltan[i:i + 50], (de_xml(h.text) for h in hechos)))


class Ollama:
    def __init__(self, idioma, modelo, cache):
        self.modelo, self.cache, self.F = modelo, cache, json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
        self.sistema = INSTRUCCIONES.format(lengua=IDIOMAS[idioma][2], zettel=GLOSARIO[idioma]['Zettel'])

    def pedir(self, texto, temperatura=0):
        cuerpo = {'model': self.modelo, 'stream': False, 'keep_alive': '30m', 'think': False,
                  'options': {'temperature': temperatura, 'num_ctx': 4096},
                  'messages': [{'role': 'system', 'content': self.sistema}, {'role': 'user', 'content': texto}]}
        pedido = urllib.request.Request(OLLAMA, json.dumps(cuerpo).encode(), {'Content-Type': 'application/json'})
        with urllib.request.urlopen(pedido, timeout=900) as r:
            out = json.loads(r.read())['message']['content']
        out = '\n'.join(l.rstrip() for l in re.sub(r'<think>.*?</think>', '', out, flags=re.S).split('\n'))
        return out.strip().strip('"«»“”')

    @staticmethod
    def intacta(orig, trad):   # los mismos enlaces, los mismos renglones, los mismos subrayados
        ids = lambda t: collections.Counter(re.sub(r'^(?:→|->)\s*', '', m) for m in ENLACE.findall(t))
        return (ids(orig) == ids(trad)
                and orig.count('\n') == trad.count('\n') and orig.count('__') == trad.count('__'))

    def traducir(self, texto, temperatura=0):
        """Los enlaces viajan como {1}, {2}… y el subrayado como **negrita**, formatos que un modelo de lenguaje respeta."""
        enlaces = ENLACE.findall(texto)
        n = iter(range(1, len(enlaces) + 1))
        ida = re.sub(r'__(.+?)__', r'**\1**', ENLACE.sub(lambda m: '{%d}' % next(n), texto))
        vuelta = self.pedir(ida, temperatura)
        vuelta = re.sub(r'\{(\d+)\}', lambda m: enlaces[int(m[1]) - 1] if 0 < int(m[1]) <= len(enlaces) else m[0], vuelta)
        return vuelta.replace('**', '__')

    def campo(self, texto):
        if not re.search(r'[^\W\d_]', texto):
            return texto
        if texto in self.F:
            return self.F[texto]
        intentos = [self.traducir(texto, temp) for temp in (0,)]
        if not self.intacta(texto, intentos[0]):
            intentos.append(self.traducir(texto, .4))
        # la mejor: intacta; si no, una con los enlaces y renglones bien aunque haya perdido el subrayado
        t = next((t for t in intentos if self.intacta(texto, t)), None) \
            or next((t for t in intentos if self.intacta(texto.replace('__', ''), t.replace('__', ''))), None)
        if t is None:   # dos veces rota: renglón por renglón (cada renglón conserva su contexto)
            renglones = [next((r for temp in (0, .4) if self.intacta(l, r := self.traducir(l, temp))), None) for l in texto.split('\n')]
            if None in renglones:   # último recurso: por tramos entre enlaces, sin subrayado
                ps = piezas(texto.replace('__', ''))
                t = armar(ps, {p: ENLACE.sub('', self.pedir(p)).strip() for p in a_pedir(ps)})
                print(f'  aviso: «{texto[:40]}…» se tradujo por tramos')
            else:
                t = '\n'.join(renglones)
        self.F[texto] = t
        return t

    def guardar(self):
        self.cache.write_text(json.dumps(self.F, ensure_ascii=False), encoding='utf-8')


def leer(p):
    lineas = p.read_text(encoding='utf-8').rstrip('\n').split('\n')
    titulo = lineas.pop(1)[2:] if len(lineas) > 1 and lineas[1].startswith('# ') else ''
    frente, _, reverso = '\n'.join(lineas[1:]).partition(SEP)
    return titulo, frente, reverso


def main():
    if len(sys.argv) < 3:
        sys.exit('Uso: python luhmann/traducir.py 2 21 [en|es] [ollama [modelo=…]] [prueba]   (o una sección: 2 9/8, o todo)')
    zk, que, *resto = sys.argv[1:]
    prueba, local = 'prueba' in resto, 'ollama' in resto
    modelo = next((r.split('=', 1)[1] for r in resto if r.startswith('modelo=')), 'qwen3.5:9b')
    idiomas = {c: IDIOMAS[c] for c in ([r for r in resto if r in IDIOMAS] or IDIOMAS)}
    caja = AQUI / f'zk{zk}'
    fichas = {p.stem.split(' ')[0].replace('^', '').replace('-', '/'): (p, *leer(p)) for p in (caja / 'de').glob('*.txt') if p.name != 'FUENTE.txt'}
    # el capítulo 21 son 21, 21/…, 21a…; la sección 9/8 son 9/8, 9/8,1, 9/8a… (pero no 9/80)
    elegidas = sorted(id for id in fichas if id[0] not in 'BI' and (que == 'todo' or re.match(re.escape(que) + r'(?!\d)', id)))
    if not elegidas:
        sys.exit(f'No hay fichas de {que} en {caja / "de"}. ¿Ya corriste importar.py {zk} {que}?')
    indice = [r for id, (p, t, f, v) in fichas.items() if id[0] == 'I' for r in (f + '\n' + v).split('\n') if r.strip()]
    caches = {c: DATOS / f'traduccion-zk{zk}-{c}.json' for c in idiomas}
    Ts = {c: json.loads(p.read_text(encoding='utf-8')) if p.exists() else {} for c, p in caches.items()}
    falta = sum(len(x) for c in idiomas for id in elegidas for x in a_pedir(piezas('\n'.join(fichas[id][1:]))) - Ts[c].keys())
    if local:
        print(f'{que} ({", ".join(idiomas)}): {len(elegidas)} fichas, con Ollama ({modelo}); ~{falta:,} caracteres sin traducir')
        trad = None
    else:
        import deepl
        trad = deepl.Translator(clave())
        uso = trad.get_usage().character
        print(f'{que} ({", ".join(idiomas)}): {len(elegidas)} fichas, faltan traducir ~{falta:,} caracteres; '
              f'DeepL este mes: {uso.count:,} de {uso.limit:,}')
        if not prueba and uso.count + falta > uso.limit:
            sys.exit('No alcanza el cupo de este mes. Probá con una sección más chica, esperá al mes que viene o usá «ollama».')
    if prueba:
        return
    for c, (codigo, nombre, _) in idiomas.items():
        salida, T = caja / c, Ts[c]
        salida.mkdir(exist_ok=True)
        ol = Ollama(c, modelo, DATOS / f'traduccion-zk{zk}-{c}-ollama.json') if local else None
        glosario = None if local else trad.create_glossary(f'zettelkasten-{c}', source_lang='DE', target_lang=codigo, entries=GLOSARIO[c])
        try:
            for k, id in enumerate(elegidas):
                p, t, f, v = fichas[id]
                ps = [piezas(x) for x in (t, f, v)]
                faltan = set().union(*map(a_pedir, ps)) - T.keys()
                if local and faltan:   # lo que ya tradujo DeepL se respeta; lo demás, Ollama con la ficha entera
                    t2, f2, v2 = (ol.campo(x) for x in (t, f, v))
                else:
                    if faltan:   # con tag_handling el contexto también es XML: va escapado
                        pedir_deepl(trad, faltan, codigo, glosario, T, html.escape(re.sub(r'__|→\s*\S+', '', f'{t} {f} {v}'), quote=False))
                    t2, f2, v2 = (armar(x, T) for x in ps)
                if len(ENLACE.findall(f + v)) != len(ENLACE.findall(f2 + v2)):
                    print(f'  aviso ({c}): se perdió un enlace en {id}')
                guardar(id, t2, f2, v2, salida)
                if k % 20 == 19:   # si se corta, lo traducido no se pierde
                    caches[c].write_text(json.dumps(T, ensure_ascii=False), encoding='utf-8')
                    ol and ol.guardar()
            # el índice: solo las entradas que llevan a fichas ya traducidas (las otras serían enlaces rotos)
            hay = {q.stem.split(' ')[0].replace('^', '').replace('-', '/') for q in salida.glob('*.txt')}
            lineas = [r for r in indice if (m := ENLACE.search(r)) and m[0].split()[-1].lstrip('→>-') in hay]
            ps = [piezas(r) for r in lineas]
            faltan = set().union(set(), *map(a_pedir, ps)) - T.keys()
            if local:
                escribir_indice(salida, [armar(x, T) if not (a_pedir(x) - T.keys()) else ol.campo(r) for r, x in zip(lineas, ps)])
            else:
                pedir_deepl(trad, faltan, codigo, glosario, T)
                escribir_indice(salida, [armar(x, T) for x in ps])
        finally:
            glosario and trad.delete_glossary(glosario)
            caches[c].write_text(json.dumps(T, ensure_ascii=False), encoding='utf-8')
            ol and ol.guardar()
        shutil.copy(caja / 'de' / 'orden.txt', salida / 'orden.txt')
        for id, (p, *_) in fichas.items():   # las citas quedan en su idioma
            if id[0] == 'B':
                shutil.copy(p, salida / p.name)
        if not (salida / 'escritorio.json').exists():
            (salida / 'escritorio.json').write_text('{}', encoding='utf-8')
        (salida / 'FUENTE.txt').write_text((caja / 'de' / 'FUENTE.txt').read_text(encoding='utf-8').replace(
            'Adaptado al formato', f'Traducción automática del alemán al {nombre} con DeepL y con una IA local (Ollama, '
            'qwen3.5:9b), sin revisión humana; por capítulo; misma licencia.\nLas fichas de capítulos todavía sin traducir no están en esta caja.\n'
            'Adaptado al formato'), encoding='utf-8')
        print(f'  {c}: {len(elegidas)} fichas → {salida}')
    if trad:
        uso = trad.get_usage().character
        print(f'DeepL este mes: {uso.count:,} de {uso.limit:,} caracteres')


if __name__ == '__main__':
    main()
