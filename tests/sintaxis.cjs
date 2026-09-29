const fs = require('node:fs'), vm = require('node:vm');
for (const archivo of ['index.html', '2d.html']) {
  const html = fs.readFileSync(archivo, 'utf8');
  for (const [, tipo, codigo] of html.matchAll(/<script(?:\s+type="(module)")?>([\s\S]*?)<\/script>/g)) {
    if (tipo) new vm.SourceTextModule(codigo, {identifier: archivo});
    else new vm.Script(codigo, {filename: archivo});
  }
}
console.log('✓ sintaxis de scripts en index.html y 2d.html');
