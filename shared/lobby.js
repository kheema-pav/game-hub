/*!
 * HubLobby: game-agnostic online lobby for Game Hub (create / join sheet, waiting room, "started without you",
 * and the ?room=CODE entry router). Classic script, defines window.HubLobby. Uses only HubOnline and (guarded) HubKit;
 * it holds no game logic. Spec: docs/online-splendor.md (amendments win) and docs/online-plan.md.
 *
 *   HubLobby.openCreateJoin({game, gameName, seatOptions:[2,3,4], accent, onRoom(code), onClose()})   -> {close()}
 *   HubLobby.waitingRoom(code, {game, gameName, minToStart:2, accent, onStart(room), onLeave(), onClose()})  -> {close()}
 *   HubLobby.notSeated(code, {gameName, hubUrl:'../', onClose()})                                     -> {close()}
 *   HubLobby.enter(code, {game, gameName, minToStart, accent, hubUrl, onPlay({code, uid, room}), onExit()}) -> {close()}
 *   HubLobby.close()   // closes whatever is open
 *   HubLobby.fmtCode(code), HubLobby.roomLink(code)
 *
 * Everything is mounted on document.body inside .hl-root (z-index 4900, below the HubKit sheet at 5000), with its own
 * light/dark CSS variables. All class names start with hl-.
 */
(function () {
  'use strict';
  if (window.HubLobby) return;

  var CODE_RE = /^[1-9][0-9]{5}$/;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(c) { return String(c == null ? '' : c).replace(/\D/g, ''); }
  function fmtCode(c) { c = String(c || ''); return c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c; }
  function roomLink(code) { return location.origin + location.pathname + '?room=' + code; }
  function safeColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : ''; }
  function call(fn, a) { try { if (typeof fn === 'function') return fn(a); } catch (e) { try { console.error(e); } catch (_) {} } }
  function onlineOK() { try { return !!(window.HubOnline && HubOnline.available()); } catch (e) { return false; } }
  function hubUrlOf(o) { return (o && o.hubUrl) || '../'; }
  function extractCode(t) {
    var m = /room=(\d{6})/.exec(String(t == null ? '' : t));
    return m ? m[1] : norm(t).slice(0, 6);
  }
  function errText(e) {
    var c = e && e.code;
    return c === 'offline' ? "You're offline. Check your connection and try again."
      : c === 'missing' ? 'No game with that code'
      : c === 'full' ? 'That game is full'
      : c === 'started' ? 'That game has already started'
      : c === 'unavailable' ? 'Online play is unavailable right now'
      : c === 'auth' ? "Couldn't sign in to the game server"
      : c === 'denied' ? 'The game server refused that'
      : "Couldn't reach the game server";
  }
  function profileName() {
    try { if (window.HubKit && typeof HubKit.profile === 'function') return String(HubKit.profile().name || '').replace(/\s+/g, ' ').trim(); } catch (e) {}
    try { var d = JSON.parse(localStorage.getItem('hub.profile')); return d && d.name ? String(d.name).replace(/\s+/g, ' ').trim() : ''; } catch (e) {}
    return '';
  }
  function setName(v) {
    v = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!v) return false;
    try { if (window.HubKit && typeof HubKit.setProfile === 'function') { HubKit.setProfile({ name: v }); return true; } } catch (e) {}
    try {
      var d = JSON.parse(localStorage.getItem('hub.profile'));
      if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
      d.name = v;
      localStorage.setItem('hub.profile', JSON.stringify(d));
      window.dispatchEvent(new Event('hubprofilechange'));
    } catch (e) {}
    return true;
  }
  function otherGameUrl(game, code) {
    if (!/^[a-z][a-z0-9_-]{0,23}$/.test(String(game))) return '';
    return new URL('../' + game + '/?room=' + code, location.href).href;
  }
  function onAccent(hex) { // readable text colour for an accent background
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#000';
    var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
  }

  /* ---------- styles (injected once) ---------- */
  var CSS = [
    '.hl-root{--hl-bg:#fff;--hl-page:#eef1f5;--hl-text:#1b2230;--hl-muted:#5d6675;--hl-line:rgba(20,30,50,.14);--hl-row:#f0f2f6;--hl-row2:#e4e8ef;--hl-dim:rgba(10,14,22,.45);--hl-accent:var(--hl-acc-l,#f2b632);--hl-on:var(--hl-on-l,#000);--hl-warn:#b3261e;--hl-warn-bg:#fbe9e7;font:400 16px/1.4 ' + FONT + ';color:var(--hl-text);-webkit-text-size-adjust:100%}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .hl-root{--hl-bg:#1a2030;--hl-page:#121722;--hl-text:#eef1f6;--hl-muted:#a3adbd;--hl-line:rgba(255,255,255,.16);--hl-row:#252d40;--hl-row2:#2f3950;--hl-dim:rgba(0,0,0,.6);--hl-accent:var(--hl-acc-d,#f2b632);--hl-on:var(--hl-on-d,#000);--hl-warn:#ff9a90;--hl-warn-bg:#42262b}}',
    ':root[data-theme="dark"] .hl-root{--hl-bg:#1a2030;--hl-page:#121722;--hl-text:#eef1f6;--hl-muted:#a3adbd;--hl-line:rgba(255,255,255,.16);--hl-row:#252d40;--hl-row2:#2f3950;--hl-dim:rgba(0,0,0,.6);--hl-accent:var(--hl-acc-d,#f2b632);--hl-on:var(--hl-on-d,#000);--hl-warn:#ff9a90;--hl-warn-bg:#42262b}',
    '.hl-layer{--hl-accent:var(--hl-acc-l,#f2b632);--hl-on:var(--hl-on-l,#000)}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .hl-layer{--hl-accent:var(--hl-acc-d,#f2b632);--hl-on:var(--hl-on-d,#000)}}',
    ':root[data-theme="dark"] .hl-layer{--hl-accent:var(--hl-acc-d,#f2b632);--hl-on:var(--hl-on-d,#000)}',
    '.hl-root *{box-sizing:border-box}',
    '.hl-layer{position:fixed;top:0;left:0;right:0;bottom:0;z-index:4900;display:flex;align-items:flex-end;justify-content:center}',
    '.hl-layer.hl-page{background:var(--hl-page);align-items:center;overflow-y:auto;padding:16px}',
    '.hl-backdrop{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--hl-dim)}',
    '.hl-panel{position:relative;width:100%;max-width:520px;max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;overscroll-behavior:contain;background:var(--hl-bg);color:var(--hl-text);border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 30px rgba(0,0,0,.3);outline:0}',
    '.hl-page .hl-panel{border-radius:20px;padding:20px 18px 18px;box-shadow:0 8px 30px rgba(0,0,0,.18);border:1px solid var(--hl-line);margin:auto;max-height:none}',
    '@media (min-width:640px){.hl-layer{align-items:center}.hl-panel{border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}}',
    '.hl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 6px}',
    '.hl-root h2.hl-title{margin:0;padding:0;font:700 20px/1.25 ' + FONT + ';letter-spacing:normal;text-transform:none;color:var(--hl-text);overflow-wrap:anywhere}',
    '.hl-root h3.hl-sec{margin:18px 0 8px;padding:0;font:700 12px/1.2 ' + FONT + ';letter-spacing:.07em;text-transform:uppercase;color:var(--hl-muted)}',
    '.hl-root p.hl-lede{margin:6px 0 0;color:var(--hl-muted);font-size:15px}',
    '.hl-root button,.hl-root a.hl-btn{appearance:none;-webkit-appearance:none;margin:0;font:inherit;color:var(--hl-text);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;text-decoration:none}',
    '.hl-root button.hl-x{flex:none;width:44px;height:44px;border:0;border-radius:12px;background:transparent;font-size:24px;line-height:1;display:grid;place-items:center}',
    '.hl-root button.hl-x:hover{background:var(--hl-row2)}',
    '.hl-root .hl-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:8px 18px;border:1px solid var(--hl-line);border-radius:14px;background:var(--hl-row);font-weight:650;text-align:center}',
    '.hl-root .hl-btn:hover:not(:disabled){background:var(--hl-row2)}',
    '.hl-root .hl-btn.hl-go{background:var(--hl-accent);border-color:transparent;color:var(--hl-on)}',
    '.hl-root .hl-btn.hl-go:hover:not(:disabled){background:var(--hl-accent);filter:brightness(.93)}',
    '.hl-root .hl-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.hl-root .hl-btn.hl-wide{width:100%}',
    '.hl-root button:focus-visible,.hl-root a:focus-visible,.hl-root input:focus-visible{outline:2px solid var(--hl-accent);outline-offset:2px}',
    '.hl-root .hl-seg{display:flex;gap:8px;margin:0 0 12px}',
    '.hl-root .hl-seg button{flex:1;min-height:48px;border:1px solid var(--hl-line);border-radius:12px;background:var(--hl-row);font-weight:650}',
    '.hl-root .hl-seg button[aria-checked="true"]{background:var(--hl-accent);color:var(--hl-on);border-color:transparent}',
    '.hl-root .hl-field{display:flex;flex-direction:column;gap:4px;margin:0 0 4px;color:var(--hl-muted);font-size:13px}',
    '.hl-root input.hl-in{width:100%;min-height:48px;margin:0;padding:8px 12px;border:1px solid var(--hl-line);border-radius:12px;background:var(--hl-bg);color:var(--hl-text);font:400 18px/1.3 ' + FONT + ';-webkit-appearance:none;appearance:none}',
    '.hl-root input.hl-code{letter-spacing:.18em;font-variant-numeric:tabular-nums;text-align:center;font-size:22px}',
    '.hl-root .hl-row{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap}',
    '.hl-root .hl-row .hl-grow{flex:1;min-width:0}',
    '.hl-root .hl-err{margin:10px 0 0;padding:9px 12px;border-radius:12px;background:var(--hl-warn-bg);color:var(--hl-warn);font-size:15px;font-weight:600}',
    '.hl-root .hl-err:empty{display:none}',
    '.hl-root .hl-bigcode{margin:14px 0 4px;text-align:center;font:800 clamp(40px,14vw,64px)/1.05 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;font-variant-numeric:tabular-nums;user-select:all;-webkit-user-select:all}',
    '.hl-root .hl-plist{list-style:none;margin:0;padding:0;display:grid;gap:6px}',
    '.hl-root .hl-plist li{display:flex;align-items:center;gap:10px;min-height:46px;padding:8px 12px;border-radius:12px;background:var(--hl-row)}',
    '.hl-root .hl-plist li.hl-empty{background:transparent;border:1px dashed var(--hl-line);color:var(--hl-muted)}',
    '.hl-root .hl-dot{flex:none;width:16px;height:16px;border-radius:50%;background:var(--hl-pc,var(--hl-muted));box-shadow:0 0 0 2px var(--hl-bg),0 0 0 3px var(--hl-line)}',
    '.hl-root .hl-who{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:650}',
    '.hl-root .hl-tag{flex:none;color:var(--hl-muted);font-size:13px}',
    '.hl-root .hl-status{margin:12px 0 0;color:var(--hl-muted);font-size:15px}',
    '.hl-root .hl-foot{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}',
    '.hl-root .hl-foot .hl-btn{flex:1 1 140px}',
    '.hl-root input.hl-link{width:100%;margin-top:8px;font-size:14px}',
    '.hl-root .hl-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.hl-root .hl-spin{display:inline-block;width:1.1em;text-align:left}',
    '@media (prefers-reduced-motion:no-preference){.hl-panel{animation:hl-up .2s ease-out}.hl-page .hl-panel{animation:hl-fade .2s ease-out}}',
    '@keyframes hl-up{from{transform:translateY(16px);opacity:.4}to{transform:none;opacity:1}}',
    '@keyframes hl-fade{from{opacity:0}to{opacity:1}}'
  ].join('\n');

  var root = null, current = null;

  function mount() {
    if (root && root.parentNode) return root;
    if (!document.getElementById('hl-css')) {
      var st = document.createElement('style');
      st.id = 'hl-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root = document.createElement('div');
    root.className = 'hl-root';
    document.body.appendChild(root);
    return root;
  }

  function applyAccent(layer, accent) {
    var l = '#f2b632', d = '#f2b632';
    if (typeof accent === 'string') { l = d = accent; }
    else if (accent && typeof accent === 'object') { l = accent.light || l; d = accent.dark || accent.light || d; }
    if (!safeColor(l)) l = '#f2b632';
    if (!safeColor(d)) d = l;
    layer.style.setProperty('--hl-acc-l', l);
    layer.style.setProperty('--hl-acc-d', d);
    layer.style.setProperty('--hl-on-l', onAccent(l));
    layer.style.setProperty('--hl-on-d', onAccent(d));
  }

  // One layer at a time. A layer is {el, panel, close()}; opening a new one closes the old one silently.
  function open(o) {
    closeCurrent(true);
    mount();
    var layer = document.createElement('div');
    layer.className = 'hl-layer' + (o.page ? ' hl-page' : '');
    applyAccent(layer, o.accent);
    var backdrop = o.page ? '' : '<div class="hl-backdrop" data-hl="backdrop"></div>';
    layer.innerHTML = backdrop + '<div class="hl-panel" role="dialog" aria-modal="true" aria-label="' + esc(o.label || 'Online game') + '" tabindex="-1"></div>';
    root.appendChild(layer);
    var panel = layer.querySelector('.hl-panel');
    var prev = document.activeElement;
    var h = {
      el: layer, panel: panel, closed: false, onEsc: o.onEsc || null, cleanup: o.cleanup || null,
      close: function (silent) {
        if (h.closed) return;
        h.closed = true;
        if (current === h) current = null;
        if (h.cleanup) { try { h.cleanup(); } catch (e) {} }
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        document.removeEventListener('keydown', onKey, true);
        if (!silent && prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch (e) {} }
      }
    };
    function onKey(e) {
      if (e.key === 'Escape' && h.onEsc) { e.stopPropagation(); h.onEsc(); }
    }
    document.addEventListener('keydown', onKey, true);
    layer.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-hl]') : null;
      if (!t || !layer.contains(t)) return;
      if (t.getAttribute('data-hl') === 'backdrop') { if (h.onEsc) h.onEsc(); return; }
      if (h.onAct) h.onAct(t.getAttribute('data-hl'), t, e);
    });
    current = h;
    return h;
  }
  function closeCurrent(silent) { if (current) current.close(silent); }
  function focusFirst(h, sel) {
    setTimeout(function () {
      if (h.closed) return;
      var f = sel && h.panel.querySelector(sel);
      try { (f || h.panel).focus(); } catch (e) {}
    }, 30);
  }
  function setText(h, sel, t) { var n = h.panel.querySelector(sel); if (n) n.textContent = t || ''; }

  function nameFieldHTML() {
    return '<label class="hl-field" for="hl-name">Your name<input class="hl-in" id="hl-name" maxlength="16" autocomplete="nickname" placeholder="Name" enterkeyhint="done"></label>';
  }
  // Reads and saves the name field when the profile has none. Returns true when we may continue.
  function takeName(h, errSel) {
    if (profileName()) return true;
    var f = h.panel.querySelector('#hl-name');
    var v = f ? f.value.replace(/\s+/g, ' ').trim() : '';
    if (!v) { setText(h, errSel, 'Enter a name first. Other players see it.'); if (f) f.focus(); return false; }
    setName(v);
    return true;
  }

  /* ---------- create / join sheet ---------- */
  function openCreateJoin(o) {
    o = o || {};
    var game = o.game, gameName = o.gameName || 'this game';
    var seats = (o.seatOptions || []).filter(function (n) { return n === 2 || n === 3 || n === 4; });
    if (!seats.length) {
      var lo = Math.max(2, +o.minSeats || 2), hi = Math.min(4, +o.maxSeats || 4);
      for (var n = lo; n <= hi; n++) seats.push(n);
    }
    if (!seats.length) seats = [2, 3, 4];
    var chosen = seats[0], busy = false;
    var h = open({ label: 'Play ' + gameName + ' online', accent: o.accent, onEsc: cancel });
    function cancel() { if (busy) return; h.close(); call(o.onClose); }
    function draw() {
      var needName = !profileName();
      h.panel.innerHTML =
        '<div class="hl-head"><h2 class="hl-title">Play ' + esc(gameName) + ' online</h2><button class="hl-x" type="button" data-hl="close" aria-label="Close">×</button></div>' +
        '<p class="hl-lede">Each player uses their own phone. No accounts needed.</p>' +
        (needName ? '<h3 class="hl-sec">You</h3>' + nameFieldHTML() : '') +
        '<h3 class="hl-sec">Create a game</h3>' +
        '<div class="hl-seg" role="radiogroup" aria-label="Number of players">' + seats.map(function (n) {
          return '<button type="button" role="radio" data-hl="seats" data-n="' + n + '" aria-checked="' + (n === chosen) + '">' + n + ' players</button>';
        }).join('') + '</div>' +
        '<button class="hl-btn hl-go hl-wide" type="button" data-hl="create">Create game</button>' +
        '<h3 class="hl-sec">Join with a code</h3>' +
        '<div class="hl-row"><input class="hl-in hl-code hl-grow" id="hl-code" inputmode="numeric" pattern="[0-9 ]*" autocomplete="off" placeholder="000 000" aria-label="Six-digit game code" enterkeyhint="go">' +
        '<button class="hl-btn" type="button" data-hl="join">Join</button></div>' +
        '<p class="hl-err" role="alert" id="hl-msg"></p>';
      var code = h.panel.querySelector('#hl-code');
      code.addEventListener('input', function () {
        var d = extractCode(code.value);
        var v = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
        if (code.value !== v) code.value = v;
        setText(h, '#hl-msg', '');
      });
      code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doJoin(); } });
    }
    function setBusy(b, which) {
      busy = b;
      h.panel.querySelectorAll('button[data-hl]').forEach(function (x) { x.disabled = b; });
      var c = h.panel.querySelector('[data-hl="create"]'), j = h.panel.querySelector('[data-hl="join"]');
      if (c) c.textContent = b && which === 'create' ? 'Creating…' : 'Create game';
      if (j) j.textContent = b && which === 'join' ? 'Looking…' : 'Join';
    }
    async function doCreate() {
      if (busy) return;
      setText(h, '#hl-msg', '');
      if (!onlineOK()) { setText(h, '#hl-msg', errText({ code: 'unavailable' })); return; }
      if (!takeName(h, '#hl-msg')) return;
      setBusy(true, 'create');
      try {
        var r = await HubOnline.rooms.create({ game: game, maxSeats: chosen });
        if (h.closed) return;
        h.close(true);
        call(o.onRoom, r.code);
      } catch (e) {
        if (h.closed) return;
        setBusy(false);
        setText(h, '#hl-msg', errText(e));
      }
    }
    async function doJoin() {
      if (busy) return;
      setText(h, '#hl-msg', '');
      var code = extractCode((h.panel.querySelector('#hl-code') || {}).value);
      if (!CODE_RE.test(code)) { setText(h, '#hl-msg', 'Enter the 6-digit game code'); return; }
      if (!onlineOK()) { setText(h, '#hl-msg', errText({ code: 'unavailable' })); return; }
      if (!takeName(h, '#hl-msg')) return;
      setBusy(true, 'join');
      try {
        var info = await HubOnline.rooms.lookup(code);
        if (h.closed) return;
        if (!info.exists) { var x = new Error(); x.code = 'missing'; throw x; }
        if (info.game && game && info.game !== game) {          // another game's code: open that game
          var url = otherGameUrl(info.game, code);
          if (url) { setText(h, '#hl-msg', ''); location.href = url; return; }
          setText(h, '#hl-msg', "That game isn't available here"); setBusy(false); return;
        }
        if (!info.seated) {
          if (info.status !== 'open') { var y = new Error(); y.code = 'started'; throw y; }
          if (Object.keys(info.seats || {}).length >= info.maxSeats) { var z = new Error(); z.code = 'full'; throw z; }
        }
        await HubOnline.rooms.join(code);                       // idempotent
        if (h.closed) return;
        h.close(true);
        call(o.onRoom, code);
      } catch (e) {
        if (h.closed) return;
        setBusy(false);
        setText(h, '#hl-msg', errText(e));
      }
    }
    h.onAct = function (a, t) {
      if (busy) return;
      if (a === 'close') cancel();
      else if (a === 'seats') {
        chosen = +t.getAttribute('data-n');
        h.panel.querySelectorAll('[data-hl="seats"]').forEach(function (b) { b.setAttribute('aria-checked', String(+b.getAttribute('data-n') === chosen)); });
      }
      else if (a === 'create') doCreate();
      else if (a === 'join') doJoin();
    };
    draw();
    focusFirst(h, '#hl-name, [data-hl="create"]');
    return { close: function () { h.close(); } };
  }

  /* ---------- simple message pages ---------- */
  function messagePage(o) { // {title, lede, buttons:[{id, label, go, href}], label}
    var h = open({ page: true, label: o.title, accent: o.accent, onEsc: null });
    h.panel.innerHTML = '<h2 class="hl-title">' + esc(o.title) + '</h2>' +
      (o.lede ? '<p class="hl-lede">' + esc(o.lede) + '</p>' : '') +
      (o.extra || '') +
      (o.buttons && o.buttons.length ? '<div class="hl-foot">' + o.buttons.map(function (b) {
        return b.href ? '<a class="hl-btn' + (b.go ? ' hl-go' : '') + '" href="' + esc(b.href) + '">' + esc(b.label) + '</a>'
          : '<button class="hl-btn' + (b.go ? ' hl-go' : '') + '" type="button" data-hl="' + esc(b.id) + '">' + esc(b.label) + '</button>';
      }).join('') + '</div>' : '');
    h.onAct = function (a) { var b = (o.buttons || []).filter(function (x) { return x.id === a; })[0]; if (b && b.onClick) b.onClick(); };
    focusFirst(h, '.hl-go');
    return h;
  }

  function notSeated(code, o) {
    o = o || {};
    var h = messagePage({
      title: 'This game started without you', accent: o.accent,
      lede: 'Game ' + fmtCode(code) + ' is already under way and every seat is taken. Ask your friends for a new code' + (o.gameName ? ', or start a game of your own.' : '.'),
      buttons: [{ label: 'Back to the hub', href: hubUrlOf(o) }].concat(o.onClose ? [{ id: 'close', label: o.closeLabel || 'New game', go: true, onClick: function () { h.close(); call(o.onClose); } }] : [])
    });
    return { close: function () { h.close(); } };
  }

  /* ---------- waiting room ---------- */
  function waitingRoom(code, o) {
    o = o || {};
    code = norm(code);
    var minToStart = Math.max(2, +o.minToStart || 2);
    var st = { room: null, error: null, busy: false, msg: '', copied: false, fallback: false, done: false, missing: false };
    var unsub = null;
    var h = open({
      page: o.mode !== 'sheet', label: 'Waiting room', accent: o.accent,
      cleanup: function () { st.done = true; if (unsub) { try { unsub(); } catch (e) {} unsub = null; } }
    });
    function uid() { try { return HubOnline.uid; } catch (e) { return null; } }
    function draw() {
      if (h.closed) return;
      var room = st.room, me = uid();
      if (st.missing) {
        h.panel.innerHTML = '<h2 class="hl-title">No game with that code</h2><p class="hl-lede">There is no game ' + esc(fmtCode(code)) + '.</p><div class="hl-foot"><button class="hl-btn hl-go" type="button" data-hl="close">Close</button></div>';
        return;
      }
      var seats = (room && room.seats) || {}, max = (room && room.maxSeats) || 2;
      var ids = Object.keys(seats).sort(function (a, b) { return (seats[a].joinedAt || 0) - (seats[b].joinedAt || 0) || (a < b ? -1 : 1); });
      var host = !!room && room.host === me;
      var rows = ids.map(function (u) {
        var tags = [u === (room && room.host) ? 'host' : '', u === me ? 'you' : ''].filter(Boolean).join(' · ');
        var c = safeColor(seats[u].color);
        return '<li' + (c ? ' style="--hl-pc:' + c + '"' : '') + '><span class="hl-dot"></span><span class="hl-who">' + esc(seats[u].name || 'Player') + '</span><span class="hl-tag">' + esc(tags) + '</span></li>';
      }).join('') + Array.apply(null, Array(Math.max(0, max - ids.length))).map(function () {
        return '<li class="hl-empty"><span class="hl-dot"></span><span class="hl-who">Waiting for a player…</span></li>';
      }).join('');
      var status = !room ? 'Connecting to the game server…'
        : host ? (ids.length < minToStart ? 'Share the code. You need at least ' + (minToStart - ids.length) + ' more player' + (minToStart - ids.length > 1 ? 's' : '') + ' to start.'
          : ids.length < max ? 'Start now, or wait for more players. The game starts by itself when every seat is full.' : 'Everyone is here.')
        : 'Waiting for the host to start the game.';
      var msg = st.msg || (st.error ? (st.error.code === 'offline' ? "You're offline. The list will update when you reconnect." : "Can't reach the game server right now.") : '');
      h.panel.innerHTML =
        '<div class="hl-head"><h2 class="hl-title">' + esc(o.gameName ? o.gameName + ': waiting for players' : 'Waiting for players') + '</h2></div>' +
        '<p class="hl-lede">Share this code, or the link, with your friends.</p>' +
        '<div class="hl-bigcode" aria-label="Game code ' + esc(code) + '">' + esc(fmtCode(code)) + '</div>' +
        '<div class="hl-row"><button class="hl-btn hl-go hl-grow" type="button" data-hl="copy">' + (st.copied ? 'Link copied' : 'Copy link') + '</button></div>' +
        (st.fallback ? '<label class="hl-sr" for="hl-link">Game link</label><input id="hl-link" class="hl-in hl-link" readonly value="' + esc(roomLink(code)) + '"><p class="hl-lede">Select the link above and copy it.</p>' : '') +
        '<h3 class="hl-sec">Players · ' + ids.length + ' of ' + max + '</h3>' +
        '<ul class="hl-plist" aria-label="Players">' + rows + '</ul>' +
        '<p class="hl-status" role="status">' + esc(status) + '</p>' +
        '<p class="hl-err" role="alert">' + esc(msg) + '</p>' +
        '<div class="hl-foot">' +
        (host ? '<button class="hl-btn" type="button" data-hl="hostclose"' + (st.busy ? ' disabled' : '') + '>Close</button>'
          + '<button class="hl-btn hl-go" type="button" data-hl="start"' + (ids.length < minToStart || st.busy ? ' disabled' : '') + '>Start</button>'
          : '<button class="hl-btn" type="button" data-hl="leave"' + (st.busy || !room ? ' disabled' : '') + '>Leave</button>') +
        '</div>';
    }
    async function copy() {
      var ok = false;
      try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(roomLink(code)); ok = true; } } catch (e) {}
      if (h.closed) return;
      if (ok) { st.copied = true; st.fallback = false; draw(); setTimeout(function () { st.copied = false; draw(); }, 1800); return; }
      st.fallback = true; draw();
      var f = h.panel.querySelector('#hl-link');
      if (f) { f.focus(); f.select(); try { if (document.execCommand('copy')) { st.copied = true; st.fallback = false; draw(); setTimeout(function () { st.copied = false; draw(); }, 1800); } } catch (e) {} }
    }
    async function start() {
      if (st.busy) return;
      st.busy = true; st.msg = ''; draw();
      try { await HubOnline.rooms.start(code); } catch (e) { st.msg = errText(e); }
      st.busy = false; draw();
    }
    async function leave() {
      if (st.busy) return;
      st.busy = true; st.msg = ''; draw();
      try { await HubOnline.rooms.leave(code); }
      catch (e) { st.busy = false; st.msg = errText(e); draw(); return; }
      h.close(true);
      call(o.onLeave);
    }
    h.onAct = function (a) {
      if (a === 'copy') copy();
      else if (a === 'start') start();
      else if (a === 'leave') leave();
      else if (a === 'hostclose' || a === 'close') { h.close(true); call(o.onClose || o.onLeave); }
    };
    draw();
    focusFirst(h, '[data-hl="copy"]');
    function onSnap(snap) {
      if (st.done || h.closed) return;
      if (snap.error) { st.error = snap.error; if (!st.room) { st.room = null; } draw(); return; }
      st.error = null;
      if (!snap.room) { st.missing = true; draw(); return; }
      st.room = snap.room;
      var me = uid(), seated = !!(snap.room.seats && snap.room.seats[me]);
      if (snap.room.status === 'playing') {
        if (!seated) { h.close(true); notSeated(code, { gameName: o.gameName, hubUrl: o.hubUrl, accent: o.accent, onClose: o.onClose || o.onLeave }); return; }
        var room = snap.room;
        h.close(true);                                        // stops the watch
        call(o.onStart, room);
        return;
      }
      if (!seated) { st.msg = 'You are not in this game.'; }
      draw();
    }
    try { unsub = HubOnline.rooms.watch(code, onSnap); } catch (e) { st.error = { code: 'unavailable' }; draw(); }
    return { close: function () { h.close(); } };
  }

  /* ---------- ?room=CODE entry ---------- */
  function enter(code, o) {
    o = o || {};
    code = norm(code);
    var game = o.game, gameName = o.gameName || '';
    var cancelled = false, handle = { close: function () { cancelled = true; closeCurrent(); } };
    function exit() { cancelled = true; closeCurrent(true); call(o.onExit); }
    function fail(title, lede, retry) {
      if (cancelled) return;
      var b = [{ label: 'Back to the hub', href: hubUrlOf(o) }];
      if (retry) b.push({ id: 'retry', label: 'Try again', go: true, onClick: run });
      if (o.onExit) b.splice(1, 0, { id: 'exit', label: o.exitLabel || 'Close', onClick: exit });
      messagePage({ title: title, lede: lede, buttons: b, accent: o.accent });
    }
    function busyPage(title, lede) {
      if (cancelled) return;
      messagePage({ title: title, lede: lede, accent: o.accent, buttons: o.onExit ? [{ id: 'exit', label: 'Cancel', onClick: exit }] : [] });
    }
    function askName() {
      var h = messagePage({
        title: 'What should we call you?', lede: 'Other players see this name. You can change it later in the menu under You.',
        extra: '<div style="margin-top:12px">' + nameFieldHTML() + '</div><p class="hl-err" role="alert" id="hl-msg"></p>', accent: o.accent,
        buttons: (o.onExit ? [{ id: 'exit', label: 'Cancel', onClick: exit }] : []).concat([{ id: 'ok', label: 'Continue', go: true, onClick: function () { if (takeName(h, '#hl-msg')) run(); } }])
      });
      var f = h.panel.querySelector('#hl-name');
      if (f) f.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (takeName(h, '#hl-msg')) run(); } });
      focusFirst(h, '#hl-name');
    }
    function goWaiting(uid) {
      if (cancelled) return;
      waitingRoom(code, {
        game: game, gameName: gameName, minToStart: o.minToStart, accent: o.accent, hubUrl: o.hubUrl,
        onStart: function (room) { call(o.onPlay, { code: code, uid: uid, room: room }); },
        onLeave: o.onExit, onClose: o.onExit
      });
    }
    async function run() {
      if (cancelled) return;
      if (!CODE_RE.test(code)) { fail("That link doesn't hold a valid game code", 'Game codes have six digits. Check the link with whoever invited you.'); return; }
      if (!onlineOK()) { fail('Online play is unavailable', "Online games need the game server, and it can't be reached from here right now. Playing on this device still works."); return; }
      if (!profileName()) { askName(); return; }
      busyPage('Joining game ' + fmtCode(code), 'Connecting to the game server…');
      try {
        var me = await HubOnline.ready();
        if (cancelled) return;
        var info = await HubOnline.rooms.lookup(code);
        if (cancelled) return;
        if (!info.exists) { fail('No game with that code', 'There is no game ' + fmtCode(code) + '. Check the code with whoever invited you.'); return; }
        if (info.game && game && info.game !== game) {
          var url = otherGameUrl(info.game, code);
          if (url) { location.replace(url); return; }
          fail("That game isn't available here", 'The code ' + fmtCode(code) + ' belongs to a different game. Open it from the hub.');
          return;
        }
        if (!info.seated) {
          if (info.status !== 'open') { closeCurrent(true); notSeated(code, { gameName: gameName, hubUrl: o.hubUrl, accent: o.accent, onClose: o.onExit }); return; }
          try { await HubOnline.rooms.join(code); }
          catch (e) {
            if (cancelled) return;
            if (e && e.code === 'started') { closeCurrent(true); notSeated(code, { gameName: gameName, hubUrl: o.hubUrl, accent: o.accent, onClose: o.onExit }); return; }
            throw e;
          }
          if (cancelled) return;
          goWaiting(me.uid);
          return;
        }
        if (info.status === 'playing') { closeCurrent(true); call(o.onPlay, { code: code, uid: me.uid, room: null }); return; }
        goWaiting(me.uid);
      } catch (e) {
        if (cancelled) return;
        var c = e && e.code;
        if (c === 'missing') fail('No game with that code', 'There is no game ' + fmtCode(code) + '. Check the code with whoever invited you.');
        else if (c === 'full') fail('That game is full', 'Every seat in game ' + fmtCode(code) + ' is taken.');
        else fail("Couldn't open the game", errText(e), true);
      }
    }
    run();
    return handle;
  }

  window.HubLobby = {
    openCreateJoin: openCreateJoin,
    waitingRoom: waitingRoom,
    notSeated: notSeated,
    enter: enter,
    close: function () { closeCurrent(); },
    fmtCode: fmtCode,
    roomLink: roomLink
  };
})();
