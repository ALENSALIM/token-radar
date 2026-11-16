// Token Radar's console dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, and the live-token comparables the multiples come from.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // multiple: the category's median market-cap / TVL among live-token protocols (or the overall
  // median when the category has too few comparables); growth: rises count half, falls count three
  // quarters; maturity: age over five years; chains: 3% per extra chain, up to five.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var weight = growth >= 0 ? model.growth_up_weight : model.growth_down_weight;
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + model.chain_step * Math.min(Math.max(chains - 1, 0), model.chain_max_bonus);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the weekly move, the hold, the risk note and every cost and time. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('basis') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + " of USDC onto " + name + "'s chain and use it in one app there.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the deposit on ' + name + ' and repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('basis') >= 0) return 'Swap $25 through ' + name + "'s main pool on " + chain + ' once a week.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 of USDC through ' + name + ' once a week.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Claim the week's staking rewards on " + name + ' and restake them.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small hedge on ' + name + ' each week.';
    if (c.indexOf('prediction') >= 0) return 'Place one small market position on ' + name + ' each week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Move $' + Math.max(10, Math.round(capital / 5)) + ' between two ' + name + ' vaults once a week.';
    if (c.indexOf('stable') >= 0) return 'Mint or redeem $10 of the stable asset through ' + name + ' once a week.';
    if (c.indexOf('rwa') >= 0) return "Claim the week's yield on " + name + ' and hold it in the same wallet.';
    if (c.indexOf('insurance') >= 0) return "Check the policy's coverage on " + name + ' once a week and keep it active.';
    if (c.indexOf('yield') >= 0) return "Claim the week's yield on " + name + ' and deposit it back into the vault.';
    if (c.indexOf('payment') >= 0) return 'Send one small payment through ' + name + ' each week.';
    if (c.indexOf('chain') >= 0) return 'Use one app on ' + name + "'s chain each week from the same wallet.";
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function riskNoteFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'A borrow can be liquidated if the collateral falls, so keep the loan well below the limit.';
    if (c.indexOf('dex') >= 0 || c.indexOf('basis') >= 0) return 'A liquidity position can lose to price moves, so size it so a bad week does not hurt.';
    if (c.indexOf('bridge') >= 0) return 'A bridge moves funds across chains, so test it with $10 before you move the full amount.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Staked funds can be locked or slashed, so read the unlock time before you stake.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Leverage can wipe margin fast, so keep the hedge small and never add to a losing one.';
    if (c.indexOf('prediction') >= 0) return 'A market position can go to zero, so treat the weekly stake as a cost, not an investment.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return "A vault follows its curator's strategy, so read what it holds before you deposit.";
    if (c.indexOf('stable') >= 0) return 'A stable asset is only as good as its backing, so read the latest attestation before you mint.';
    if (c.indexOf('rwa') >= 0) return 'A yield asset is only as good as its backing, so read the latest attestation before you mint.';
    if (c.indexOf('insurance') >= 0) return 'Cover pays only what the policy names, so read the exclusions before you buy.';
    if (c.indexOf('yield') >= 0) return 'A quoted yield can fall when the vault fills, so check the rate before each deposit.';
    if (c.indexOf('payment') >= 0) return 'Payments are final once sent, so send $1 to a new address before the full amount.';
    if (c.indexOf('chain') >= 0) return 'A new chain can halt or reorg, so never keep more there than you can afford to lose.';
    return 'A protocol can change its rules, so check its own page before every deposit.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyActionFor(p, capital, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: riskNoteFor(p), cost: 'nothing to read, and it can save the position', time: '10 minutes' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function headCell(label, key) {
    var th = document.createElement('th');
    th.setAttribute('scope', 'col');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label + (state.sort === key ? (state.dir === -1 ? ' \u25bc' : ' \u25b2') : '');
    btn.setAttribute('aria-label', 'Sort by ' + label);
    btn.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      render();
    });
    th.appendChild(btn);
    return th;
  }
  function numCell(text, className) {
    var td = document.createElement('td');
    td.className = className || 'num';
    td.textContent = text;
    return td;
  }

  function renderBoardRows(tbody, list) {
    list.forEach(function (row) {
      var tr = document.createElement('tr');
      if (state.selected === row.slug) tr.setAttribute('data-selected', 'true');
      tr.addEventListener('click', function () { state.selected = row.slug; writeHash(); render(); });
      tr.appendChild(numCell(String(row.rank), 'num rank-num'));
      var nameTd = document.createElement('td');
      var nameDiv = document.createElement('div');
      nameDiv.className = 'name';
      nameDiv.appendChild(el('b', null, row.name));
      nameDiv.appendChild(el('span', { class: 'sub' }, row.category || 'Other', ' \u00b7 ', (row.chains || []).slice(0, 3).join(', ')));
      nameTd.appendChild(nameDiv);
      tr.appendChild(nameTd);
      tr.appendChild(numCell(fmtUsd(row.tvl_usd)));
      var gTd = document.createElement('td');
      var gSpan = el('span', { class: 'num ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg') }, fmtPct(row.change_7d));
      gTd.appendChild(gSpan);
      tr.appendChild(gTd);
      tr.appendChild(numCell(fmtAge(row.age_days)));
      var impTd = document.createElement('td');
      var impDiv = document.createElement('div');
      impDiv.className = 'implied';
      var bar = el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.round(100 * row.implied_value_usd / DATA.rows[0].implied_value_usd) + '%' }));
      bar.setAttribute('aria-hidden', 'true');
      impDiv.appendChild(bar);
      impDiv.appendChild(el('span', { class: 'num' }, fmtUsd(row.implied_value_usd)));
      impTd.appendChild(impDiv);
      tr.appendChild(impTd);
      var stTd = document.createElement('td');
      stTd.appendChild(el('span', { class: 'status' }, 'Pre-token'));
      tr.appendChild(stTd);
      tbody.appendChild(tr);
    });
  }

  function renderLiveRows(tbody) {
    DATA.live.forEach(function (row, i) {
      var tr = document.createElement('tr');
      tr.appendChild(numCell(String(i + 1), 'num rank-num'));
      var nameTd = document.createElement('td');
      var nameDiv = document.createElement('div');
      nameDiv.className = 'name';
      nameDiv.appendChild(el('b', null, row.name));
      nameDiv.appendChild(el('span', { class: 'sub' }, row.category || 'Other', ' \u00b7 ', (row.chains || []).slice(0, 3).join(', ')));
      nameTd.appendChild(nameDiv);
      tr.appendChild(nameTd);
      tr.appendChild(numCell(fmtUsd(row.tvl_usd)));
      var gTd = document.createElement('td');
      var gSpan = el('span', { class: 'num ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg') }, fmtPct(row.change_7d));
      gTd.appendChild(gSpan);
      tr.appendChild(gTd);
      tr.appendChild(numCell(''));
      var mTd = document.createElement('td');
      mTd.appendChild(el('span', { class: 'num' }, fmtUsd(row.mcap_usd)));
      tr.appendChild(mTd);
      var mtTd = document.createElement('td');
      mtTd.appendChild(el('span', { class: 'num' }, fmtMult(row.mcap_tvl)));
      tr.appendChild(mtTd);
      tbody.appendChild(tr);
    });
  }

  function renderModelPanel() {
    var model = DATA.model;
    var m = model;
    var section = el('section', { class: 'panel model', 'aria-label': 'How the ranking is computed' },
      el('h2', null, 'How the ranking is computed'),
      el('p', { class: 'note' }, 'The same four factors score every row. The category multiple is the median market-cap / TVL of the live-token protocols in that category, computed from this snapshot; a category with fewer than ' + model.min_comparables + ' live comparables uses the overall median instead. A launch is worth less than a TVL multiple alone says when a protocol is shrinking, young or on one chain, and more when it is growing.'),
      el('div', { class: 'formula' }, el('b', null, 'implied value'), ' = TVL \u00d7 category multiple \u00d7 growth multiplier \u00d7 maturity multiplier \u00d7 chain multiplier'),
      el('div', { class: 'formula' }, 'growth multiplier = 1 + clamp(change_7d, \u2212' + model.growth_floor + ', ' + model.growth_cap + ') \u00d7 ' + model.growth_up_weight + ' (rise) or \u00d7 ' + model.growth_down_weight + ' (fall)'),
      el('div', { class: 'formula' }, 'maturity multiplier = ' + model.maturity_floor + ' + min(age_days, ' + model.maturity_days + ') \u00f7 ' + model.maturity_days + ' \u00d7 ' + model.maturity_range + ' (unknown age = ' + model.unknown_age_days + ' days)'),
      el('div', { class: 'formula' }, 'chain multiplier = 1 + ' + model.chain_step + ' \u00d7 min(chains \u2212 1, ' + model.chain_max_bonus + ')'),
      el('h3', null, 'Comparables: every category\u2019s median, computed from this snapshot'),
      (function () {
        var wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        var table = document.createElement('table');
        table.className = 'compact';
        var thead = document.createElement('thead');
        var tr = document.createElement('tr');
        ['Category', 'Live comparables', 'Median mcap / TVL', 'Multiple used'].forEach(function (h) {
          var th = document.createElement('th');
          th.setAttribute('scope', 'col');
          th.textContent = h;
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        var tbody = document.createElement('tbody');
        DATA.comparables.forEach(function (c) {
          var row = document.createElement('tr');
          row.appendChild(el('td', null, c.category));
          row.appendChild(numCell(String(c.comparables)));
          row.appendChild(numCell(fmtMult(c.median_multiple)));
          row.appendChild(numCell(fmtMult(c.used_multiple) + (c.fallback ? ' (overall)' : '')));
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
      })(),
      el('p', { class: 'note' }, 'Bridges, canonical bridges, liquid staking and restaking, restaked BTC and CEX are left out: their value is a wrapped or bridged form of a token that already trades. A name ending in a release, one carrying wrapped, staked or staking, or one starting with an exchange name is left out for the same reason.'),
      el('p', { class: 'note' }, 'This board is a ranking of what a launch could be worth on the snapshot\u2019s own figures. It is not a prediction that a token will launch, or at any price.'));
    return section;
  }

  function renderDetail() {
    var dialog = document.createElement('dialog');
    dialog.className = 'detail';
    var row = DATA.rows.find(function (r) { return r.slug === state.selected; });
    if (!row) return dialog;
    var computed = impliedOf(row, DATA.model);
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'sub' }, 'Rank #' + row.rank + ' \u00b7 ' + (row.category || 'Other') + ' \u00b7 ' + (row.chains || []).slice(0, 3).join(', ')),
        el('h2', null, row.name),
        el('p', { class: 'sub' }, 'Pre-token \u00b7 ' + fmtUsd(row.tvl_usd) + ' TVL \u00b7 ' + fmtPct(row.change_7d) + ' 7d \u00b7 listed ' + fmtAge(row.age_days) + ' ago')),
      el('button', { type: 'button', class: 'close', onclick: function () { closeDetail(); } }, 'Close \u00d7'));
    dialog.appendChild(head);

    var model = DATA.model;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var breakdown = el('section', { class: 'detail-section' },
      el('h3', null, 'What the model says'),
      el('div', { class: 'equation' },
        el('div', null, el('span', null, 'TVL'), el('b', null, fmtUsd(row.tvl_usd))),
        el('div', null, el('span', null, 'Category multiple (' + (row.category || 'Other') + ', ' + row.comparables + ' comparables' + (row.fallback_multiple ? ', overall fallback' : '') + ')'), el('b', null, fmtMult(row.category_multiple))),
        el('div', null, el('span', null, 'Growth multiplier (' + fmtPct(growth) + ' 7d)'), el('b', null, fmtMult(row.growth_multiplier))),
        el('div', null, el('span', null, 'Maturity multiplier (' + fmtAge(row.age_days) + ')'), el('b', null, fmtMult(row.maturity_multiplier))),
        el('div', null, el('span', null, 'Chain multiplier (' + (row.chains ? row.chains.length : 0) + ' chain' + ((row.chains ? row.chains.length : 0) === 1 ? '' : 's') + ')'), el('b', null, fmtMult(row.chain_multiplier))),
        el('div', null, el('span', null, 'Implied value'), el('b', null, fmtUsd(row.implied_value_usd)))),
      el('p', { class: 'why' }, computed === row.implied_value_usd ? 'Recomputed from the snapshot figures on this page: ' + fmtUsd(computed) + '. The page and the board agree.' : 'The page recomputes ' + fmtUsd(computed) + ' from the snapshot figures; the board carries ' + fmtUsd(row.implied_value_usd) + '.'));
    dialog.appendChild(breakdown);

    var why = el('section', { class: 'detail-section' },
      el('h3', null, 'Why this rank'),
      el('p', { class: 'why' }, row.name + ' is rank #' + row.rank + ' of ' + DATA.rows.length + ' because its ' + fmtUsd(row.tvl_usd) + ' TVL times its ' + fmtMult(row.category_multiple) + ' category multiple is ' + fmtUsd(Math.round(row.tvl_usd * row.category_multiple)) + ', and the growth, maturity and chain factors multiply it by ' + (row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier).toFixed(2) + '\u00d7 to ' + fmtUsd(row.implied_value_usd) + '. It has no token, no CoinGecko entry and no symbol in the snapshot, and its name carries no wrapped, staked or version marker.'));
    dialog.appendChild(why);

    var steps = farmSteps(row);
    var farm = el('section', { class: 'detail-section' },
      el('h3', null, 'How to farm it'),
      (function () {
        var ol = document.createElement('ol');
        ol.className = 'steps';
        steps.forEach(function (s) {
          var li = document.createElement('li');
          var parts = s.split(' Cost: ');
          var costTime = parts.length > 1 ? parts[1] : '';
          var ct = costTime.split(' Time: ');
          li.appendChild(el('b', null, parts[0]));
          li.appendChild(el('span', { class: 'cost' }, 'Cost: ' + (ct[0] || '') + ' \u00b7 Time: ' + (ct[1] ? ct[1].replace(/\.$/, '') : '')));
          ol.appendChild(li);
        });
        return ol;
      })(),
      el('p', { class: 'note' }, 'Steps are derived from this protocol\u2019s category, chains, TVL and age, not written by hand. Farming is a position with real capital at risk; a token is not promised.'));
    dialog.appendChild(farm);

    var close = el('button', { type: 'button', class: 'button primary', onclick: function () { closeDetail(); } }, 'Close');
    close.style.marginTop = '24px';
    dialog.appendChild(close);
    return dialog;
  }

  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function render() {
    var list = sortedRows(rows());
    var shown = state.tab === 'pre-token' ? list : null;
    var dialog = renderDetail();
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    var top = el('div', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name' }, 'Token Radar')),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', null, DATA.as_of)),
        el('span', null, 'Source ', el('b', null, DATA.source)),
        el('span', null, 'Model ', el('b', null, DATA.model_version))));
    shell.appendChild(top);

    var topRow = DATA.rows[0];
    var lede = el('div', { class: 'lede' },
      el('div', null,
        el('h1', null, 'The launch radar: pre-token protocols, ranked by what their token would be worth'),
        el('p', null, 'This board reads the whole DefiLlama snapshot from ', el('b', null, DATA.as_of), ', keeps the protocols that still record no token, and ranks them by implied value: TVL times the market\u2019s own price for their kind of protocol. Every row is a name, a number and a farm plan \u2014 nothing is a guess.')),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', null, 'Pre-token protocols ranked'), el('b', null, String(DATA.rows.length))),
        el('div', { class: 'fact' }, el('span', null, 'On the watchlist'), el('b', null, String(DATA.watchlist_size))),
        el('div', { class: 'fact' }, el('span', null, 'Early finds below the floor'), el('b', null, String(DATA.early_size))),
        el('div', { class: 'fact' }, el('span', null, 'Live-token protocols set aside'), el('b', null, String(DATA.live_size))),
        el('div', { class: 'fact' }, el('span', null, 'Overall median mcap / TVL'), el('b', null, fmtMult(DATA.overall_multiple))),
        el('div', { class: 'fact leader' }, el('span', { class: 'rank-1' }, '#1'), el('b', null, topRow ? topRow.name + ' \u00b7 ' + fmtUsd(topRow.implied_value_usd) : ''))));
    shell.appendChild(lede);

    var controls = el('div', { class: 'controls' });
    var searchField = el('div', { class: 'field' },
      el('label', { for: 'q' }, 'Search'),
      el('input', { id: 'q', type: 'search', placeholder: 'Name, slug, category or chain', value: state.q, oninput: function (e) { state.q = e.target.value; writeHash(); render(); } }));
    controls.appendChild(searchField);
    var categories = [];
    DATA.rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category); });
    categories.sort();
    var select = el('select', { id: 'cat', onchange: function (e) { state.category = e.target.value; writeHash(); render(); } });
    select.appendChild(el('option', { value: 'all' }, 'All categories'));
    categories.forEach(function (c) {
      var opt = el('option', { value: c }, c + ' (' + DATA.rows.filter(function (r) { return r.category === c; }).length + ')');
      if (state.category === c) opt.selected = true;
      select.appendChild(opt);
    });
    controls.appendChild(el('div', { class: 'field' }, el('label', { for: 'cat' }, 'Category'), select));
    var tabs = el('div', { class: 'tabs' });
    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } }, 'Pre-token (' + DATA.rows.length + ')');
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', onclick: function () { state.tab = 'live'; writeHash(); render(); } }, 'Live token (' + DATA.live_size + ')');
    tabs.appendChild(preBtn);
    tabs.appendChild(liveBtn);
    controls.appendChild(tabs);
    controls.appendChild(el('span', { class: 'count' }, state.tab === 'pre-token' ? list.length + ' of ' + DATA.rows.length + ' pre-token rows' : DATA.live.length + ' live-token rows'));
    shell.appendChild(controls);

    var panel = el('section', { class: 'panel', 'aria-label': state.tab === 'pre-token' ? 'Ranked board' : 'Live token protocols' });
    var wrap = el('div', { class: 'table-wrap' });
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    if (state.tab === 'pre-token') {
      headRow.appendChild(headCell('#', 'implied'));
      headRow.appendChild(headCell('Protocol', 'name'));
      headRow.appendChild(headCell('TVL', 'tvl'));
      headRow.appendChild(headCell('7d', 'growth'));
      headRow.appendChild(headCell('Age', 'age'));
      headRow.appendChild(headCell('Implied value', 'implied'));
      var st = document.createElement('th');
      st.setAttribute('scope', 'col');
      st.textContent = 'Token status';
      headRow.appendChild(st);
    } else {
      ['#', 'Protocol', 'TVL', '7d', 'Age', 'Market cap', 'Mcap / TVL'].forEach(function (h) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = h;
        headRow.appendChild(th);
      });
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    if (state.tab === 'pre-token') {
      if (list.length === 0) {
        panel.appendChild(el('div', { class: 'empty' },
          el('h2', null, 'No protocol matches that filter'),
          el('p', null, 'Try another name or a different category.'),
          el('button', { type: 'button', class: 'button', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } }, 'Clear search and category')));
      } else renderBoardRows(tbody, list);
    } else renderLiveRows(tbody);
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    shell.appendChild(panel);
    shell.appendChild(renderModelPanel());
    app.appendChild(shell);
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    if (state.selected && DATA.rows.some(function (r) { return r.slug === state.selected; })) dialog.showModal();
  }

  window.addEventListener('hashchange', function () {
    readHash();
    render();
  });
  readHash();
  render();
})();
