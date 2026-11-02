/* Shared online room controls. Receives existing game snapshots; never opens a second room watcher. */
(function () {
  'use strict';
  if (window.HubSession) return;
  var sequence = 0;
  var STALE_MS = 150000;
  var CSS = [
    '.hs-root{font:400 15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#18212d;--hs-bg:#fff;--hs-line:#d6dbe3;--hs-muted:#566173;--hs-button:#edf0f5}',
    '@media(prefers-color-scheme:dark){.hs-root{color:#eef1f6;--hs-bg:#1a2030;--hs-line:#414b60;--hs-muted:#b5becc;--hs-button:#2c3548}}',
    ':root[data-theme="light"] .hs-root{color:#18212d;--hs-bg:#fff;--hs-line:#d6dbe3;--hs-muted:#566173;--hs-button:#edf0f5}',
    ':root[data-theme="dark"] .hs-root{color:#eef1f6;--hs-bg:#1a2030;--hs-line:#414b60;--hs-muted:#b5becc;--hs-button:#2c3548}',
    '.hs-root *{box-sizing:border-box}.hs-root [hidden]{display:none!important}',
    '.hs-root button{font:inherit;font-weight:650;color:inherit;cursor:pointer;border:1px solid var(--hs-line);border-radius:12px;background:var(--hs-button);padding:10px 14px;min-height:44px;touch-action:manipulation}',
    '.hs-root button:disabled{opacity:.55;cursor:wait}.hs-root button:focus-visible,.hs-root [tabindex]:focus-visible{outline:3px solid #d6a52c;outline-offset:3px}',
    '.hs-launch{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:12px;z-index:4700;box-shadow:0 2px 8px #0002;font-size:13px!important;min-height:36px!important;padding:6px 12px!important}',
    '.hs-layer{position:fixed;inset:0;background:#0009;z-index:6100;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;overscroll-behavior:contain}',
    '.hs-panel{background:var(--hs-bg);border:1px solid var(--hs-line);border-radius:20px;padding:20px;width:100%;max-width:460px;max-height:calc(100dvh - 32px);overflow:auto;box-shadow:0 12px 44px #0006}',
    '.hs-panel h2{font:750 22px/1.2 ui-sans-serif,system-ui,sans-serif;margin:0 0 10px;color:inherit}.hs-panel p{margin:10px 0}.hs-muted{color:var(--hs-muted)}',
    '.hs-code{font:750 26px/1.2 ui-monospace,monospace;letter-spacing:.08em}.hs-players{padding:0;list-style:none;margin:14px 0}.hs-players li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--hs-line)}',
    '.hs-name{overflow-wrap:anywhere;min-width:0}.hs-status{flex-shrink:0;color:var(--hs-muted)}.hs-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.hs-actions button{flex:1 1 170px}.hs-root button.hs-danger{border-color:#b64b4b}.hs-error{color:#b43333}',
    '@media(prefers-color-scheme:dark){.hs-error{color:#ffb0a8}}:root[data-theme="dark"] .hs-error{color:#ffb0a8}'
  ].join('\n');

  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function label(code) { return code.slice(0, 3) + ' ' + code.slice(3); }
  function timestamp(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return 0;
  }
  function presenceLabel(entry, now) {
    if (!entry || !timestamp(entry.at)) return 'Unknown';
    if (entry.state === 'away') return 'Away';
    var age = now - timestamp(entry.at);
    return age >= 0 && age <= STALE_MS ? 'Here recently' : 'Not seen recently';
  }
  function errorText(error) {
    var code = error && error.code;
    if (code === 'denied' || code === 'permission-denied' || code === 'rules-update') {
      return 'The game server needs its room rules updated for this feature. Ask the host to update Firestore rules, then try again.';
    }
    if (code === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'You are offline. Reconnect and try again.';
    return error && error.message ? String(error.message).slice(0, 240) : 'Could not reach the game server. Try again.';
  }

  function mount(options) {
    options = options || {};
    var code = String(options.code || '').replace(/\D/g, '');
    if (!/^[1-9]\d{5}$/.test(code)) return { update: function () { return false; }, close: function () {} };
    var id = 'hs-title-' + (++sequence);
    var root = node('div', 'hs-root');
    var launch = node('button', 'hs-launch', 'Room ' + label(code));
    launch.type = 'button'; launch.setAttribute('aria-haspopup', 'dialog'); launch.setAttribute('aria-expanded', 'false');
    var layer = node('div', 'hs-layer'); layer.hidden = true;
    var panel = node('section', 'hs-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', id);
    layer.appendChild(panel); root.appendChild(launch); root.appendChild(layer);
    if (!document.getElementById('hs-style')) { var style = node('style'); style.id = 'hs-style'; style.textContent = CSS; document.head.appendChild(style); }
    document.body.appendChild(root);
    var snap = {}, room = null, blocked = '', terminal = false, opened = false, busy = false, closed = false, confirmation = '', message = '', presenceError = null;
    var stopPresence = null, previousFocus = null, inerted = [];

    function uid() { return window.HubOnline && HubOnline.uid; }
    function seated() { return !!(room && room.seats && room.seats[uid()]); }
    function host() { return !!(room && room.host === uid()); }
    function terminalStatus(r) { return !!(r && (r.status === 'cancelled' || r.status === 'ended')); }
    function presenceOff() { if (stopPresence) { try { stopPresence(); } catch (e) {} stopPresence = null; } }
    function presenceOn() {
      if (stopPresence || blocked || terminal || !seated() || !window.HubOnline || !HubOnline.rooms.trackPresence) return;
      try {
        stopPresence = HubOnline.rooms.trackPresence(code, function (error) { if (!closed) { presenceError = error; if (opened) render(); } });
      } catch (e) { presenceError = e; }
    }
    function freeze() {
      if (inerted.length) return;
      Array.prototype.forEach.call(document.body.children, function (el) {
        if (el === root || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        inerted.push({ el: el, value: el.inert }); el.inert = true;
      });
    }
    function thaw() { inerted.forEach(function (x) { x.el.inert = x.value; }); inerted = []; }
    function focusPanel() {
      var title = panel.querySelector('h2');
      if (title) title.focus();
    }
    function show() {
      if (closed) return;
      if (!opened) previousFocus = document.activeElement;
      opened = true; layer.hidden = false; launch.setAttribute('aria-expanded', 'true'); freeze(); render(); focusPanel();
    }
    function hide() {
      if (blocked || terminal || busy) return;
      opened = false; confirmation = ''; layer.hidden = true; launch.setAttribute('aria-expanded', 'false'); thaw();
      var target = previousFocus && previousFocus.isConnected ? previousFocus : launch;
      if (target && target.focus) target.focus();
    }
    function button(text, action, danger) {
      var b = node('button', danger ? 'hs-danger' : '', text); b.type = 'button'; b.disabled = busy;
      b.setAttribute('data-hs-action', action);
      b.addEventListener('click', function () { act(action); }); return b;
    }
    function render() {
      if (!opened || closed) return;
      var focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-hs-action');
      panel.textContent = '';
      var title = node('h2', '', blocked ? 'This room cannot be opened' : terminal ? (room.status === 'cancelled' ? 'Game cancelled' : 'Game ended') : 'Online room');
      title.id = id; title.tabIndex = -1; panel.appendChild(title);
      panel.appendChild(node('p', 'hs-code', label(code)));
      if (blocked) panel.appendChild(node('p', '', blocked));
      else if (terminal) panel.appendChild(node('p', '', 'The host closed this game. No more moves can be played. Its existing history has been kept.'));
      else if (!room) panel.appendChild(node('p', 'hs-muted', 'Connecting to the room…'));
      if (!blocked && room && room.seats) {
        var list = node('ul', 'hs-players'); list.setAttribute('aria-label', 'Players');
        Object.keys(room.seats).forEach(function (key) {
          var seat = room.seats[key] || {};
          var row = node('li'); var name = String(seat.name || 'Player') + (key === room.host ? ' (host)' : '') + (key === uid() ? ' (you)' : '');
          row.appendChild(node('span', 'hs-name', name));
          row.appendChild(node('span', 'hs-status', terminal ? 'Game closed' : presenceLabel((snap.presence || {})[key], Date.now()))); list.appendChild(row);
        }); panel.appendChild(list);
        if (!terminal) panel.appendChild(node('p', 'hs-muted', 'Presence is an estimate. A sleeping phone, another tab or a lost connection may delay it. Nobody is automatically skipped.'));
      }
      if (presenceError || snap.presenceError) panel.appendChild(node('p', 'hs-muted', 'Player presence is unavailable. ' + errorText(presenceError || snap.presenceError)));
      if (snap.error) panel.appendChild(node('p', 'hs-muted', errorText(snap.error)));
      if (message) { var err = node('p', 'hs-error', message); err.setAttribute('role', 'alert'); panel.appendChild(err); }
      var actions = node('div', 'hs-actions');
      if (confirmation === 'end') {
        panel.appendChild(node('p', '', room && room.status === 'open' ? 'Cancel this room for everyone? Players will need a new invitation to play.' : 'End this game for everyone? Nobody can continue it afterwards. The existing history will be kept.'));
        actions.appendChild(button(busy ? 'Closing…' : 'Yes, close for everyone', 'confirm-end', true));
        actions.appendChild(button('Keep playing', 'back'));
      } else if (confirmation === 'replace') {
        panel.appendChild(node('p', '', 'Create a fresh room with the same game settings? Share its new code with your friends. Other players will stay here until they choose to join, and this game will not be changed.'));
        actions.appendChild(button(busy ? 'Creating…' : 'Create replacement room', 'confirm-replace'));
        actions.appendChild(button('Go back', 'back'));
      } else {
        if (!blocked && seated()) actions.appendChild(button('Start replacement game', 'replace'));
        if (!blocked && !terminal && host()) actions.appendChild(button(room.status === 'open' ? 'Cancel room for everyone' : 'End game for everyone', 'end', true));
        if (blocked) actions.appendChild(button('Reload app', 'reload'));
        actions.appendChild(button('Back to game setup', 'exit'));
        if (!terminal && !blocked) actions.appendChild(button('Return to game', 'hide'));
      }
      panel.appendChild(actions);
      if (focused) {
        var same = panel.querySelector('[data-hs-action="' + focused + '"]');
        if (same && !same.disabled) same.focus(); else focusPanel();
      }
    }
    function act(action) {
      if (closed || busy) return;
      if (action === 'hide') { hide(); return; }
      if (action === 'back') { confirmation = ''; message = ''; render(); focusPanel(); return; }
      if (action === 'end' || action === 'replace') { confirmation = action; message = ''; render(); focusPanel(); return; }
      if (action === 'reload') { location.reload(); return; }
      if (action === 'exit') { close(); if (typeof options.onExit === 'function') options.onExit(); else location.href = '../'; return; }
      if (action !== 'confirm-end' && action !== 'confirm-replace') return;
      if (!window.HubOnline || !HubOnline.rooms) { message = 'Online room controls are unavailable. Reload and try again.'; render(); return; }
      if (!seated() || (action === 'confirm-end' && !host())) { message = 'You do not have permission to do that.'; render(); return; }
      busy = true; message = ''; render();
      Promise.resolve().then(function () {
        return action === 'confirm-end' ? HubOnline.rooms.end(code) : HubOnline.rooms.replacement(code);
      }).then(function (result) {
        if (closed) return;
        busy = false; confirmation = '';
        if (action === 'confirm-replace') {
          var next = result && String(result.code || '');
          if (!/^[1-9]\d{5}$/.test(next)) throw new Error('The server did not return a new room code. Try again.');
          close();
          if (typeof options.onRestart === 'function') options.onRestart(next);
          else location.href = location.pathname + '?room=' + next;
        } else {
          room = Object.assign({}, room, { status: result && result.status || (room.status === 'open' ? 'cancelled' : 'ended') });
          terminal = true; presenceOff(); show();
        }
      }).catch(function (error) { if (!closed) { busy = false; message = errorText(error); render(); } });
    }
    function keydown(event) {
      if (!opened || closed) return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); hide(); return; }
      if (event.key !== 'Tab') return;
      var buttons = Array.prototype.filter.call(panel.querySelectorAll('button'), function (b) { return !b.disabled; });
      if (!buttons.length) { event.preventDefault(); focusPanel(); return; }
      var first = buttons[0], last = buttons[buttons.length - 1], active = document.activeElement;
      if (event.shiftKey && (active === first || !buttons.includes(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !buttons.includes(active))) { event.preventDefault(); first.focus(); }
    }
    function focusin(event) { if (opened && !closed && !panel.contains(event.target)) focusPanel(); }
    launch.addEventListener('click', show);
    layer.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === layer) hide(); });
    layer.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    var timer = setInterval(function () { if (!closed && opened && !busy) render(); }, 30000);

    function update(next) {
      if (closed) return false;
      var wasStopped = terminal || !!blocked;
      snap = next || {};
      // A delayed cache/listener snapshot must never reopen an observed terminal room.
      if (snap.room && (!terminal || terminalStatus(snap.room))) room = snap.room;
      terminal = terminalStatus(room);
      blocked = '';
      if (snap.room === null && !snap.error && !snap.pending) { room = null; blocked = 'This room no longer exists. Ask your friends for a new invitation.'; }
      if (room && window.HubOnline && HubOnline.rooms.compatibility) {
        var compatible = HubOnline.rooms.compatibility(room);
        if (compatible && !compatible.ok) blocked = compatible.message || 'This game uses a different version. Reload the latest app, or ask your friends to create a fresh room.';
      }
      if (terminal || blocked) {
        presenceOff();
        if (!wasStopped) confirmation = '';
        if (!opened) show(); else render();
        return false;
      }
      presenceOn();
      if (opened) render();
      return true;
    }
    function close() {
      if (closed) return;
      closed = true; presenceOff(); clearInterval(timer); document.removeEventListener('focusin', focusin); thaw(); root.remove();
    }
    return { update: update, close: close };
  }
  window.HubSession = { mount: mount };
})();
