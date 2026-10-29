/*!
 * HubKit: shared menu button, menu sheet, settings, sound and haptics for Game Hub.
 * Plain JS, no dependencies. Spec: docs/hubkit-spec.md (amendments win).
 */
(function () {
  'use strict';

  // Must be read at the top level: document.currentScript is null once the script has finished.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var HUB_URL = (function () {
    try {
      if (!SCRIPT_SRC) {
        var s = document.querySelector('script[src*="hubkit.js"]');
        SCRIPT_SRC = s ? s.src : '';
      }
      return new URL('../', SCRIPT_SRC || location.href).href; // folder that contains shared/
    } catch (e) { return ''; }
  })();

  var KEY = 'hubkit.settings';
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  var settings = { sound: true, volume: 0.35, vibrate: true, wake: false };
  var cfg = { id: '', name: 'Menu', accent: null, scheme: 'auto', floating: false, items: null };
  var root, sheet, layer, floatBtn, toastEl, mq;
  var isOpenNow = false, cur = [], armed = -1, armTimer = 0, volTimer = 0, toastTimer = 0;

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function call(fn, arg) { try { if (typeof fn === 'function') return fn(arg); } catch (e) { try { console.error(e); } catch (_) {} } }
  function shown(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  /* ---------- settings storage ---------- */
  function load() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY));
      if (r && typeof r === 'object') {
        if (typeof r.sound === 'boolean') settings.sound = r.sound;
        if (typeof r.vibrate === 'boolean') settings.vibrate = r.vibrate;
        if (typeof r.wake === 'boolean') settings.wake = r.wake;
        if (typeof r.volume === 'number' && isFinite(r.volume)) settings.volume = Math.min(1, Math.max(0, r.volume));
      }
    } catch (e) { /* keep in-memory values */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {} }
  // Apply side effects after settings changed (here or in another tab).
  function applySettings() {
    if (master) master.gain.value = settings.volume;
    syncWake();
    if (isOpenNow) render();
  }

  /* ---------- profile, stats, badge (localStorage hub.profile is the source of truth on this device) ---------- */
  var PKEY = 'hub.profile', DONEKEY = 'hub.statsDone';
  var COLORS = ['#e4572e', '#f2b632', '#4f9d69', '#3b6fa8', '#7c4d9b', '#e86fa0', '#2bb3b1', '#8d6e4a'];
  var memProfile = null, memDone = null;
  var editing = false, draft = null;

  function readProfileRaw() {
    try {
      var d = JSON.parse(localStorage.getItem(PKEY));
      if (d && typeof d === 'object' && !Array.isArray(d)) return d;
    } catch (e) {}
    return memProfile && typeof memProfile === 'object' ? memProfile : {};
  }
  function writeProfileRaw(p) {
    memProfile = p;
    try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {}
  }
  function cleanName(n) { return String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 16); }
  function cleanColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : COLORS[0]; }
  function profile() {
    var p = readProfileRaw();
    return { name: cleanName(p.name), color: cleanColor(p.color) };
  }
  function changed() { try { window.dispatchEvent(new Event('hubprofilechange')); } catch (e) {} }
  function setProfile(o) {
    o = o || {};
    var p = readProfileRaw(), cur = profile();
    p.name = o.name !== undefined ? cleanName(o.name) : cur.name;
    p.color = o.color !== undefined ? cleanColor(o.color) : cur.color;
    writeProfileRaw(p);
    changed();
    if (isOpenNow) render();
    return profile();
  }
  function readDone() {
    try {
      var d = JSON.parse(localStorage.getItem(DONEKEY));
      if (Array.isArray(d)) return d;
    } catch (e) {}
    return memDone || [];
  }
  // Idempotent per key. Returns true when the result was counted, false when this key was already recorded.
  function recordResult(game, key, r) {
    try {
      if (!game || typeof game !== 'string') return false;
      r = r || {};
      var done = readDone();
      if (key != null && key !== '') {
        key = String(key);
        if (done.indexOf(key) >= 0) return false;
        done.push(key);
        if (done.length > 500) done = done.slice(-500);
        memDone = done;
        try { localStorage.setItem(DONEKEY, JSON.stringify(done)); } catch (e) {}
      }
      var p = readProfileRaw();
      var stats = p.stats && typeof p.stats === 'object' && !Array.isArray(p.stats) ? p.stats : {};
      var g = stats[game] && typeof stats[game] === 'object' ? stats[game] : {};
      var played = (+g.played || 0) + 1, won = (+g.won || 0) + (r.won ? 1 : 0), best = +g.best || 0;
      if (typeof r.score === 'number' && isFinite(r.score) && r.score > best) best = r.score;
      stats[game] = { played: played, won: won, best: best };
      p.stats = stats;
      writeProfileRaw(p);
      changed();
      return true;
    } catch (e) { return false; }
  }

  var badgeOn = false, badgeStyle = null;
  function setBadge(on) {
    badgeOn = !!on;
    try {
      if (!badgeStyle) {
        badgeStyle = document.createElement('style');
        badgeStyle.id = 'hubkit-badge-css';
        badgeStyle.textContent = 'button.hk-menu-btn.hk-menu-btn::after{content:"";position:absolute;top:5px;right:5px;width:10px;height:10px;border-radius:50%;background:#e4572e;box-shadow:0 0 0 2px #fff;pointer-events:none}';
      }
      if (badgeOn && document.body) document.body.appendChild(badgeStyle);
      else if (!badgeOn && badgeStyle.parentNode) badgeStyle.parentNode.removeChild(badgeStyle);
    } catch (e) {}
  }

  /* ---------- sound engine ---------- */
  var ctx = null, master = null, noiseBuf = null, lastPlayed = {};
  var UNLOCK = ['pointerup', 'touchend', 'click', 'keydown'];

  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return removeUnlock();
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = settings.volume;
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 s shared white noise
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        ctx.onstatechange = checkRunning;
      }
      if (ctx.state !== 'running') { var p = ctx.resume(); if (p && p.then) p.then(checkRunning, function () {}); }
      checkRunning();
    } catch (e) {}
  }
  function checkRunning() { if (ctx && ctx.state === 'running') removeUnlock(); }
  function removeUnlock() { UNLOCK.forEach(function (t) { window.removeEventListener(t, unlock, true); }); }
  // Registered first on window, so it runs before the key handler below can stop the event.
  UNLOCK.forEach(function (t) { window.addEventListener(t, unlock, { capture: true, passive: true }); });

  // Envelope: 0 -> peak over `a`, optional hold, then exponential decay reaching 0.001 at `end`.
  function envGain(P, t, a, peak, end, hold) {
    var g = ctx.createGain(), p = g.gain, s = P.t + t;
    p.setValueAtTime(0, s);
    p.linearRampToValueAtTime(peak, s + a);
    if (hold) p.setValueAtTime(peak, s + hold);
    p.exponentialRampToValueAtTime(0.001, s + end);
    g.connect(P.out);
    return g;
  }
  // o: a (attack), to/over (pitch glide), lp (lowpass Hz), hold, vib [Hz, depth Hz]
  function tone(P, type, f, t, end, peak, o) {
    o = o || {};
    var s = P.t + t, os = ctx.createOscillator();
    os.type = type;
    os.frequency.setValueAtTime(f * P.rate, s);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to * P.rate, s + o.over);
    var g = envGain(P, t, o.a || 0.005, peak, end, o.hold);
    if (o.lp) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = o.lp;
      os.connect(lp); lp.connect(g);
    } else os.connect(g);
    if (o.vib) {
      var l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(os.frequency);
      l.start(s); l.stop(s + end + 0.03);
    }
    os.start(s); os.stop(s + end + 0.03);
  }
  // Filtered noise burst. o: a, to/over (filter sweep), lin (linear sweep)
  function noise(P, t, end, peak, type, f, q, o) {
    o = o || {};
    var s = P.t + t, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f * P.rate, s);
    if (o.to) fl.frequency[o.lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](o.to * P.rate, s + o.over);
    var g = envGain(P, t, o.a || 0.004, peak, end);
    src.connect(fl); fl.connect(g);
    src.start(s, Math.random() * 0.5); src.stop(s + end + 0.03);
  }
  function place(P, t) {
    noise(P, t, 0.07, 0.9, 'bandpass', 900, 1.2);
    tone(P, 'sine', 140, t, 0.09, 0.5, { a: 0.003 });
  }

  var SOUNDS = {
    tap: function (P) { tone(P, 'sine', 1100, 0, 0.045, 0.25, { a: 0.003 }); },
    place: function (P) { place(P, 0); },
    flip: function (P) { noise(P, 0, 0.05, 0.4, 'highpass', 2500, 0.7, { to: 6000, over: 0.05, lin: 1, a: 0.005 }); },
    draw: function (P) { noise(P, 0, 0.14, 0.35, 'bandpass', 1200, 1.5, { to: 3200, over: 0.12, a: 0.01 }); },
    score: function (P) { tone(P, 'sine', 660, 0, 0.12, 0.22); tone(P, 'sine', 990, 0.06, 0.12, 0.22); },
    chime: function (P) { tone(P, 'triangle', 784, 0, 0.5, 0.18, { a: 0.01 }); tone(P, 'triangle', 1175, 0, 0.5, 0.18, { a: 0.01 }); },
    error: function (P) {
      tone(P, 'square', 220, 0, 0.06, 0.12, { lp: 900 });
      tone(P, 'square', 220, 0.1, 0.06, 0.12, { lp: 900 });
    },
    win: function (P) {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(P, 'triangle', f, i * 0.09, i === 3 ? 0.6 : 0.3, 0.2, { a: 0.008 }); });
    },
    end: function (P) { tone(P, 'triangle', 392, 0, 0.35, 0.22, { a: 0.008 }); tone(P, 'triangle', 330, 0.15, 0.35, 0.22, { a: 0.008 }); },
    dice: function (P) {
      var t = 0;
      for (var i = 0; i < 6; i++) { noise(P, t, 0.02, 0.5, 'bandpass', 1800, 2, { a: 0.002 }); t += 0.03 + Math.random() * 0.04; }
      place(P, t);
    },
    build: function (P) {
      tone(P, 'sine', 180, 0, 0.14, 0.5, { to: 120, over: 0.08, a: 0.003 });
      noise(P, 0, 0.03, 0.6, 'bandpass', 600, 2, { a: 0.002 });
    },
    clink: function (P) { tone(P, 'sine', 2600, 0, 0.18, 0.15, { a: 0.002 }); tone(P, 'sine', 3900, 0, 0.18, 0.15, { a: 0.002 }); },
    coin: function (P) { tone(P, 'sine', 1500, 0, 0.15, 0.15, { a: 0.003 }); tone(P, 'sine', 2250, 0.04, 0.15, 0.15, { a: 0.003 }); },
    thud: function (P) {
      tone(P, 'sine', 90, 0, 0.25, 0.6, { to: 55, over: 0.2, a: 0.004 });
      noise(P, 0, 0.2, 0.4, 'lowpass', 400, 0.7, { a: 0.004 });
    },
    swish: function (P) { noise(P, 0, 0.2, 0.3, 'bandpass', 800, 1.2, { to: 3000, over: 0.18, a: 0.02 }); },
    tick: function (P) { tone(P, 'sine', 1600, 0, 0.025, 0.15, { a: 0.002 }); },
    buzzer: function (P) { tone(P, 'sawtooth', 196, 0, 0.5, 0.18, { lp: 1200, a: 0.01, hold: 0.42, vib: [6, 4] }); }
  };
  var VARY = { place: 1, flip: 1, draw: 1, clink: 1 };            // random +-3% pitch
  var HAPTIC = { place: 10, error: [30, 40, 30], win: [20, 40, 20, 40, 60], buzzer: [200, 100, 200] };

  function sfx(name, o) {
    try {
      var fn = SOUNDS[name];
      if (!fn) return;
      var now = performance.now();
      if (now - (lastPlayed[name] || -1e9) < 40) return;   // same sound never retriggers within 40 ms
      lastPlayed[name] = now;
      if (document.hidden) return;
      o = o || {};
      var vol = typeof o.volume === 'number' && o.volume >= 0 ? o.volume : 1;
      // Haptics are automatic; quiet (bot) sounds do not buzz the phone.
      if (HAPTIC[name] && vol >= 1) buzz(HAPTIC[name]);
      if (!settings.sound || settings.volume <= 0 || !ctx || ctx.state !== 'running') return;
      var out = ctx.createGain();
      out.gain.value = vol;
      out.connect(master);
      fn({ t: ctx.currentTime + 0.003, out: out, rate: (o.rate > 0 ? o.rate : 1) * (VARY[name] ? 1 + (Math.random() * 0.06 - 0.03) : 1) });
    } catch (e) {}
  }
  function buzz(pattern) {
    try { if (settings.vibrate && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  /* ---------- wake lock ---------- */
  var wakeSentinel = null, wakePending = false;
  function syncWake() {
    try {
      if (!navigator.wakeLock) return;
      if (settings.wake && !document.hidden) {
        if (wakeSentinel || wakePending) return;
        wakePending = true;
        navigator.wakeLock.request('screen').then(function (s) {
          wakePending = false;
          if (!settings.wake) { s.release().catch(function () {}); return; }
          wakeSentinel = s;
          s.addEventListener('release', function () { if (wakeSentinel === s) wakeSentinel = null; });
        }, function () { wakePending = false; });
      } else if (!settings.wake && wakeSentinel) {
        var s2 = wakeSentinel; wakeSentinel = null;
        s2.release().catch(function () {});
      }
    } catch (e) { wakePending = false; }
  }

  /* ---------- styles ---------- */
  var CSS = `
button.hk-menu-btn.hk-menu-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;position:relative;width:44px;height:44px;min-width:44px;min-height:44px;margin:0;padding:0;border:1px solid rgba(128,128,128,.4);border-radius:12px;background:rgba(128,128,128,.16);color:inherit;font:600 16px/1 ${FONT};letter-spacing:normal;text-transform:none;text-shadow:none;transform:none;box-shadow:none;outline:0;filter:none;opacity:1;cursor:pointer;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button.hk-menu-btn.hk-menu-btn:hover{background:rgba(128,128,128,.28);border-color:rgba(128,128,128,.55);color:inherit;transform:none;box-shadow:none}
button.hk-menu-btn.hk-menu-btn:active{background:rgba(128,128,128,.38);border-color:rgba(128,128,128,.55);color:inherit;transform:none;box-shadow:none}
button.hk-menu-btn.hk-menu-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px;color:inherit;transform:none;box-shadow:none}
button.hk-menu-btn.hk-menu-btn svg{display:block;width:22px;height:22px;pointer-events:none}
button.hk-menu-btn.hk-menu-btn[hidden]{display:none}
#hubkit-root button.hk-menu-btn.hk-menu-btn.hk-float{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);right:calc(env(safe-area-inset-right,0px) + 10px);z-index:4000;color:var(--hk-text);background:var(--hk-float);border:1px solid var(--hk-line);box-shadow:0 2px 10px rgba(0,0,0,.25);transform:none}
#hubkit-root button.hk-menu-btn.hk-menu-btn.hk-float:hover{background:var(--hk-float);color:var(--hk-text);box-shadow:0 2px 10px rgba(0,0,0,.25);transform:none}
#hubkit-root button.hk-menu-btn.hk-menu-btn.hk-float:active{background:var(--hk-row-hover);color:var(--hk-text);box-shadow:0 2px 10px rgba(0,0,0,.25);transform:none}
#hubkit-root button.hk-menu-btn.hk-menu-btn.hk-float:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px;color:var(--hk-text);transform:none}
#hubkit-root{--hk-bg:#fff;--hk-text:#1b2230;--hk-muted:#5d6675;--hk-line:rgba(20,30,50,.14);--hk-row:#f0f2f6;--hk-row-hover:#e4e8ef;--hk-warn:#b3261e;--hk-warn-bg:#fbe9e7;--hk-off:#aab2bf;--hk-float:rgba(255,255,255,.9);--hk-dim:rgba(10,14,22,.45);--hk-accent:#f2b632;--hk-on-accent:#000;font:400 16px/1.4 ${FONT};color:var(--hk-text);-webkit-text-size-adjust:100%}
#hubkit-root[data-hk-scheme="dark"]{--hk-bg:#1a2030;--hk-text:#eef1f6;--hk-muted:#a3adbd;--hk-line:rgba(255,255,255,.14);--hk-row:#252d40;--hk-row-hover:#2f3950;--hk-warn:#ff9a90;--hk-warn-bg:#42262b;--hk-off:#566077;--hk-float:rgba(26,32,48,.88);--hk-dim:rgba(0,0,0,.6)}
#hubkit-root *,#hubkit-root *::before,#hubkit-root *::after{box-sizing:border-box}
#hubkit-root .hk-layer{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5000;display:flex;align-items:flex-end;justify-content:center}
#hubkit-root .hk-layer[hidden]{display:none}
#hubkit-root .hk-backdrop{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--hk-dim);animation:hk-fade .2s ease-out}
#hubkit-root .hk-sheet{position:relative;width:100%;max-height:calc(100vh - 16px);max-height:calc(100dvh - env(safe-area-inset-top,0px) - 16px);overflow-y:auto;overscroll-behavior:contain;background:var(--hk-bg);color:var(--hk-text);border-radius:20px 20px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 30px rgba(0,0,0,.3);outline:0;animation:hk-up .22s ease-out}
@media (min-width:700px){
  #hubkit-root .hk-layer{align-items:center}
  #hubkit-root .hk-sheet{width:420px;max-width:calc(100vw - 32px);border-radius:18px;padding-bottom:16px;box-shadow:0 12px 50px rgba(0,0,0,.4);animation:hk-pop .2s ease-out}
}
@keyframes hk-up{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes hk-pop{from{transform:scale(.98);opacity:0}to{transform:none;opacity:1}}
@keyframes hk-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){#hubkit-root .hk-sheet,#hubkit-root .hk-backdrop{animation:none}#hubkit-root .hk-toast{transition:none}}
#hubkit-root .hk-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}
#hubkit-root .hk-title{margin:0;padding:0;text-transform:none;letter-spacing:normal;font:700 19px/1.25 ${FONT};color:var(--hk-text);overflow-wrap:anywhere}
#hubkit-root button.hk-x,#hubkit-root button.hk-btn,#hubkit-root button.hk-row{appearance:none;-webkit-appearance:none;margin:0;font:inherit;color:var(--hk-text);text-align:left;text-transform:none;letter-spacing:normal;transform:none;box-shadow:none;outline:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#hubkit-root button.hk-x{flex:none;width:44px;height:44px;min-height:44px;min-width:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:transparent}
#hubkit-root button.hk-x svg{width:22px;height:22px;display:block}
#hubkit-root button.hk-x:hover,#hubkit-root button.hk-x:active{background:var(--hk-row-hover)}
#hubkit-root .hk-prim{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 6px}
#hubkit-root button.hk-btn{min-height:52px;padding:10px 12px;border:1px solid var(--hk-line);border-radius:14px;background:var(--hk-row);text-align:center;font-weight:650}
#hubkit-root button.hk-btn:hover,#hubkit-root button.hk-btn:active{background:var(--hk-row-hover);color:var(--hk-text)}
#hubkit-root button.hk-btn.hk-go{background:var(--hk-accent);border-color:transparent;color:var(--hk-on-accent)}
#hubkit-root button.hk-btn.hk-go:hover,#hubkit-root button.hk-btn.hk-go:active{background:var(--hk-accent);color:var(--hk-on-accent);filter:brightness(.93)}
#hubkit-root .hk-sec{margin:16px 0 6px;font:700 12px/1.2 ${FONT};letter-spacing:.07em;text-transform:uppercase;color:var(--hk-muted)}
#hubkit-root .hk-list{display:flex;flex-direction:column;gap:6px}
#hubkit-root button.hk-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:8px 14px;border:1px solid transparent;border-radius:12px;background:var(--hk-row)}
#hubkit-root button.hk-row:hover,#hubkit-root button.hk-row:active{background:var(--hk-row-hover);color:var(--hk-text)}
#hubkit-root button.hk-row.hk-warn,#hubkit-root button.hk-row.hk-warn:hover{background:var(--hk-warn-bg);border-color:var(--hk-warn);color:var(--hk-warn);font-weight:650}
#hubkit-root .hk-val{color:var(--hk-muted);text-align:right;flex:none}
#hubkit-root .hk-sw{position:relative;flex:none;width:46px;height:28px;border-radius:14px;background:var(--hk-off);transition:background .15s}
#hubkit-root .hk-sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s}
#hubkit-root [aria-checked="true"] .hk-sw{background:var(--hk-accent)}
#hubkit-root [aria-checked="true"] .hk-sw::after{transform:translateX(18px);background:var(--hk-on-accent)}
#hubkit-root .hk-vol{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 14px}
#hubkit-root .hk-vol .hk-lab{flex:none;width:62px;color:var(--hk-muted);font-size:15px}
#hubkit-root .hk-vol input{flex:1;min-width:0;height:44px;margin:0;accent-color:var(--hk-accent);cursor:pointer}
#hubkit-root .hk-vol input:disabled{opacity:.4;cursor:default}
#hubkit-root .hk-vol output{flex:none;width:30px;text-align:right;color:var(--hk-muted);font-variant-numeric:tabular-nums;font-size:15px}
#hubkit-root button:focus-visible,#hubkit-root input:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
#hubkit-root .hk-foot{margin:14px 2px 0;font-size:13px;line-height:1.45;color:var(--hk-muted)}
#hubkit-root .hk-foot+.hk-foot{margin-top:6px}
#hubkit-root .hk-you{display:flex;align-items:center;gap:10px;min-width:0}
#hubkit-root .hk-you .hk-nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hubkit-root .hk-you .hk-nm.hk-ph{color:var(--hk-muted)}
#hubkit-root .hk-dot{flex:none;width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(0,0,0,.18)}
#hubkit-root .hk-edit{padding:12px 14px;border-radius:12px;background:var(--hk-row);display:flex;flex-direction:column;gap:10px}
#hubkit-root .hk-edit label{display:flex;flex-direction:column;gap:4px;color:var(--hk-muted);font-size:13px}
#hubkit-root .hk-edit input.hk-in{width:100%;min-height:44px;margin:0;padding:8px 12px;border:1px solid var(--hk-line);border-radius:10px;background:var(--hk-bg);color:var(--hk-text);font:400 16px/1.3 ${FONT};-webkit-appearance:none;appearance:none}
#hubkit-root .hk-colors{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
#hubkit-root button.hk-col{appearance:none;-webkit-appearance:none;display:flex;align-items:center;justify-content:center;min-height:44px;padding:0;margin:0;border:2px solid transparent;border-radius:12px;background:transparent;cursor:pointer;transform:none;box-shadow:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#hubkit-root button.hk-col .hk-dot{width:28px;height:28px}
#hubkit-root button.hk-col[aria-checked="true"]{border-color:var(--hk-text)}
#hubkit-root .hk-edit .hk-prim{margin:0}
#hubkit-root .hk-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:5000;transform:translate(-50%,8px);padding:10px 18px;border-radius:999px;background:rgba(20,24,34,.94);color:#fff;font:500 15px/1.3 ${FONT};white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}
#hubkit-root .hk-toast.hk-show{opacity:1;transform:translate(-50%,0)}
`;

  /* ---------- theme ---------- */
  // Black or white text, whichever contrasts more with the accent (any CSS colour string).
  function onAccent(color) {
    try {
      var probe = document.createElement('span');
      probe.style.color = color;
      root.appendChild(probe);
      var m = getComputedStyle(probe).color.match(/[\d.]+/g);
      root.removeChild(probe);
      var c = m.slice(0, 3).map(function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      return 1.05 / (L + 0.05) > (L + 0.05) / 0.05 ? '#fff' : '#000';
    } catch (e) { return '#000'; }
  }
  function applyTheme() {
    if (!root) return;
    var dark = cfg.scheme === 'dark' || (cfg.scheme !== 'light' && !!mq && mq.matches);
    var a = cfg.accent;
    if (a && typeof a === 'object') a = dark ? (a.dark || a.light) : (a.light || a.dark);
    a = a || '#f2b632';
    root.setAttribute('data-hk-scheme', dark ? 'dark' : 'light');
    root.style.setProperty('--hk-accent', a);
    root.style.setProperty('--hk-on-accent', onAccent(a));
  }

  /* ---------- DOM ---------- */
  var ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 8h10M7 12h10M7 16h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function buttonHTML(extra) {
    mount();
    return '<button type="button" class="hk-menu-btn' + (extra ? ' ' + esc(extra) : '') +
      '" data-hubkit="menu" aria-label="Menu" aria-haspopup="dialog">' + ICON_MENU + '</button>';
  }

  var style;
  function mount() {
    if (!document.body) return;
    if (root && root.isConnected) return;
    if (!root) {
      style = document.createElement('style');
      style.id = 'hubkit-css';
      style.textContent = CSS;
      root = document.createElement('div');
      root.id = 'hubkit-root';
      root.innerHTML =
        '<div class="hk-layer" hidden><div class="hk-backdrop" data-hk-do="close"></div>' +
        '<div class="hk-sheet" role="dialog" aria-modal="true" aria-labelledby="hubkit-title" tabindex="-1"></div></div>' +
        buttonHTMLRaw('hk-float').replace('<button ', '<button hidden ') +
        '<div class="hk-toast" role="status" aria-live="polite"></div>';
      layer = root.firstChild;
      sheet = layer.lastChild;
      floatBtn = root.querySelector('.hk-float');
      toastEl = root.lastChild;
      root.addEventListener('click', onRootClick);
      root.addEventListener('input', onRootInput);
    }
    document.body.appendChild(style);
    document.body.appendChild(root);
    floatBtn.hidden = !cfg.floating;
    applyTheme();
  }
  function buttonHTMLRaw(extra) {
    return '<button type="button" class="hk-menu-btn ' + extra + '" data-hubkit="menu" aria-label="Menu" aria-haspopup="dialog">' + ICON_MENU + '</button>';
  }

  function toggleRow(id, attrs, label, on) {
    return '<button type="button" class="hk-row" role="switch" aria-checked="' + !!on + '" data-hk-id="' + id + '" ' + attrs +
      '><span>' + label + '</span><span class="hk-sw"></span></button>';
  }

  function youHTML() {
    var p = profile();
    if (!editing) {
      return '<button type="button" class="hk-row" data-hk-do="you" data-hk-id="you"><span class="hk-you"><i class="hk-dot" style="background:' + p.color +
        '"></i><span class="hk-nm' + (p.name ? '' : ' hk-ph') + '">' + esc(p.name || 'Set your name') + '</span></span><span class="hk-val">You</span></button>';
    }
    var d = draft || p, sw = '';
    COLORS.forEach(function (c, i) {
      sw += '<button type="button" class="hk-col" role="radio" aria-checked="' + (c === d.color) + '" aria-label="Colour ' + (i + 1) +
        '" data-hk-color="' + c + '" data-hk-id="c' + i + '"><i class="hk-dot" style="background:' + c + '"></i></button>';
    });
    return '<div class="hk-edit"><label>Your name<input class="hk-in" type="text" maxlength="16" autocomplete="nickname" autocapitalize="words" spellcheck="false" data-hk-name data-hk-id="name" value="' +
      esc(d.name) + '"></label><div class="hk-colors" role="radiogroup" aria-label="Your colour">' + sw + '</div>' +
      '<div class="hk-prim"><button type="button" class="hk-btn" data-hk-do="you-cancel" data-hk-id="ycancel">Cancel</button>' +
      '<button type="button" class="hk-btn hk-go" data-hk-do="you-save" data-hk-id="ysave">Save</button></div></div>';
  }
  function saveYou() {
    if (!editing) return;
    var d = draft || profile();
    editing = false; draft = null;
    setProfile({ name: d.name, color: d.color });
    var row = sheet && sheet.querySelector('[data-hk-id="you"]');
    if (row) row.focus({ preventScroll: true });
    toast('Saved');
  }

  function render() {
    if (!sheet) return;
    var active = document.activeElement, fid = active && sheet.contains(active) ? active.getAttribute('data-hk-id') : null;
    var top = sheet.scrollTop, items = [];
    try { items = (typeof cfg.items === 'function' ? cfg.items() : cfg.items) || []; } catch (e) { items = []; }
    cur = Array.isArray(items) ? items.filter(Boolean) : [];
    if (armed >= cur.length) clearArm();
    var isHub = cfg.id === 'hub';
    var h = '<div class="hk-head"><h2 class="hk-title" id="hubkit-title">' + esc(cfg.name) + '</h2>' +
      '<button type="button" class="hk-x" data-hk-do="close" data-hk-id="x" aria-label="Close">' + ICON_X + '</button></div>';
    if (!isHub) {
      h += '<div class="hk-prim"><button type="button" class="hk-btn hk-go" data-hk-do="close" data-hk-id="resume">Resume</button>' +
        '<button type="button" class="hk-btn" data-hk-do="hub" data-hk-id="hub">All games</button></div>';
    }
    if (cur.length) {
      h += '<h3 class="hk-sec">This game</h3><div class="hk-list">';
      cur.forEach(function (it, i) {
        var id = 'i' + i, a = 'data-hk-item="' + i + '"', label = esc(it.label);
        if (it.toggle) h += toggleRow(id, a, label, it.checked);
        else if (it.value != null) h += '<button type="button" class="hk-row" data-hk-id="' + id + '" ' + a + '><span>' + label + '</span><span class="hk-val">' + esc(it.value) + '</span></button>';
        else if (it.confirm && armed === i) h += '<button type="button" class="hk-row hk-warn" data-hk-id="' + id + '" ' + a + '><span>' + esc(it.confirm) + '</span></button>';
        else h += '<button type="button" class="hk-row" data-hk-id="' + id + '" ' + a + '><span>' + label + '</span></button>';
      });
      h += '</div>';
    }
    h += '<h3 class="hk-sec">Settings</h3><div class="hk-list">' + youHTML() + toggleRow('sound', 'data-hk-set="sound"', 'Sound', settings.sound) +
      '<label class="hk-vol"><span class="hk-lab">Volume</span><input type="range" min="0" max="100" step="5" data-hk-vol data-hk-id="vol" aria-label="Volume" value="' +
      Math.round(settings.volume * 100) + '"' + (settings.sound ? '' : ' disabled') + '><output>' + Math.round(settings.volume * 100) + '</output></label>';
    if (navigator.vibrate) h += toggleRow('vibrate', 'data-hk-set="vibrate"', 'Vibration', settings.vibrate);
    if (navigator.wakeLock) h += toggleRow('wake', 'data-hk-set="wake"', 'Keep screen awake', settings.wake);
    h += '</div><p class="hk-foot">Settings apply to every game.</p>';
    if (isHub) {
      h += '<p class="hk-foot">Add to your home screen: in Safari tap Share, then Add to Home Screen.</p>' +
        '<p class="hk-foot">On iPhone, games saved in Safari and in the home-screen app are kept separately.</p>';
    }
    sheet.innerHTML = h;
    sheet.scrollTop = top;
    var again = fid && sheet.querySelector('[data-hk-id="' + fid + '"]');
    if (again) again.focus({ preventScroll: true });
    else if (fid) sheet.focus({ preventScroll: true });
  }

  function arm(i) {
    clearArm();
    armed = i;
    armTimer = setTimeout(function () { armed = -1; if (isOpenNow) render(); }, 4000);
    render();
  }
  function clearArm() { clearTimeout(armTimer); armed = -1; }

  function onRootClick(e) {
    var t = e.target.closest && e.target.closest('[data-hk-do],[data-hk-item],[data-hk-set],[data-hk-color]');
    if (!t || !root.contains(t)) return;
    var d = t.getAttribute('data-hk-do');
    if (d === 'close') close();
    else if (d === 'you') { editing = true; draft = profile(); render(); var ni = sheet.querySelector('[data-hk-name]'); if (ni) ni.focus(); }
    else if (d === 'you-cancel') { editing = false; draft = null; render(); }
    else if (d === 'you-save') saveYou();
    else if (t.hasAttribute('data-hk-color')) { if (draft) draft.color = t.getAttribute('data-hk-color'); render(); }
    else if (d === 'hub') { call(cfg.onLeave); location.href = HUB_URL; }
    else if (t.hasAttribute('data-hk-item')) onItem(+t.getAttribute('data-hk-item'));
    else if (t.hasAttribute('data-hk-set')) {
      var k = t.getAttribute('data-hk-set');
      settings[k] = !settings[k];
      save();
      applySettings();
      if (k === 'sound' && settings.sound) sfx('tap');
      if (k === 'vibrate' && settings.vibrate) buzz(15);
    }
  }

  function onItem(i) {
    var it = cur[i];
    if (!it) return;
    if (it.toggle) { call(it.onSelect, !it.checked); render(); }            // stays open
    else if (it.value != null) { call(it.onSelect); render(); }             // stays open
    else if (it.confirm && armed !== i) arm(i);                             // first tap of a confirm
    else { clearArm(); close(); call(it.onSelect); }                        // plain, or confirmed
  }

  function onRootInput(e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-hk-name')) { if (draft) draft.name = e.target.value; return; }
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-hk-vol')) return;
    settings.volume = Math.min(1, Math.max(0, Math.round(+e.target.value / 5) * 5 / 100));
    save();
    if (master) master.gain.value = settings.volume;
    var out = e.target.parentNode.querySelector('output');
    if (out) out.textContent = Math.round(settings.volume * 100);
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { sfx('tap'); }, 120);
  }

  /* ---------- open / close ---------- */
  function open() {
    mount();
    if (!root || isOpenNow) return;
    applyTheme();
    isOpenNow = true;
    layer.hidden = false;
    render();
    sheet.focus({ preventScroll: true });
    call(cfg.onOpen);
  }
  function close() {
    if (!isOpenNow) return;
    isOpenNow = false;
    editing = false; draft = null;
    clearArm();
    layer.hidden = true;
    // The game may have re-rendered its header while the sheet was open: find the live button.
    var all = document.querySelectorAll('[data-hubkit="menu"]');
    for (var i = 0; i < all.length; i++) {
      if (shown(all[i])) { all[i].focus({ preventScroll: true }); break; }
    }
    call(cfg.onClose);
  }

  function setFloating(on) {
    cfg.floating = !!on;
    if (floatBtn) floatBtn.hidden = !cfg.floating;
  }

  /* ---------- toast + keyboard ---------- */
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('hk-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('hk-show'); }, 1200);
  }

  function focusables() {
    return Array.prototype.filter.call(sheet.querySelectorAll('button,input'), function (n) { return !n.disabled && shown(n); });
  }

  window.addEventListener('keydown', function (e) {
    if (isOpenNow) {
      // Nothing behind the sheet may react to keys (game shortcuts, Ctrl+Z, ...).
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && editing && e.target && e.target.hasAttribute && e.target.hasAttribute('data-hk-name')) { e.preventDefault(); saveYou(); }
      else if (e.key === 'Tab') {
        var f = focusables(), a = document.activeElement;
        if (!f.length) { e.preventDefault(); return; }
        var inside = sheet.contains(a) && a !== sheet;
        if (e.shiftKey && (!inside || a === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (!inside ? true : a === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
      var t = e.target, ae = document.activeElement;
      var typing = function (n) { return !!n && n.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable); };
      if (typing(t) || typing(ae)) return;
      settings.sound = !settings.sound;
      save();
      applySettings();
      toast(settings.sound ? 'Sound on' : 'Sound off');
      if (settings.sound) sfx('tap');
    }
  }, true);

  // Keep focus inside the sheet while it is open.
  document.addEventListener('focusin', function (e) {
    if (isOpenNow && sheet && !sheet.contains(e.target)) {
      var f = focusables();
      (f[0] || sheet).focus({ preventScroll: true });
    }
  }, true);

  // Delegated, so the button survives the games re-rendering their HTML.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-hubkit="menu"]');
    if (b) { e.preventDefault(); open(); }
  }, true);

  /* ---------- lifecycle ---------- */
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', function () { load(); applySettings(); });
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) { load(); applySettings(); }
    if ((e.key === PKEY || e.key === null) && isOpenNow && !editing) render();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    try { if (ctx && ctx.state !== 'running') ctx.resume().catch(function () {}); } catch (e) {}  // Safari may leave it 'interrupted'
    syncWake();
  });

  function registerSW() {
    try {
      var h = location.hostname;
      var secure = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
      if (!secure || !('serviceWorker' in navigator) || !HUB_URL || HUB_URL.indexOf(location.origin) !== 0) return;
      navigator.serviceWorker.register(HUB_URL + 'sw.js', { scope: HUB_URL }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- public API ---------- */
  var api = {
    init: function (o) {
      cfg = Object.assign({ id: '', name: 'Menu', accent: null, scheme: 'auto', floating: false, items: null }, o || {});
      mount();
      applyTheme();
      setFloating(cfg.floating);
      syncWake();
      if (isOpenNow) render();
    },
    buttonHTML: buttonHTML,
    open: open,
    close: close,
    isOpen: function () { return isOpenNow; },
    sfx: sfx,
    buzz: buzz,
    refresh: function () { if (isOpenNow) render(); },
    setFloating: setFloating,
    profile: profile,
    setProfile: setProfile,
    recordResult: recordResult,
    setBadge: setBadge
  };
  Object.defineProperty(api, 'settings', {
    enumerable: true,
    get: function () { return Object.freeze({ sound: settings.sound, volume: settings.volume, vibrate: settings.vibrate, wake: settings.wake }); }
  });
  window.HubKit = api;

  load();
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  } catch (e) {}
  mount();
  if (document.readyState === 'loading') {
    // Move our nodes to the very end of <body> once parsing is done.
    document.addEventListener('DOMContentLoaded', function () {
      if (root) { document.body.appendChild(style); document.body.appendChild(root); } else mount();
    });
  }
  if (document.readyState === 'complete') registerSW(); else window.addEventListener('load', registerSW);
})();
