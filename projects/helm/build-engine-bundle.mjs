// Build a classic (non-module) engine bundle for Helm so it runs from file://
// without dynamic ES-module imports (which browsers block on file://).
// Wraps each source module in a tiny CommonJS-style loader to preserve scope.
import { readFileSync, writeFileSync } from 'node:fs';

const ORDER = ['./windrose.js', './demoProjects.js', './engine.js', './briefParser.js', './portfolio.js'];
const DIR = new URL('./engine/', import.meta.url);

function transform(src) {
  const exportedNames = new Set();
  const lines = src.split('\n');
  const out = [];
  for (let line of lines) {
    // import { a, b } from './x.js';  ->  const { a, b } = require('./x.js');
    let m = line.match(/^\s*import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (m) { out.push(`const {${m[1]}} = require('${m[2]}');`); continue; }
    // import Default from './x.js';
    m = line.match(/^\s*import\s+([A-Za-z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (m) { out.push(`const ${m[1]} = (require('${m[2]}').default ?? require('${m[2]}'));`); continue; }
    // side-effect import './x.js';
    m = line.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (m) { out.push(`require('${m[1]}');`); continue; }
    // export { a, b, c };  (record + strip)
    m = line.match(/^\s*export\s+\{([^}]*)\}\s*;?\s*$/);
    if (m) { m[1].split(',').forEach(n => { const nm = n.trim().split(/\s+as\s+/).pop().trim(); if (nm) exportedNames.add(nm); }); continue; }
    // export function/const/let/var/class NAME
    m = line.match(/^(\s*)export\s+(default\s+)?(function|const|let|var|class)\s+([A-Za-z0-9_$]+)/);
    if (m) { exportedNames.add(m[4]); out.push(line.replace(/^(\s*)export\s+(default\s+)?/, '$1')); continue; }
    out.push(line);
  }
  let body = out.join('\n');
  for (const n of exportedNames) body += `\nexports[${JSON.stringify(n)}] = ${n};`;
  return body;
}

let bundle = `/* Helm engine bundle - GENERATED for offline file:// use. Do not edit by hand. */
(function(){
  var __mods = {};
  function require(name){
    if (__mods[name] && __mods[name].__loaded) return __mods[name].exports;
    throw new Error('helm engine bundle: module not loaded: ' + name);
  }
  function define(name, factory){
    var m = { exports: {}, __loaded: false };
    __mods[name] = m;
    factory(m, m.exports, require);
    m.__loaded = true;
  }
`;
for (const name of ORDER) {
  const src = readFileSync(new URL(name, DIR), 'utf8');
  bundle += `\n  define(${JSON.stringify(name)}, function(module, exports, require){\n`;
  bundle += transform(src).split('\n').map(l => '    ' + l).join('\n');
  bundle += `\n  });\n`;
}
bundle += `
  var api = {};
  Object.assign(api, __mods['./portfolio.js'].exports, __mods['./briefParser.js'].exports);
  window.HelmEngine = api;
})();
`;
writeFileSync(new URL('./engine-bundle.js', import.meta.url), bundle);
console.log('wrote engine-bundle.js (' + bundle.length + ' bytes)');
