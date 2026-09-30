/*! scent-quiz engine v1 - brand-agnostic. All text, images and products come from the config JSON asset
    (data-config) and the section's block overrides. No dependencies. */
(function (global) {
  'use strict';

  var DIMS = ['gender', 'moment', 'mood', 'presence', 'season'];
  var PARAM = 'sq';

  // ------------------------------------------------------------------ catalog
  // Compact format written by scripts/build-theme-files.mjs:
  // catalog = { img, houses[], values{dim:[...]}, fields[], items[[...]], sets[[...]] }
  // A dimension cell is a string of one char per value: digit = index (store fact or High/Medium derived),
  // letter a-j = index of a Low-confidence derived value.
  function decodeCatalog(cat) {
    var f = {};
    cat.fields.forEach(function (name, i) { f[name] = i; });
    function row(r, isSet) {
      var p = {
        handle: r[f.handle], title: r[f.title], house: cat.houses[r[f.house]] || '',
        image: r[f.image] ? (/^(https?:)?\/\//.test(r[f.image]) ? r[f.image] : cat.img + r[f.image]) : '',
        variant: r[f.variant], price: r[f.price], available: !!r[f.available],
        notes: f.notes != null ? r[f.notes] || '' : '', isSet: isSet, dims: {}
      };
      DIMS.forEach(function (d) {
        var cell = f[d] != null ? String(r[f[d]] || '') : '';
        p.dims[d] = cell.split('').map(function (ch) {
          var low = ch >= 'a' && ch <= 'j';
          var idx = low ? ch.charCodeAt(0) - 97 : +ch;
          return { v: cat.values[d][idx], low: low };
        });
      });
      return p;
    }
    return {
      products: cat.items.map(function (r) { return row(r, false); }),
      sets: (cat.sets || []).map(function (r) { return row(r, true); })
    };
  }

  // ------------------------------------------------------------------ scoring
  // score = sum over answers and dimensions of the best matching tag weight on the product.
  // Low-confidence derived values count at `low_confidence_factor` and are tracked separately so they are
  // never the only reason a product is recommended (solid must be > 0 and >= the low part).
  function scoreProduct(p, answers, S) {
    var score = 0, solid = 0, low = 0, matched = [];
    answers.forEach(function (a) {
      Object.keys(a.tags || {}).forEach(function (dim) {
        var weights = a.tags[dim], top = 0, best = 0, bestLow = false, primary = false;
        Object.keys(weights).forEach(function (k) { top = Math.max(top, weights[k]); });
        (p.dims[dim] || []).forEach(function (val) {
          var w = weights[val.v] || 0;
          if (w <= 0) return;
          var eff = val.low ? w * S.low_confidence_factor : w;
          if (eff > best) { best = eff; bestLow = val.low; primary = w === top; }
        });
        if (best > 0) {
          score += best;
          if (bestLow) low += best; else solid += best;
          if (primary && !bestLow && matched.indexOf(a) < 0) matched.push(a);
        }
      });
    });
    return { score: score, solid: solid, low: low, matched: matched };
  }

  // an answer may exclude products whose (non-low) values in a dimension are ALL in its exclude list
  function isExcluded(p, answers) {
    return answers.some(function (a) {
      return Object.keys(a.exclude || {}).some(function (dim) {
        var vals = (p.dims[dim] || []).filter(function (v) { return !v.low; });
        return vals.length > 0 && vals.every(function (v) { return a.exclude[dim].indexOf(v.v) >= 0; });
      });
    });
  }

  function rank(list, answers, S) {
    return list.map(function (p) {
      var r = scoreProduct(p, answers, S);
      r.p = p;
      r.excluded = isExcluded(p, answers);
      return r;
    }).sort(function (a, b) {
      return (b.score - a.score) || (b.p.available - a.p.available) || (a.p.price - b.p.price) || (a.p.handle < b.p.handle ? -1 : 1);
    });
  }

  // model = { config, products, sets }; returns { items, set, persona, fallback, candidates }
  function recommend(model, answers, opts) {
    var S = model.config.scoring;
    var ranked = rank(model.products, answers, S);
    var eligible = ranked.filter(function (r) { return !r.excluded && r.solid > 0 && r.solid >= r.low; });
    var picks = [], houses = {}, fallback = false;
    function take(list, useKeep) {
      for (var i = 0; i < list.length && picks.length < S.result_max; i++) {
        var r = list[i];
        if (!r.p.available || picks.indexOf(r) >= 0) continue;
        if ((houses[r.p.house] || 0) >= S.max_per_house) continue;
        if (useKeep && picks.length >= S.result_min && r.score < S.keep_ratio * picks[0].score) break;
        picks.push(r);
        houses[r.p.house] = (houses[r.p.house] || 0) + 1;
      }
    }
    take(eligible, true);
    if (picks.length < S.result_min) {
      // always a result: widen to anything not excluded, then to the whole shelf
      fallback = true;
      take(ranked.filter(function (r) { return !r.excluded; }), false);
      if (picks.length < S.result_min) take(ranked, false);
    }
    var set = null;
    if (picks.length && model.sets.length) {
      var sr = rank(model.sets, answers, S).filter(function (r) { return r.p.available && !r.excluded && r.solid > 0; })[0];
      if (sr && sr.score >= (1 - S.set_within) * picks[0].score) set = sr;
    }
    return {
      items: picks, set: set, fallback: fallback,
      persona: personaFor(model.config, answers),
      candidates: (opts && opts.candidates) ? eligible.slice(0, opts.candidates).map(function (r) { return r.p; }) : null
    };
  }

  function personaFor(config, answers) {
    var P = config.personas;
    if (!P) return null;
    var byQ = {};
    answers.forEach(function (a) { byQ[a.q] = a.id; });
    var key = P.matrix[byQ[P.rows]] && P.matrix[byQ[P.rows]][byQ[P.cols]];
    return P.list.filter(function (x) { return x.key === key; })[0] || P.list[0];
  }

  // answers <-> URL code ("her.evening.romance-presence.fills.cold")
  function encodeCode(answers) { return answers.map(function (a) { return a.id; }).join('.'); }
  function parseCode(config, code) {
    var ids = String(code || '').split('.');
    if (ids.length !== config.questions.length) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var a = findAnswer(config.questions[i], ids[i]);
      if (!a) return null;
      out.push(a);
    }
    return out;
  }
  function findAnswer(q, id) {
    return q.answers.filter(function (a) { return a.id === id; })[0] || null;
  }

  // attach question ids to answers so they know where they belong
  function buildModel(config) {
    config.questions.forEach(function (q) { q.answers.forEach(function (a) { a.q = q.id; }); });
    var cat = decodeCatalog(config.catalog);
    return { config: config, products: cat.products, sets: cat.sets };
  }

  var API = { decodeCatalog: decodeCatalog, scoreProduct: scoreProduct, recommend: recommend, personaFor: personaFor, encodeCode: encodeCode, parseCode: parseCode, buildModel: buildModel };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.ScentQuiz = API;
  if (typeof document === 'undefined') return;

  // ================================================================== UI
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  function joinList(parts, and) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' ' + and + ' ' + parts[parts.length - 1];
  }
  function cdnSized(url, w) {
    if (!url) return '';
    if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return url;
    return url.replace(/([?&])width=\d+&?/, '$1').replace(/[?&]$/, '') + (url.indexOf('?') >= 0 ? '&' : '?') + 'width=' + w;
  }
  function publish(root, name, data) {
    try {
      if (global.Shopify && global.Shopify.analytics && typeof global.Shopify.analytics.publish === 'function') {
        global.Shopify.analytics.publish(name, data);
      }
    } catch (e) { /* analytics must never break the quiz */ }
    root.dispatchEvent(new CustomEvent('scent-quiz:' + name, { bubbles: true, detail: data }));
  }

  function Quiz(root) {
    this.root = root;
    this.app = root.querySelector('[data-sq-app]');
    this.answers = [];
    this.step = -1;
    this.shared = false;
    this.cartRoot = (global.Shopify && global.Shopify.routes && global.Shopify.routes.root) || '/';
    this.live = {};
  }

  Quiz.prototype.load = function () {
    var self = this;
    return fetch(this.root.getAttribute('data-config'), { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('config ' + r.status); return r.json(); })
      .then(function (config) {
        self.applyOverrides(config);
        self.model = buildModel(config);
        self.config = config;
        self.copy = config.copy;
        self.fmt = new Intl.NumberFormat(config.locale || 'en-US', { style: 'currency', currency: config.currency || 'USD' });
        self.bind();
        self.root.hidden = false;
        var code = new URLSearchParams(global.location.search).get(PARAM);
        var shared = code && parseCode(config, code);
        if (shared) { self.shared = true; self.answers = shared; self.finish(false); } else self.show(-1);
      })
      .catch(function (e) { if (global.console) console.warn('[scent-quiz]', e); });
  };

  // section blocks (theme editor) override question titles, answer labels/images and persona texts
  Quiz.prototype.applyOverrides = function (config) {
    var el = this.root.querySelector('[data-sq-overrides]');
    if (!el) return;
    var o;
    try { o = JSON.parse(el.textContent); } catch (e) { return; }
    this.blocks = o.blocks || [];
    var s = o.settings || {};
    Object.keys(s).forEach(function (k) { if (s[k]) config.copy[k] = s[k]; });
    this.blocks.forEach(function (b) {
      var q = config.questions.filter(function (x) { return x.id === b.q; })[0];
      if (b.type === 'question' && q && b.title) q.title = b.title;
      if (b.type === 'answer' && q) {
        var a = findAnswer(q, b.a);
        if (!a) return;
        if (b.label) a.label = b.label;
        if (b.img) { a.img = b.img; }
        a.block = b.id;
      }
      if (b.type === 'persona' && config.personas) {
        var p = config.personas.list.filter(function (x) { return x.key === b.key; })[0];
        if (p) { if (b.name) p.name = b.name; if (b.line) p.line = b.line; }
      }
    });
  };

  Quiz.prototype.bind = function () {
    var self = this;
    this.app.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !self.app.contains(t)) return;
      var act = t.getAttribute('data-act');
      if (act === 'start') { publish(self.root, 'quiz_started', { quiz: self.config.id }); self.answers = []; self.show(0); }
      else if (act === 'answer') self.pick(+t.getAttribute('data-q'), t.getAttribute('data-a'));
      else if (act === 'back') self.show(self.step - 1);
      else if (act === 'add') self.addOne(t);
      else if (act === 'add-all') self.addAll(t);
      else if (act === 'add-set') self.addSet(t);
      else if (act === 'restart') self.restart();
      else if (act === 'share-open') self.openShare(t);
      else if (act === 'download') self.shareDownload();
      else if (act === 'native') self.shareNative();
      else if (act === 'copy') self.shareCopy(t);
    });
  };

  Quiz.prototype.pick = function (qi, id) {
    var q = this.config.questions[qi];
    this.answers[qi] = findAnswer(q, id);
    this.answers.length = qi + 1;
    if (qi + 1 < this.config.questions.length) this.show(qi + 1);
    else this.finish(true);
  };

  Quiz.prototype.restart = function () {
    this.answers = [];
    this.shared = false;
    this.result = null;
    this.setUrl(null);
    this.show(0);
    publish(this.root, 'quiz_started', { quiz: this.config.id, restart: true });
  };

  Quiz.prototype.setUrl = function (code) {
    try {
      var u = new URL(global.location.href);
      if (code) u.searchParams.set(PARAM, code); else u.searchParams.delete(PARAM);
      global.history.replaceState(global.history.state, '', u.toString());
    } catch (e) { /* ignore */ }
  };

  Quiz.prototype.shareUrl = function () {
    var u = new URL(global.location.href);
    u.hash = '';
    u.search = '';
    u.searchParams.set(PARAM, encodeCode(this.answers));
    return u.toString();
  };

  Quiz.prototype.render = function (html, focusSel) {
    this.app.innerHTML = html;
    var top = this.root.getBoundingClientRect().top;
    if (top < 0) this.root.scrollIntoView({ block: 'start' });
    var f = this.app.querySelector(focusSel || '[data-sq-focus]');
    if (f && this.started) f.focus({ preventScroll: true });
    this.started = true;
  };

  Quiz.prototype.img = function (a, eager) {
    var alt = esc(a.img && a.img.alt ? a.img.alt : '');
    var s600, s900;
    if (a.img) { s600 = a.img.s; s900 = a.img.l || a.img.s; } else { s600 = cdnSized(a.image, 600); s900 = cdnSized(a.image, 900); }
    if (!s600) return '<span class="sq-tile__ph" aria-hidden="true"></span>';
    return '<img src="' + esc(s600) + '" srcset="' + esc(s600) + ' 600w, ' + esc(s900) + ' 900w" sizes="(min-width: 750px) 25vw, 50vw" alt="' + alt + '" width="600" height="600" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async">';
  };

  Quiz.prototype.progress = function (i) {
    var n = this.config.questions.length;
    return '<div class="sq-top">' +
      '<button type="button" class="sq-back" data-act="back"><span aria-hidden="true">&larr;</span> ' + esc(this.copy.back) + '</button>' +
      '<p class="sq-step">' + esc(fill(this.copy.step, { n: i + 1, total: n })) + '</p></div>' +
      '<div class="sq-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + (i + 1) + '"><span style="width:' + ((i + 1) / n * 100) + '%"></span></div>';
  };

  Quiz.prototype.show = function (i) {
    this.step = i;
    var c = this.copy, self = this;
    if (i < 0) {
      this.render('<div class="sq-screen sq-intro">' +
        (c.intro_kicker ? '<p class="sq-kicker">' + esc(c.intro_kicker) + '</p>' : '') +
        '<h2 class="sq-title" tabindex="-1" data-sq-focus>' + esc(c.intro_title) + '</h2>' +
        '<p class="sq-lead">' + esc(c.intro_text) + '</p>' +
        '<button type="button" class="sq-btn" data-act="start">' + esc(c.start) + '</button></div>');
      return;
    }
    var q = this.config.questions[i];
    var chosen = this.answers[i] && this.answers[i].id;
    var tiles = q.answers.map(function (a) {
      return '<li><button type="button" class="sq-tile" data-act="answer" data-q="' + i + '" data-a="' + esc(a.id) + '" aria-pressed="' + (a.id === chosen) + '">' +
        '<span class="sq-tile__img">' + self.img(a, i === 0) + '</span>' +
        '<span class="sq-tile__label">' + esc(a.label) + '</span></button></li>';
    }).join('');
    this.render('<div class="sq-screen sq-q" data-q="' + esc(q.id) + '">' + this.progress(i) +
      '<h2 class="sq-title" tabindex="-1" data-sq-focus>' + esc(q.title) + '</h2>' +
      '<ul class="sq-tiles" data-count="' + q.answers.length + '">' + tiles + '</ul></div>');
  };

  // ------------------------------------------------------------------ live inventory
  // Re-check stock and the cheapest (sample) variant of the leading candidates from the storefront.
  Quiz.prototype.refreshLive = function (products) {
    var self = this;
    var todo = products.filter(function (p) { return !self.live[p.handle]; });
    var queue = todo.slice(), running = [];
    function one(p) {
      return fetch(self.cartRoot + 'products/' + encodeURIComponent(p.handle) + '.js', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.variants) return;
          var av = d.variants.filter(function (v) { return v.available; });
          p.available = av.length > 0;
          var pool = av.length ? av : d.variants;
          var cheapest = pool.slice().sort(function (a, b) { return a.price - b.price; })[0];
          p.variant = cheapest.id;
          p.price = cheapest.price / 100;
          self.live[p.handle] = true;
        })
        .catch(function () { /* keep catalog values */ });
    }
    function next() { var p = queue.shift(); return p ? one(p).then(next) : null; }
    for (var k = 0; k < 4; k++) running.push(next());
    var timeout = new Promise(function (res) { setTimeout(res, 4000); });
    return Promise.race([Promise.all(running), timeout]);
  };

  Quiz.prototype.finish = function (fresh) {
    var self = this, c = this.copy, S = this.config.scoring;
    this.step = this.config.questions.length;
    this.render('<div class="sq-screen sq-loading"><p class="sq-lead" tabindex="-1" data-sq-focus>' + esc(c.loading) + '</p><span class="sq-spinner" aria-hidden="true"></span></div>');
    var first = recommend(this.model, this.answers, { candidates: S.live_check });
    var check = first.candidates.concat(this.model.sets);
    this.refreshLive(check).then(function () {
      var res = recommend(self.model, self.answers);
      self.result = res;
      self.setUrl(encodeCode(self.answers));
      if (fresh) {
        var ans = {};
        self.answers.forEach(function (a) { ans[a.q] = a.id; });
        publish(self.root, 'quiz_completed', { quiz: self.config.id, answers: ans, persona: res.persona && res.persona.key, products: res.items.map(function (r) { return r.p.handle; }) });
      }
      self.showResult();
    });
  };

  Quiz.prototype.why = function (r) {
    var order = this.config.why_order || this.config.questions.map(function (q) { return q.id; });
    var parts = [];
    order.forEach(function (qid) {
      r.matched.forEach(function (a) { if (a.q === qid && a.why && parts.indexOf(a.why) < 0) parts.push(a.why); });
    });
    parts = parts.slice(0, 3);
    return parts.length ? fill(this.copy.why, { list: joinList(parts, this.copy.and) }) : '';
  };

  Quiz.prototype.card = function (r, i) {
    var p = r.p, c = this.copy;
    return '<li class="sq-card">' +
      '<a class="sq-card__img" href="' + esc(this.cartRoot + 'products/' + p.handle) + '" tabindex="-1" aria-hidden="true">' +
      (p.image ? '<img src="' + esc(cdnSized(p.image, 600)) + '" srcset="' + esc(cdnSized(p.image, 600)) + ' 600w, ' + esc(cdnSized(p.image, 900)) + ' 900w" sizes="(min-width: 750px) 20vw, 30vw" alt="" width="600" height="600" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async">' : '') + '</a>' +
      '<div class="sq-card__body">' +
      '<p class="sq-card__house">' + esc(p.house) + '</p>' +
      '<h3 class="sq-card__name"><a href="' + esc(this.cartRoot + 'products/' + p.handle) + '">' + esc(p.title) + '</a></h3>' +
      '<p class="sq-card__why">' + esc(this.why(r)) + '</p>' +
      (p.notes ? '<p class="sq-card__notes">' + esc(p.notes) + '</p>' : '') +
      '<button type="button" class="sq-btn sq-btn--line" data-act="add" data-variant="' + esc(p.variant) + '" data-handle="' + esc(p.handle) + '">' + esc(c.add_sample) + ' · ' + esc(this.fmt.format(p.price)) + '</button>' +
      '</div></li>';
  };

  Quiz.prototype.showResult = function () {
    var self = this, c = this.copy, res = this.result, per = res.persona || { name: '', line: '' };
    var total = res.items.reduce(function (s, r) { return s + r.p.price; }, 0);
    var html = '<div class="sq-screen sq-result">';
    if (this.shared) html += '<div class="sq-shared"><p>' + esc(c.shared_note) + '</p><button type="button" class="sq-btn sq-btn--line" data-act="restart">' + esc(c.shared_cta) + '</button></div>';
    html += '<p class="sq-kicker">' + esc(c.result_kicker) + '</p>' +
      '<h2 class="sq-title sq-persona" tabindex="-1" data-sq-focus>' + esc(per.name) + '</h2>' +
      '<p class="sq-lead">' + esc(per.line) + '</p>';
    if (res.fallback) html += '<p class="sq-note">' + esc(c.fallback_note) + '</p>';
    html += '<h3 class="sq-subtitle">' + esc(c.result_list_title) + '</h3>' +
      '<ol class="sq-cards">' + res.items.map(function (r, i) { return self.card(r, i); }).join('') + '</ol>' +
      '<div class="sq-actions"><button type="button" class="sq-btn" data-act="add-all">' + esc(c.add_all) + ' · ' + esc(this.fmt.format(total)) + '</button>' +
      '<p class="sq-msg" role="status" data-sq-msg></p></div>';
    if (res.set) {
      var s = res.set.p;
      html += '<aside class="sq-set"><a class="sq-set__img" href="' + esc(this.cartRoot + 'products/' + s.handle) + '" tabindex="-1" aria-hidden="true">' +
        (s.image ? '<img src="' + esc(cdnSized(s.image, 600)) + '" alt="" width="600" height="600" loading="lazy" decoding="async">' : '') + '</a>' +
        '<div><p class="sq-kicker">' + esc(c.set_kicker) + '</p><h3 class="sq-card__name"><a href="' + esc(this.cartRoot + 'products/' + s.handle) + '">' + esc(s.title) + '</a></h3>' +
        '<p class="sq-card__why">' + esc(c.set_text) + '</p>' +
        '<button type="button" class="sq-btn sq-btn--line" data-act="add-set" data-variant="' + esc(s.variant) + '" data-handle="' + esc(s.handle) + '">' + esc(c.set_cta) + ' · ' + esc(this.fmt.format(s.price)) + '</button></div></aside>';
    }
    html += '<div class="sq-share"><button type="button" class="sq-btn sq-btn--line" data-act="share-open" aria-expanded="false">' + esc(c.share_title) + '</button>' +
      '<div class="sq-share__panel" hidden data-sq-share><img class="sq-share__preview" alt="" data-sq-preview>' +
      '<div class="sq-share__btns"><button type="button" class="sq-btn" data-act="download">' + esc(c.share_download) + '</button>' +
      (navigator.share ? '<button type="button" class="sq-btn sq-btn--line" data-act="native">' + esc(c.share_native) + '</button>' : '') +
      '<button type="button" class="sq-btn sq-btn--line" data-act="copy">' + esc(c.share_copy) + '</button></div></div></div>' +
      '<button type="button" class="sq-restart" data-act="restart">' + esc(c.start_over) + '</button></div>';
    this.render(html);
  };

  // ------------------------------------------------------------------ cart
  Quiz.prototype.post = function (items) {
    return fetch(this.cartRoot + 'cart/add.js', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) { if (!r.ok) throw new Error('cart ' + r.status); return r.json(); });
  };

  Quiz.prototype.updateCounters = function () {
    var cc = this.config.cart || {}, self = this;
    if (!cc.count_selector && !cc.total_selector) return;
    fetch(this.cartRoot + 'cart.js', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (cart) {
      if (cc.count_selector) document.querySelectorAll(cc.count_selector).forEach(function (el) { el.textContent = cart.item_count; });
      if (cc.total_selector) {
        var f = new Intl.NumberFormat(self.config.locale || 'en-US', { style: 'currency', currency: cart.currency || self.config.currency || 'USD' });
        document.querySelectorAll(cc.total_selector).forEach(function (el) { el.textContent = f.format(cart.total_price / 100); });
      }
    }).catch(function () {});
  };

  Quiz.prototype.openCart = function () {
    var cc = this.config.cart || {};
    var opener = cc.mode === 'drawer' && cc.open_selector && document.querySelector(cc.open_selector);
    if (opener) { this.updateCounters(); opener.click(); } else global.location.href = this.cartRoot + 'cart';
  };

  Quiz.prototype.busy = function (btn, on) {
    if (on) { btn.setAttribute('data-label', btn.innerHTML); btn.textContent = this.copy.adding; btn.disabled = true; }
    else { btn.innerHTML = btn.getAttribute('data-label'); btn.disabled = false; }
  };

  Quiz.prototype.msg = function (text) {
    var m = this.app.querySelector('[data-sq-msg]');
    if (m) m.textContent = text || '';
  };

  Quiz.prototype.addOne = function (btn, mode) {
    var self = this, id = +btn.getAttribute('data-variant'), handle = btn.getAttribute('data-handle');
    this.busy(btn, true);
    this.post([{ id: id, quantity: 1 }]).then(function () {
      btn.disabled = false;
      btn.outerHTML = '<a class="sq-btn sq-btn--done" href="' + esc(self.cartRoot + 'cart') + '"><span aria-hidden="true">&#10003;</span> ' + esc(self.copy.added) + ' · ' + esc(self.copy.view_cart) + '</a>';
      self.updateCounters();
      publish(self.root, 'quiz_add_to_cart', { quiz: self.config.id, mode: mode || 'single', items: [{ variant_id: id, handle: handle }] });
    }).catch(function () { self.busy(btn, false); self.msg(self.copy.add_error); });
  };

  Quiz.prototype.addSet = function (btn) { this.addOne(btn, 'set'); };

  Quiz.prototype.addAll = function (btn) {
    var self = this;
    var items = this.result.items.map(function (r) { return { id: r.p.variant, quantity: 1 }; });
    this.busy(btn, true);
    this.msg('');
    this.post(items).then(function () {
      publish(self.root, 'quiz_add_to_cart', { quiz: self.config.id, mode: 'all', items: self.result.items.map(function (r) { return { variant_id: r.p.variant, handle: r.p.handle }; }) });
      self.busy(btn, false);
      self.openCart();
    }).catch(function () { self.busy(btn, false); self.msg(self.copy.add_error); });
  };

  // ------------------------------------------------------------------ share
  Quiz.prototype.openShare = function (btn) {
    var panel = this.app.querySelector('[data-sq-share]'), self = this;
    var open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && !this.blob) {
      this.story().then(function (blob) {
        self.blob = blob;
        var img = self.app.querySelector('[data-sq-preview]');
        if (img && blob) img.src = URL.createObjectURL(blob);
      });
    }
  };

  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  // 1080x1920 story image drawn in the browser with the theme's own fonts and colours
  Quiz.prototype.story = function () {
    var self = this, c = this.copy, res = this.result;
    var head = this.app.querySelector('.sq-persona') || this.app;
    var cs = getComputedStyle(this.root), hs = getComputedStyle(head);
    var bodyFont = cs.fontFamily, headFont = hs.fontFamily;
    var bg = getComputedStyle(this.root.closest('.sq-section') || this.root).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
    var fg = cs.color, accent = hs.color;
    var loads = document.fonts ? Promise.all([
      document.fonts.load('400 120px ' + headFont), document.fonts.load('400 34px ' + bodyFont), document.fonts.load('600 34px ' + bodyFont)
    ]).catch(function () {}) : Promise.resolve();
    return loads.then(function () {
      var W = 1080, H = 1920, M = 110, LIMIT = H - 230;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var x = cv.getContext('2d');
      var spaced = function (on) { if ('letterSpacing' in x) x.letterSpacing = on ? '6px' : '0px'; };
      // lay the story out at scale k; returns the y where the product list ends (draw=false only measures)
      function paint(k, draw) {
        var put = function (t, y) { if (draw) x.fillText(t, W / 2, y); };
        var y = 330 * k;
        spaced(true); x.fillStyle = accent; x.font = '600 34px ' + bodyFont;
        put(String(c.share_story_kicker || '').toUpperCase(), y);
        spaced(false); x.fillStyle = fg; x.font = '400 ' + Math.round(118 * k) + 'px ' + headFont;
        y += 170 * k;
        wrap(x, res.persona ? res.persona.name : '', W - 2 * M).forEach(function (l) { put(l, y); y += 132 * k; });
        x.font = '400 ' + Math.round(40 * k) + 'px ' + bodyFont; y += 20 * k;
        wrap(x, res.persona ? res.persona.line : '', W - 2 * M - 40).forEach(function (l) { put(l, y); y += 60 * k; });
        y += 70 * k;
        if (draw) { x.fillStyle = accent; x.fillRect(W / 2 - 60, y, 120, 3); }
        y += 110 * k;
        spaced(true); x.fillStyle = accent; x.font = '600 32px ' + bodyFont;
        put(String(c.share_story_top || '').toUpperCase(), y);
        spaced(false);
        y += 100 * k;
        res.items.slice(0, 3).forEach(function (r) {
          x.fillStyle = accent; x.font = '600 30px ' + bodyFont;
          put(String(r.p.house).toUpperCase(), y);
          x.fillStyle = fg; x.font = '400 ' + Math.round(66 * k) + 'px ' + headFont;
          var lines = wrap(x, r.p.title, W - 2 * M).slice(0, 2);
          lines.forEach(function (l, i) { put(l, y + 80 * k + i * 74 * k); });
          y += 80 * k + (lines.length - 1) * 74 * k + 90 * k;
        });
        return y - 90 * k;
      }
      var k = 1;
      while (k > 0.55 && paint(k, false) > LIMIT) k -= 0.05;
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      x.strokeStyle = accent; x.lineWidth = 2; x.strokeRect(56, 56, W - 112, H - 112);
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      paint(k, true);
      x.fillStyle = fg; x.font = '400 36px ' + bodyFont;
      x.fillText((self.config.share && self.config.share.url_text) || global.location.host, W / 2, H - 150);
      return new Promise(function (res2) { cv.toBlob(function (b) { res2(b); }, 'image/png'); });
    });
  };

  Quiz.prototype.withBlob = function () {
    var self = this;
    return this.blob ? Promise.resolve(this.blob) : this.story().then(function (b) { self.blob = b; return b; });
  };

  Quiz.prototype.shared_ = function (method) {
    publish(this.root, 'quiz_shared', { quiz: this.config.id, method: method, persona: this.result.persona && this.result.persona.key });
  };

  Quiz.prototype.shareDownload = function () {
    var self = this;
    this.withBlob().then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (self.config.share && self.config.share.file_name) || 'scent-persona.png';
      document.body.appendChild(a); a.click(); a.remove();
      self.shared_('download');
    });
  };

  Quiz.prototype.shareNative = function () {
    var self = this, url = this.shareUrl(), sh = this.config.share || {};
    var text = this.result.persona ? this.result.persona.name : '';
    this.withBlob().then(function (b) {
      var file = new File([b], sh.file_name || 'scent-persona.png', { type: 'image/png' });
      var data = navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: sh.title, text: text + ' ' + url } : { title: sh.title, text: text, url: url };
      return navigator.share(data).then(function () { self.shared_('native'); });
    }).catch(function () { /* user cancelled */ });
  };

  Quiz.prototype.shareCopy = function (btn) {
    var self = this, url = this.shareUrl();
    var done = function () { btn.textContent = self.copy.share_copied; self.shared_('copy'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      t.remove();
    }
  };

  // ------------------------------------------------------------------ boot
  function boot(scope) {
    (scope || document).querySelectorAll('[data-scent-quiz]').forEach(function (root) {
      if (root.__sq) return;
      root.__sq = new Quiz(root);
      root.__sq.load();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); });
  else boot();
  // theme editor: re-init when the section is re-rendered; jump to the question of a selected answer block
  document.addEventListener('shopify:section:load', function (e) { boot(e.target); });
  document.addEventListener('shopify:block:select', function (e) {
    var root = e.target.closest ? e.target.closest('.sq-section') : null;
    var q = root && root.querySelector('[data-scent-quiz]');
    var quiz = q && q.__sq;
    if (!quiz || !quiz.config || !quiz.blocks) return;
    var b = quiz.blocks.filter(function (x) { return x.id === e.detail.blockId; })[0];
    if (!b) return;
    var qi = quiz.config.questions.map(function (x) { return x.id; }).indexOf(b.q);
    if (qi >= 0) quiz.show(qi);
  });
})(typeof window !== 'undefined' ? window : globalThis);
