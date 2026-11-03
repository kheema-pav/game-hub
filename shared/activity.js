/* Shared public game history. Presentation only; never changes a game's moves. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HubActivity = api;
})(typeof window === 'undefined' ? null : window, function (win) {
  'use strict';
  var histories = {}, positions = {}, dialog, selected = null, previousFocus, pointer = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Include the latest completed group and the in-progress group, so a new turn never empties the log.
  function recent(entries, current) {
    var groups = entries.map(function (e) { return e.group; }).filter(Number.isFinite);
    var completed = groups.filter(function (g) { return g < current; });
    var cutoff = completed.length ? Math.max.apply(null, completed) : current;
    return entries.filter(function (e) { return Number.isFinite(e.group) ? e.group >= cutoff : !groups.length; });
  }
  function lines(entries) {
    return entries.map(function (e) { return '<li>' + (e.label ? '<small>' + esc(e.label) + '</small>' : '') + (e.html || esc(e.text)) + '</li>'; }).join('') || '<li>No moves yet.</li>';
  }
  function remember(id, el) { positions[id] = { top: el.scrollTop, bottom: el.scrollHeight - el.scrollTop - el.clientHeight < 16 }; }
  function scrollToSaved(id, el) { var p = positions[id]; el.scrollTop = !p || p.bottom ? el.scrollHeight : p.top; }
  function html(id, entries, current, unit) {
    histories[id] = { entries: entries, current: current, unit: unit || 'Turn' };
    if (selected === id && dialog && dialog.open) updateDialog();
    return '<section class="ha-preview" aria-label="Game log"><button type="button" class="ha-heading" data-ha-open="' + esc(id) + '"><strong>Game log</strong><span>Full history ↗</span></button><div class="ha-recent" data-ha-scroll="' + esc(id) + '" data-ha-open="' + esc(id) + '" tabindex="0" aria-label="Recent game log. Scroll to read; press Enter for full history."><ol>' + lines(recent(entries, current)) + '</ol></div></section>';
  }
  function sync() { if (win) win.document.querySelectorAll('[data-ha-scroll]').forEach(function (el) { scrollToSaved(el.dataset.haScroll, el); }); }
  function mount(el, id, entries, current, unit) {
    if (!el) return;
    var old = el.querySelector('[data-ha-scroll]'); if (old) remember(id, old);
    el.innerHTML = html(id, entries, current, unit); sync();
  }
  function updateDialog() {
    var data = histories[selected], list = dialog.querySelector('.ha-full');
    if (!data) return;
    var bottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24, top = list.scrollTop;
    list.innerHTML = '<ol>' + lines(data.entries) + '</ol>';
    list.scrollTop = bottom ? list.scrollHeight : top;
    dialog.querySelector('.ha-count').textContent = data.entries.length + ' events · oldest first';
  }
  function open(id) {
    if (!win || !histories[id]) return;
    if (!dialog) {
      dialog = win.document.createElement('dialog'); dialog.className = 'ha-dialog';
      dialog.setAttribute('aria-labelledby', 'ha-title');
      dialog.innerHTML = '<header><div><h2 id="ha-title">Full game log</h2><p class="ha-count"></p></div><button type="button" data-ha-close aria-label="Close game log">Close</button></header><div class="ha-full" tabindex="0" aria-label="Full game history"></div><footer><button type="button" data-ha-latest>Jump to latest</button></footer>';
      win.document.body.appendChild(dialog);
      dialog.addEventListener('close', function () {
        var target = previousFocus && previousFocus.isConnected ? previousFocus : Array.from(win.document.querySelectorAll('.ha-heading')).find(function (el) { return el.dataset.haOpen === selected; });
        selected = null; if (target) target.focus({ preventScroll: true });
      });
      dialog.addEventListener('click', function (e) {
        if (e.target === dialog || e.target.closest('[data-ha-close]')) dialog.close();
        if (e.target.closest('[data-ha-latest]')) { var list = dialog.querySelector('.ha-full'); list.scrollTop = list.scrollHeight; }
      });
    }
    if (!dialog.open) previousFocus = win.document.activeElement;
    selected = id; updateDialog();
    if (!dialog.open) dialog.showModal();
    var list = dialog.querySelector('.ha-full'); list.scrollTop = list.scrollHeight;
  }
  if (win) {
    win.document.addEventListener('scroll', function (e) { var el = e.target; if (el.dataset && el.dataset.haScroll) remember(el.dataset.haScroll, el); }, true);
    win.document.addEventListener('pointerdown', function (e) { pointer = { x: e.clientX, y: e.clientY, moved: false }; }, true);
    win.document.addEventListener('pointermove', function (e) { if (pointer && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 8) pointer.moved = true; }, true);
    win.document.addEventListener('click', function (e) { var el = e.target.closest('[data-ha-open]'); if (el && (e.detail === 0 || !(pointer && pointer.moved))) { e.stopPropagation(); open(el.dataset.haOpen); } pointer = null; });
    win.document.addEventListener('keydown', function (e) {
      if (dialog && dialog.open) { e.stopImmediatePropagation(); return; }
      if (e.key === 'Enter' && e.target.dataset && e.target.dataset.haOpen) { e.preventDefault(); open(e.target.dataset.haOpen); }
    }, true);
  }
  return { recent: recent, html: html, mount: mount, sync: sync, open: open };
});
