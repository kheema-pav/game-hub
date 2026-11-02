/* Small hub panels; strings from saved games are always text, never markup. */
(function () {
  'use strict';
  var night = window.HubGameNight, active = document.getElementById('savedTables'), results = document.getElementById('recentResults');
  if (!night || !active || !results) return;
  function node(tag, className, text) { var n = document.createElement(tag); n.className = className || ''; if (text != null) n.textContent = text; return n; }
  function refresh() {
    active.replaceChildren();
    var tables = night.active(); active.hidden = !tables.length;
    if (tables.length) {
      active.appendChild(node('h2', '', 'Pick up where you left off'));
      var links = node('div', 'night-tables');
      tables.forEach(function (table) {
        var link = node('a', 'night-table'); link.href = table.href;
        link.appendChild(node('strong', '', 'Continue ' + night.titles[table.game]));
        link.appendChild(node('small', '', table.description)); links.appendChild(link);
      });
      active.appendChild(links);
    }
    var wasOpen = results.open;
    results.replaceChildren(); results.open = wasOpen;
    var rows = night.list();
    results.appendChild(node('summary', '', 'Recent results' + (rows.length ? ' (' + rows.length + ')' : '')));
    results.appendChild(node('p', 'night-muted', 'The last 50 completed solo and same-device games in this browser. Clearing browser data removes them.'));
    if (!rows.length) { results.appendChild(node('p', '', 'Finish a game to start your history.')); return; }
    var list = node('ol', 'night-results');
    rows.forEach(function (row) {
      var item = node('li'), winners = row.winners.map(function (i) { return row.players[i].name; });
      item.appendChild(node('strong', '', night.titles[row.game] + ' · ' + (winners.length ? winners.join(' & ') + (winners.length === 1 ? winners[0] === 'You' ? ' win' : ' wins' : ' share the win') : 'Draw')));
      item.appendChild(node('span', '', row.players.map(function (p) { return p.name + (p.score === null ? '' : ': ' + p.score); }).join(' · ')));
      item.appendChild(node('small', 'night-muted', [night.date(row.finishedAt), row.mode === 'solo' ? 'Solo' : 'Same device', row.level ? row.level[0].toUpperCase() + row.level.slice(1) + ' bots' : '', row.summary].filter(Boolean).join(' · ')));
      list.appendChild(item);
    });
    results.appendChild(list);
    var controls = node('div', 'night-controls'), clear = node('button', '', 'Clear results history'), cancel = node('button', '', 'Cancel'), status = node('span', 'night-muted');
    clear.type = cancel.type = 'button'; cancel.hidden = true; status.setAttribute('role', 'status');
    clear.addEventListener('click', function () {
      if (cancel.hidden) { clear.textContent = 'Confirm clear history'; cancel.hidden = false; status.textContent = 'Saved games will be kept.'; return; }
      if (night.clear()) refresh(); else status.textContent = 'This browser could not clear the results. Try again.';
    });
    cancel.addEventListener('click', function () { clear.textContent = 'Clear results history'; cancel.hidden = true; status.textContent = ''; });
    controls.appendChild(clear); controls.appendChild(cancel); controls.appendChild(status); results.appendChild(controls);
  }
  refresh(); window.addEventListener('pageshow', refresh); window.addEventListener('storage', refresh);
})();
