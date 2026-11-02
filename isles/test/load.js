'use strict';
/* Load the same standalone engine shipped to browsers. */
const fs = require('fs');
const path = require('path');
const ENGINE = path.join(__dirname, '..', 'engine.js');
function engineSource() { return fs.readFileSync(ENGINE, 'utf8'); }
function loadEngine() { return new Function(engineSource() + '\nreturn Engine;')(); }
module.exports = { loadEngine, engineSource };
