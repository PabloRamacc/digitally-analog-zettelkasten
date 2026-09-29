# Zettelkasten digital y analógico

[English](README.md)

Una caja de fichas al estilo Luhmann: cada ficha es un archivo `.txt` UTF-8 en una carpeta que elegís vos. Abrí el escritorio en 3D o pasá a la vista 2D para escribir.

**[Probá la demo online](https://pabloramacc.github.io/digitally-analog-zettelkasten/)**: incluye la caja de ejemplo y las transcripciones del Zettelkasten II en alemán e inglés.

## Cómo usarlo

Descargá el proyecto y abrí `index.html` en una versión actual de escritorio de Chrome, Edge, Brave u Opera. Elegí **Abrir caja…** y seleccioná una carpeta. La app lee y escribe archivos de texto comunes; no necesita compilarse ni crear una cuenta.

Para abrir carpetas hace falta que el navegador tenga selector de directorios. Los navegadores sin esa API pueden usar el ejemplo incluido y la demo online. La compatibilidad puede cambiar; consultá la [tabla de compatibilidad de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility).

La app arranca en 3D. El botón **2D** cambia de vista sin cerrar la caja. El ejemplo y las demos guardan cambios temporales en el almacenamiento del navegador, por pestaña. **Reiniciar ejemplo/demo** vuelve a empezar esa caja temporal.

También podés abrir y editar los `.txt` con cualquier editor de texto. En macOS, usá un navegador compatible para trabajar con una carpeta; Safari y Firefox pueden abrir el ejemplo y la demo online.

## Formato de ficha

Cada ficha es un archivo de texto UTF-8. El nombre empieza con el número de la ficha y puede incluir el título. Por ejemplo:

```text
2024-03-02 10:15
# La caja como interlocutora
El Zettelkasten no es un archivo: es un compañero de comunicación. → 1a
=== reverso ===
El reverso puede guardar otra idea.
```

`→ 1a` enlaza con otra ficha. `~~texto~~` lo tacha y `__texto__` lo subraya. La app también admite numeración ramificada al estilo Luhmann, índice, cajones, papelera y un escritorio donde ordenar fichas antes de armar un borrador Markdown. En 3D, la mano puede llevar hasta diez fichas.

## Zettelkasten II de Luhmann

Las cajas incluidas contienen lo publicado por el Niklas Luhmann-Archiv de los capítulos 1, 7, 9, 9/8, 21 y 536. El alemán es la transcripción del archivo. El inglés es una traducción automática desde el alemán hecha con DeepL y Ollama (`qwen3.5:9b`), sin revisión humana. Los scripts de importación y traducción están en `luhmann/`.

El material del archivo y su traducción tienen licencia **CC BY-NC-SA 4.0**, con atribución y licencia separadas en [`luhmann/LICENSE.md`](luhmann/LICENSE.md). No están cubiertos por CC0.

## Modelo y licencias

La app, el modelo 3D, las texturas y la caja de ejemplo se dedican al dominio público bajo **CC0 1.0**; ver [`LICENSE`](LICENSE). Three.js está incluido en `vendor/` bajo su licencia MIT.

La fuente del modelo de Blender es `modelos/escritorio_03.blend`; el modelo exportado está embebido en `modelos/escritorio.glb.js`.
