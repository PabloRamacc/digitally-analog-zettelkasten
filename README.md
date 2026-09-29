# Digitally Analog Zettelkasten

[Español](README.es.md)

A Luhmann-style card box: each card is a plain UTF-8 `.txt` file in a folder you choose. Open the desk in 3D, or switch to the 2D view for writing.

**[Try the live demo](https://pabloramacc.github.io/digitally-analog-zettelkasten/)** — it includes the example box and the Zettelkasten II transcriptions in German and English.

## Use it

Download the project and open `index.html` in a current desktop version of Chrome, Edge, Brave, or Opera. Select **Open box…** and choose a folder. The app reads and writes ordinary text files in that folder; it does not require a build step or account.

The browser's directory picker is required to open your own folder. Browsers without that API can still use the built-in example and the online demo. Browser support changes over time; see [MDN's compatibility table](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility).

The app starts in 3D. Use the **2D** button to switch views; the open box follows you. The example and online demo keep temporary changes in browser storage for the current tab. **Reset example/demo** starts that temporary box over.

The `.txt` files can also be opened and edited in any text editor. On macOS, use a browser that supports folder access to edit a whole box; Safari and Firefox can open the example and the online demo.

## Card format

Each card is a UTF-8 text file. The file name starts with its Zettelkasten number; a title may follow. A card can look like this:

```text
2024-03-02 10:15
# The box as a conversation partner
A Zettelkasten is not an archive. It is a conversation partner. → 1a
=== reverso ===
The reverse side can hold another thought.
```

`→ 1a` links to another card. `~~text~~` crosses text out and `__text__` underlines it. The app also supports Luhmann-style branching numbers, an index, drawers, a trash, and a desk where cards can be arranged before turning them into a Markdown draft. In the 3D view, a hand can hold up to ten cards.

## Luhmann Zettelkasten II

The included boxes contain the portions published by the Niklas Luhmann-Archiv for chapters 1, 7, 9, 9/8, 21, and 536. German is the archive transcription; English is an automatic translation from German made with DeepL and Ollama (`qwen3.5:9b`), without human review. The import and translation scripts are in `luhmann/`.

The archive material and its translation are **CC BY-NC-SA 4.0**, with separate attribution and license details in [`luhmann/LICENSE.md`](luhmann/LICENSE.md). They are not covered by the CC0 license below.

## Model and licenses

The app, 3D model, textures, and example box are dedicated to the public domain under **CC0 1.0**; see [`LICENSE`](LICENSE). Three.js is included in `vendor/` under its MIT license.

The Blender model source is `modelos/escritorio_03.blend`; the exported model is embedded in `modelos/escritorio.glb.js`.
