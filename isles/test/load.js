'use strict';
/* Loads the Engine IIFE straight out of ../index.html so the tests exercise the shipped code. */
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'index.html');

function engineSource() {
  const html = fs.readFileSync(HTML, 'utf8');
  const start = html.indexOf('const Engine = (() => {');
  if (start < 0) throw new Error('Engine not found in isles/index.html');
  const end = html.indexOf('\n})();', start);
  if (end < 0) throw new Error('Engine end not found');
  return html.slice(start, end + '\n})();'.length);
}
function loadEngine() { return new Function(engineSource() + '\nreturn Engine;')(); }

module.exports = { loadEngine, engineSource };
