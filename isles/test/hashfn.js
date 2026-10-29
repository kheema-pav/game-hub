'use strict';
/* Self-contained (no closures over module scope) so the same source can run in Node and in a browser page. */
function boardHash(board) {
  const q = (k, v) => (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 1e6) / 1e6 : v;
  const str = JSON.stringify(board, q);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ c, 2246822519) + i) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + str.length;
}
module.exports = { boardHash };
