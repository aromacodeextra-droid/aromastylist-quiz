/*! scent-quiz engine v2 - brand-agnostic. All text, images and products come from the config JSON asset
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

  // ------------------------------------------------------------------ taste (notes)
  // Optional second asset (data-taste) written by scripts/build-theme-files.mjs:
  // { families[], canon[[label, familyIndex]], items[[vec, canon]], sets[[vec, canon]], refs[[id, name, house, vec, canon, popular]] }
  // vec = 12 digits (share of each note family x 10), canon = 2-digit indices of canonical notes, strongest first.
  function decodeVec(str) {
    var v = String(str || '').split('').map(Number), sum = 0;
    v.forEach(function (x) { sum += x; });
    return v.map(function (x) { return sum ? x / sum : 0; });
  }
  function decodeCanon(str) {
    var out = [];
    for (var i = 0; i + 1 < String(str || '').length; i += 2) out.push(+str.substr(i, 2));
    return out;
  }
  function attachTaste(model, t) {
    if (!t) return;
    model.taste = t;
    function add(list, rows) { list.forEach(function (p, i) { if (rows[i]) { p.vec = decodeVec(rows[i][0]); p.canon = decodeCanon(rows[i][1]); } }); }
    add(model.products, t.items || []);
    add(model.sets, t.sets || []);
    var own = {};
    model.products.forEach(function (p) { own[p.handle] = p; });
    model.refs = (t.refs || []).map(function (r) {
      return { id: r[0], name: r[1], house: r[2], vec: decodeVec(r[3]), canon: decodeCanon(r[4]), popular: !!r[5] };
    });
    model.ownByHandle = own;
  }
  function cosine(a, b) {
    if (!a || !b) return 0;
    var d = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }
  // ctx = { mode: 'similar'|'complement'|'families', vec, canon, label, handle }
  // returns 0..1 and the shared canonical notes ("the thread")
  function tasteFit(p, ctx) {
    if (!ctx || !p.vec) return { t: 0, shared: [] };
    var cos = cosine(ctx.vec, p.vec);
    var key = (ctx.canon || []).slice(0, 6);
    var shared = (p.canon || []).filter(function (c) { return key.indexOf(c) >= 0; });
    var t;
    if (ctx.mode === 'families') t = cos;
    else if (ctx.mode === 'complement') {
      // same thread (at least one shared key note), different overall shape
      var shape = Math.max(0, 1 - Math.abs(cos - 0.4) / 0.4);
      t = shared.length ? 0.45 + 0.55 * shape : 0.2 * shape;
      if (cos > 0.85) t *= 0.4;
    } else t = 0.7 * cos + 0.3 * Math.min(shared.length, 3) / 3;
    return { t: t, shared: shared };
  }

  // ------------------------------------------------------------------ scoring
  // score = sum over answers and dimensions of the best matching tag weight on the product
  //       + taste_weight x taste fit (notes; store facts, so it counts as solid).
  // Low-confidence derived values count at `low_confidence_factor` and are tracked separately so they are
  // never the only reason a product is recommended (solid must be > 0 and >= the low part).
  function scoreProduct(p, answers, S, ctx) {
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
    var tf = tasteFit(p, ctx), tw = (S.taste_weight || 0) * tf.t;
    score += tw; solid += tw;
    return { score: score, solid: solid, low: low, matched: matched, taste: tf.t, shared: tf.shared };
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

  function rank(list, answers, S, ctx) {
    return list.map(function (p) {
      var r = scoreProduct(p, answers, S, ctx);
      r.p = p;
      r.excluded = isExcluded(p, answers) || !!(ctx && ctx.handle === p.handle);
      return r;
    }).sort(function (a, b) {
      return (b.score - a.score) || (b.taste - a.taste) || (b.p.available - a.p.available) || (a.p.price - b.p.price) || (a.p.handle < b.p.handle ? -1 : 1);
    });
  }

  // model = { config, products, sets, refs? }; answers = flat list of chosen answers;
  // opts.taste = taste context. Returns { items, set, own, persona, fallback, candidates }
  function recommend(model, answers, opts) {
    var S = model.config.scoring, ctx = opts && opts.taste;
    var ranked = rank(model.products, answers, S, ctx);
    var eligible = ranked.filter(function (r) { return !r.excluded && r.solid > 0 && r.solid >= r.low; });
    var picks = [], houses = {}, fallback = false;
    function take(list, useKeep) {
      for (var i = 0; i < list.length && picks.length < S.result_max; i++) {
        var r = list[i];
        if (!r.p.available || picks.indexOf(r) >= 0) continue;
        if (ctx && ctx.handle === r.p.handle) continue;
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
      var sr = rank(model.sets, answers, S, ctx).filter(function (r) { return r.p.available && !r.excluded && r.solid > 0; })[0];
      if (sr && sr.score >= (1 - S.set_within) * picks[0].score) set = sr;
    }
    var own = ctx && ctx.handle && model.ownByHandle ? model.ownByHandle[ctx.handle] : null;
    return {
      items: picks, set: set, fallback: fallback, own: own && own.available ? own : null,
      persona: personaFor(model.config, answers),
      candidates: (opts && opts.candidates) ? eligible.slice(0, opts.candidates).map(function (r) { return r.p; }) : null
    };
  }

  // A wardrobe: one perfume per answer of an "axis" question (e.g. the 4 occasions or the 7 moods).
  // Each shelf re-scores the shelf with that answer swapped in, keeps the visitor's other answers and taste,
  // prefers perfumes that actually carry the shelf's tag, and never repeats a perfume or overuses a house.
  function wardrobe(model, answers, axisQid, opts) {
    var S = model.config.scoring, ctx = opts && opts.taste;
    var q = model.config.questions.filter(function (x) { return x.id === axisQid; })[0];
    if (!q) return [];
    var mine = answers.filter(function (a) { return a.q === axisQid; })[0];
    var others = answers.filter(function (a) { return a.q !== axisQid; });
    var used = {}, houses = {};
    (opts && opts.exclude || []).forEach(function (h) { used[h] = 1; });
    var shelves = q.answers.slice().sort(function (a, b) { return (b === mine) - (a === mine); });
    return shelves.map(function (a) {
      var dim = Object.keys(a.tags || {})[0], val = null, top = 0;
      if (dim) Object.keys(a.tags[dim]).forEach(function (k) { if (a.tags[dim][k] > top) { top = a.tags[dim][k]; val = k; } });
      var carries = function (p) { return (p.dims[dim] || []).some(function (d) { return d.v === val && !d.low; }); };
      var ranked = rank(model.products, others.concat([a]), S, ctx).filter(function (r) {
        return r.p.available && !r.excluded && !used[r.p.handle] && (houses[r.p.house] || 0) < S.max_per_house && r.solid >= r.low;
      });
      var r = ranked.filter(function (x) { return carries(x.p); })[0] || ranked[0] || null;
      if (r) { used[r.p.handle] = 1; houses[r.p.house] = (houses[r.p.house] || 0) + 1; r.shelf = a; r.mine = a === mine; }
      return r;
    }).filter(Boolean);
  }

  function personaFor(config, answers) {
    var P = config.personas;
    if (!P) return null;
    var byQ = {};
    answers.forEach(function (a) { byQ[a.q] = a.id; });
    var key = P.matrix[byQ[P.rows]] && P.matrix[byQ[P.rows]][byQ[P.cols]];
    return P.list.filter(function (x) { return x.key === key; })[0] || P.list[0];
  }

  // ------------------------------------------------------------------ state
  // state[i] per question: single -> answer, multi -> [answers], perfume -> {kind:'ref'|'own', id} or 'skip',
  // hidden question -> null.  q.show_if = { q: <question id>, is: 'picked' | 'skipped' | <answer id> }
  function findAnswer(q, id) {
    return (q.answers || []).filter(function (a) { return a.id === id; })[0] || null;
  }
  function qIndex(config, id) {
    for (var i = 0; i < config.questions.length; i++) if (config.questions[i].id === id) return i;
    return -1;
  }
  function isVisible(model, state, i) {
    var q = model.config.questions[i];
    if ((q.type === 'perfume' || q.taste) && !model.taste) return false;
    var c = q.show_if;
    if (!c) return true;
    var v = state[qIndex(model.config, c.q)];
    if (v == null) return false;
    if (c.is === 'picked') return v !== 'skip';
    if (c.is === 'skipped') return v === 'skip';
    return v && v.id === c.is;
  }
  function flatten(state) {
    var out = [];
    state.forEach(function (v) {
      if (!v || v === 'skip') return;
      if (Array.isArray(v)) v.forEach(function (a) { out.push(a); });
      else if (v.q) out.push(v);
    });
    return out;
  }
  function perfumeOf(model, v) {
    if (!v || v === 'skip') return null;
    if (v.kind === 'own') {
      var p = model.ownByHandle && model.ownByHandle[v.id];
      return p && p.vec ? { name: p.title, house: p.house, vec: p.vec, canon: p.canon, handle: p.handle } : null;
    }
    var r = (model.refs || []).filter(function (x) { return x.id === v.id; })[0];
    return r ? { name: r.name, house: r.house, vec: r.vec, canon: r.canon } : null;
  }
  // taste context from the state: a named perfume (similar / complement) or chosen families
  function tasteContext(model, state) {
    if (!model.taste) return null;
    var cfg = model.config, ctx = null;
    cfg.questions.forEach(function (q, i) {
      var v = state[i];
      if (q.type === 'perfume') {
        var pf = perfumeOf(model, v);
        if (pf) ctx = { mode: 'similar', vec: pf.vec, canon: pf.canon, label: pf.name, house: pf.house, handle: pf.handle || null };
      }
    });
    cfg.questions.forEach(function (q, i) {
      var v = state[i];
      if (ctx && v && !Array.isArray(v) && v.taste_mode) ctx.mode = v.taste_mode;
      if (q.taste === 'families' && Array.isArray(v) && v.length && !ctx) {
        var fams = model.taste.families, vec = fams.map(function () { return 0; });
        v.forEach(function (a) { var k = fams.indexOf(a.family); if (k >= 0) vec[k] = 1; });
        ctx = { mode: 'families', vec: vec, canon: [], families: v.map(function (a) { return a.family; }) };
      }
    });
    return ctx;
  }

  // state <-> URL code: one token per question, '.'-joined. single: id, multi: id+id, perfume: r~id | p~handle | skip, hidden: _
  function encodeCode(model, state) {
    return model.config.questions.map(function (q, i) {
      var v = state[i];
      if (v == null) return '_';
      if (v === 'skip') return 'skip';
      if (q.type === 'perfume') return (v.kind === 'own' ? 'p~' : 'r~') + v.id;
      if (Array.isArray(v)) return v.map(function (a) { return a.id; }).join('+');
      return v.id;
    }).join('.');
  }
  function parseCode(model, code) {
    var qs = model.config.questions, toks = String(code || '').split('.');
    if (toks.length !== qs.length) return null;
    var state = [];
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], t = toks[i];
      if (t === '_') { state.push(null); continue; }
      if (q.type === 'perfume') {
        if (t === 'skip') { state.push('skip'); continue; }
        var m = /^(r|p)~(.+)$/.exec(t);
        if (!m) return null;
        var v = { kind: m[1] === 'p' ? 'own' : 'ref', id: m[2] };
        if (!perfumeOf(model, v)) return null;
        state.push(v);
      } else if (q.type === 'multi') {
        var list = t.split('+').map(function (id) { return findAnswer(q, id); });
        if (list.some(function (a) { return !a; })) return null;
        state.push(list);
      } else {
        var a = findAnswer(q, t);
        if (!a) return null;
        state.push(a);
      }
    }
    // every visible question must be answered, every hidden one empty
    for (var k = 0; k < qs.length; k++) if (isVisible(model, state, k) !== (state[k] != null)) return null;
    return state;
  }

  // attach question ids to answers so they know where they belong
  function buildModel(config, tasteData) {
    config.questions.forEach(function (q) { (q.answers || []).forEach(function (a) { a.q = q.id; }); });
    var cat = decodeCatalog(config.catalog);
    var model = { config: config, products: cat.products, sets: cat.sets };
    attachTaste(model, tasteData);
    return model;
  }

  var API = { decodeCatalog: decodeCatalog, scoreProduct: scoreProduct, recommend: recommend, wardrobe: wardrobe, personaFor: personaFor, encodeCode: encodeCode, parseCode: parseCode, buildModel: buildModel, tasteContext: tasteContext, flatten: flatten, isVisible: isVisible, perfumeOf: perfumeOf, cosine: cosine };
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
    this.state = [];
    this.step = -1;
    this.shared = false;
    this.cartRoot = (global.Shopify && global.Shopify.routes && global.Shopify.routes.root) || '/';
    this.live = {};
  }

  Quiz.prototype.load = function () {
    var self = this;
    var get = function (url) {
      return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
    };
    var tasteUrl = this.root.getAttribute('data-taste');
    return Promise.all([
      get(this.root.getAttribute('data-config')),
      // the taste file is optional: without it the perfume / note questions are simply skipped
      tasteUrl ? get(tasteUrl).catch(function () { return null; }) : Promise.resolve(null)
    ])
      .then(function (both) {
        var config = both[0];
        self.applyOverrides(config);
        self.model = buildModel(config, both[1]);
        self.config = config;
        self.copy = config.copy;
        self.fmt = new Intl.NumberFormat(config.locale || 'en-US', { style: 'currency', currency: config.currency || 'USD' });
        self.bind();
        self.root.hidden = false;
        var code = new URLSearchParams(global.location.search).get(PARAM);
        var shared = code && parseCode(self.model, code);
        if (shared) { self.shared = true; self.state = shared; self.finish(false); } else self.show(-1);
      })
      .catch(function (e) { if (global.console) console.warn('[scent-quiz]', e); });
  };

  // section blocks (theme editor) override question titles, answer labels/images and persona texts
  Quiz.prototype.applyOverrides = function (config) {
    var el = this.root.querySelector('[data-sq-overrides]');
    var o = {};
    try { if (el) o = JSON.parse(el.textContent); } catch (e) { o = {}; }
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
    // persona texts edited in the "Scent quiz: personas" section
    if (config.personas) document.querySelectorAll('[data-sq-persona]').forEach(function (li) {
      var p = config.personas.list.filter(function (x) { return x.key === li.getAttribute('data-sq-persona'); })[0];
      var h = li.querySelector('h3'), d = li.querySelector('p');
      if (p && h && h.textContent.trim()) p.name = h.textContent.trim();
      if (p && d && d.textContent.trim()) p.line = d.textContent.trim();
    });
  };

  Quiz.prototype.bind = function () {
    var self = this;
    this.app.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !self.app.contains(t)) return;
      var act = t.getAttribute('data-act');
      if (act === 'start') { publish(self.root, 'quiz_started', { quiz: self.config.id }); self.state = []; self.show(self.nextVisible(-1)); }
      else if (act === 'answer') self.pick(+t.getAttribute('data-q'), t.getAttribute('data-a'));
      else if (act === 'toggle') self.toggle(t);
      else if (act === 'next') self.advance(+t.getAttribute('data-q'));
      else if (act === 'perfume') self.pickPerfume(+t.getAttribute('data-q'), t.getAttribute('data-kind'), t.getAttribute('data-id'));
      else if (act === 'skip') self.pickPerfume(+t.getAttribute('data-q'), 'skip');
      else if (act === 'back') self.show(self.prevVisible(self.step));
      else if (act === 'add') self.addOne(t);
      else if (act === 'add-all') self.addAll(t);
      else if (act === 'tab') self.tab(t.getAttribute('data-tab'), true);
      else if (act === 'add-set') self.addSet(t);
      else if (act === 'restart') self.restart();
      else if (act === 'share-open') self.openShare(t);
      else if (act === 'download') self.shareDownload();
      else if (act === 'native') self.shareNative();
      else if (act === 'copy') self.shareCopy(t);
    });
    this.app.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t.matches || !t.matches('[data-act=tab]') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var all = Array.prototype.slice.call(self.app.querySelectorAll('[data-act=tab]'));
      var k = (all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
      self.tab(all[k].getAttribute('data-tab'), true);
      e.preventDefault();
    });
    this.app.addEventListener('input', function (e) {
      if (e.target.matches('[data-sq-search]')) self.search(e.target);
    });
  };

  Quiz.prototype.nextVisible = function (i) {
    for (var k = i + 1; k < this.config.questions.length; k++) if (isVisible(this.model, this.state, k)) return k;
    return this.config.questions.length;
  };
  Quiz.prototype.prevVisible = function (i) {
    for (var k = i - 1; k >= 0; k--) if (isVisible(this.model, this.state, k)) return k;
    return -1;
  };
  // answering question qi clears later answers whose visibility may change, then moves on
  Quiz.prototype.advance = function (qi) {
    var n = this.config.questions.length;
    for (var k = qi + 1; k < n; k++) if (!isVisible(this.model, this.state, k)) this.state[k] = null;
    var next = this.nextVisible(qi);
    if (next < n) this.show(next); else this.finish(true);
  };
  Quiz.prototype.toggle = function (btn) {
    var qi = +btn.getAttribute('data-q'), q = this.config.questions[qi];
    var cur = Array.isArray(this.state[qi]) ? this.state[qi].slice() : [];
    var a = findAnswer(q, btn.getAttribute('data-a')), at = cur.indexOf(a);
    if (at >= 0) cur.splice(at, 1);
    else if (cur.length < (q.max || 3)) cur.push(a);
    this.state[qi] = cur;
    var self = this;
    this.app.querySelectorAll('[data-act=toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(cur.indexOf(findAnswer(q, b.getAttribute('data-a'))) >= 0));
    });
    var next = this.app.querySelector('[data-act=next]');
    if (next) next.disabled = cur.length < (q.min || 1);
    var hint = this.app.querySelector('[data-sq-count]');
    if (hint) hint.textContent = fill(self.copy.multi_count, { n: cur.length, max: q.max || 3 });
  };
  Quiz.prototype.pickPerfume = function (qi, kind, id) {
    this.state[qi] = kind === 'skip' ? 'skip' : { kind: kind, id: id };
    this.advance(qi);
  };
  // search our shelf and the reference list by name or house
  Quiz.prototype.searchIndex = function () {
    if (this._index) return this._index;
    var norm = function (x) { return String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var list = [], seen = {};
    this.model.products.forEach(function (p) {
      if (!p.vec) return;
      seen[norm(p.house + ' ' + p.title)] = 1;
      list.push({ kind: 'own', id: p.handle, name: p.title, house: p.house, key: norm(p.title + ' ' + p.house) });
    });
    (this.model.refs || []).forEach(function (r) {
      if (seen[norm(r.house + ' ' + r.name)]) return;
      list.push({ kind: 'ref', id: r.id, name: r.name, house: r.house, key: norm(r.name + ' ' + r.house) });
    });
    this._norm = norm;
    return (this._index = list);
  };
  Quiz.prototype.search = function (input) {
    var qi = +input.getAttribute('data-q'), box = this.app.querySelector('[data-sq-results]');
    var list = this.searchIndex();
    var words = this._norm(input.value).split(/\s+/).filter(Boolean);
    var hits = !words.length ? [] : list.filter(function (x) { return words.every(function (w) { return x.key.indexOf(w) >= 0; }); }).slice(0, 8);
    var c = this.copy;
    box.innerHTML = hits.map(function (x) {
      return '<li><button type="button" class="sq-result-item" data-act="perfume" data-q="' + qi + '" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '">' +
        '<span class="sq-result-item__name">' + esc(x.name) + '</span><span class="sq-result-item__house">' + esc(x.house) + (x.kind === 'own' ? ' · ' + esc(c.on_our_shelf) : '') + '</span></button></li>';
    }).join('') + (words.length && !hits.length ? '<li class="sq-noresult">' + esc(c.search_none) + '</li>' : '');
  };

  Quiz.prototype.pick = function (qi, id) {
    this.state[qi] = findAnswer(this.config.questions[qi], id);
    this.advance(qi);
  };

  Quiz.prototype.restart = function () {
    this.state = [];
    this.shared = false;
    this.result = null;
    this.blob = null;
    this.setUrl(null);
    this.show(this.nextVisible(-1));
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
    u.searchParams.set(PARAM, encodeCode(this.model, this.state));
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
    // steps shown = questions visible with the answers so far (later branches assumed as-is)
    var n = 0, at = 0;
    for (var k = 0; k < this.config.questions.length; k++) {
      if (k === i || isVisible(this.model, this.state, k)) { n++; if (k <= i) at = n; }
    }
    return '<div class="sq-top">' +
      '<button type="button" class="sq-back" data-act="back"><span aria-hidden="true">&larr;</span> ' + esc(this.copy.back) + '</button>' +
      '<p class="sq-step">' + esc(fill(this.copy.step, { n: at, total: n })) + '</p></div>' +
      '<div class="sq-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + at + '"><span style="width:' + (at / n * 100) + '%"></span></div>';
  };

  // "what's inside": the canonical notes and top families of a taste vector
  Quiz.prototype.dna = function (vec, canon, max) {
    var t = this.model.taste, labels = this.copy.families || {};
    var fams = t.families.map(function (f, i) { return { f: f, v: vec[i] || 0 }; })
      .filter(function (x) { return x.v > 0.04; }).sort(function (a, b) { return b.v - a.v; }).slice(0, max || 3);
    var notes = (canon || []).slice(0, 5).map(function (c) { return t.canon[c] ? t.canon[c][0] : ''; }).filter(Boolean);
    return {
      notes: notes,
      families: fams.map(function (x) { return { key: x.f, label: labels[x.f] || x.f, pct: Math.round(x.v * 100) }; })
    };
  };
  Quiz.prototype.dnaHtml = function (d) {
    return '<div class="sq-dna">' +
      (d.notes.length ? '<p class="sq-dna__notes">' + d.notes.map(esc).join(' · ') + '</p>' : '') +
      '<ul class="sq-dna__bars">' + d.families.map(function (f) {
        return '<li><span class="sq-dna__label">' + esc(f.label) + '</span><span class="sq-dna__track"><span style="width:' + f.pct + '%"></span></span><span class="sq-dna__pct">' + f.pct + '%</span></li>';
      }).join('') + '</ul></div>';
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
    if (i >= this.config.questions.length) { this.finish(true); return; }
    var q = this.config.questions[i], v = this.state[i];
    var head = '<div class="sq-screen sq-q" data-q="' + esc(q.id) + '">' + this.progress(i) +
      '<h2 class="sq-title" tabindex="-1" data-sq-focus>' + esc(q.title) + '</h2>' +
      (q.subtitle ? '<p class="sq-lead sq-sub">' + esc(q.subtitle) + '</p>' : '');
    if (q.type === 'perfume') { this.render(head + this.perfumeScreen(q, i) + '</div>'); return; }
    // show the DNA of the named perfume above the "similar or complement" choice
    var dna = '';
    if (q.show_dna) {
      var pf = perfumeOf(this.model, this.state[qIndex(this.config, q.show_dna)]);
      if (pf) dna = '<div class="sq-ref"><p class="sq-kicker">' + esc(fill(c.dna_title, { name: pf.name })) + '</p><p class="sq-ref__house">' + esc(pf.house) + '</p>' + this.dnaHtml(this.dna(pf.vec, pf.canon)) + '</div>';
    }
    var multi = q.type === 'multi';
    var chosen = multi ? (Array.isArray(v) ? v : []) : (v && v.id ? [v] : []);
    var tiles = q.answers.map(function (a) {
      return '<li><button type="button" class="sq-tile" data-act="' + (multi ? 'toggle' : 'answer') + '" data-q="' + i + '" data-a="' + esc(a.id) + '" aria-pressed="' + (chosen.indexOf(a) >= 0) + '">' +
        '<span class="sq-tile__img">' + self.img(a, i === self.nextVisible(-1)) + '</span>' +
        '<span class="sq-tile__label">' + esc(a.label) + '</span>' + (a.hint ? '<span class="sq-tile__hint">' + esc(a.hint) + '</span>' : '') + '</button></li>';
    }).join('');
    var foot = multi ? '<div class="sq-next"><p class="sq-step" data-sq-count>' + esc(fill(c.multi_count, { n: chosen.length, max: q.max || 3 })) + '</p>' +
      '<button type="button" class="sq-btn" data-act="next" data-q="' + i + '"' + (chosen.length < (q.min || 1) ? ' disabled' : '') + '>' + esc(c.next) + '</button></div>' : '';
    this.render(head + dna + '<ul class="sq-tiles" data-count="' + q.answers.length + '"' + (multi ? ' data-multi' : '') + '>' + tiles + '</ul>' + foot + '</div>');
  };

  Quiz.prototype.perfumeScreen = function (q, i) {
    var c = this.copy, self = this, v = this.state[i];
    var pop = this.searchIndex().filter(function (x) {
      if (x.kind === 'own') return (q.popular_own || []).indexOf(x.id) >= 0;
      var r = self.model.refs.filter(function (y) { return y.id === x.id; })[0];
      return r && r.popular;
    });
    var cur = v && v !== 'skip' ? v.id : null;
    return '<div class="sq-pick">' +
      '<label class="sq-search"><span class="sq-search__label">' + esc(c.search_label) + '</span>' +
      '<input type="search" id="sq-search-' + i + '" data-sq-search data-q="' + i + '" placeholder="' + esc(c.search_placeholder) + '" autocomplete="off" spellcheck="false"></label>' +
      '<ul class="sq-results" data-sq-results></ul>' +
      '<p class="sq-pop-title">' + esc(c.popular_title) + '</p>' +
      '<ul class="sq-chips">' + pop.map(function (x) {
        return '<li><button type="button" class="sq-chip" data-act="perfume" data-q="' + i + '" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '" aria-pressed="' + (cur === x.id) + '">' +
          '<span>' + esc(x.name) + '</span><small>' + esc(x.house) + '</small></button></li>';
      }).join('') + '</ul>' +
      '<button type="button" class="sq-restart" data-act="skip" data-q="' + i + '">' + esc(q.skip_label || c.skip) + '</button></div>';
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
    var answers = flatten(this.state), ctx = tasteContext(this.model, this.state);
    this.ctx = ctx;
    var first = recommend(this.model, answers, { candidates: S.live_check, taste: ctx });
    var check = first.candidates.concat(this.model.sets);
    if (first.own) check.push(first.own);
    var axes = this.config.wardrobes || [];
    axes.forEach(function (w) { wardrobe(self.model, answers, w.question, { taste: ctx }).forEach(function (r) { check.push(r.p); }); });
    this.refreshLive(check).then(function () {
      var res = recommend(self.model, answers, { taste: ctx });
      res.wardrobes = {};
      axes.forEach(function (w) { res.wardrobes[w.id] = wardrobe(self.model, answers, w.question, { taste: ctx }); });
      self.result = res;
      self.setUrl(encodeCode(self.model, self.state));
      if (fresh) {
        var ans = {};
        self.config.questions.forEach(function (q, i) {
          var v = self.state[i];
          if (v == null) return;
          ans[q.id] = v === 'skip' ? 'skip' : Array.isArray(v) ? v.map(function (a) { return a.id; }).join('+') : q.type === 'perfume' ? v.id : v.id;
        });
        publish(self.root, 'quiz_completed', { quiz: self.config.id, answers: ans, persona: res.persona && res.persona.key, taste_mode: ctx ? ctx.mode : null, products: res.items.map(function (r) { return r.p.handle; }) });
      }
      self.showResult();
    });
  };

  // one line from the notes ("Shares the vanilla and tonka of your Black Opium.") ...
  Quiz.prototype.whyTaste = function (r) {
    var ctx = this.ctx, c = this.copy, t = this.model.taste;
    if (!ctx || !t) return '';
    var notes = (r.shared || []).slice(0, 3).map(function (k) { return t.canon[k] ? t.canon[k][0] : ''; }).filter(Boolean);
    if (ctx.mode === 'families') {
      var labels = c.families || {}, mine = [];
      t.families.forEach(function (f, i) { if (ctx.families.indexOf(f) >= 0 && r.p.vec && r.p.vec[i] >= 0.15) mine.push((labels[f] || f).toLowerCase()); });
      return mine.length ? fill(c.why_families, { list: joinList(mine.slice(0, 2), c.and) }) : '';
    }
    if (!notes.length) return ctx.mode === 'complement' ? fill(c.why_complement_free, { name: ctx.label }) : '';
    var top = this.dna(r.p.vec || [], [], 1).families[0];
    return fill(ctx.mode === 'complement' ? c.why_complement : c.why_similar, {
      notes: joinList(notes, c.and), name: ctx.label, family: top ? top.label.toLowerCase() : ''
    });
  };
  // ... and one from the answers ("Picked for evenings out and cold air.")
  Quiz.prototype.why = function (r) {
    var order = this.config.why_order || this.config.questions.map(function (q) { return q.id; });
    var parts = [];
    order.forEach(function (qid) {
      r.matched.forEach(function (a) { if (a.q === qid && a.why && parts.indexOf(a.why) < 0) parts.push(a.why); });
    });
    parts = parts.slice(0, this.ctx ? 2 : 3);
    return parts.length ? fill(this.copy.why, { list: joinList(parts, this.copy.and) }) : '';
  };

  // two or three key notes for a card: from the catalog row if present, else from the taste file
  Quiz.prototype.cardNotes = function (p) {
    if (p.notes) return p.notes;
    var t = this.model.taste;
    return t && p.canon ? p.canon.slice(0, 3).map(function (k) { return t.canon[k] ? t.canon[k][0] : ''; }).filter(Boolean).join(', ') : '';
  };

  Quiz.prototype.addAllBtn = function (list, rows) {
    var total = rows.reduce(function (s, r) { return s + r.p.price; }, 0);
    var label = list === 'matches' ? this.copy.add_all : fill(this.copy.add_all_shelves, { n: rows.length });
    return '<div class="sq-actions"><button type="button" class="sq-btn" data-act="add-all" data-list="' + list + '">' + esc(label) + ' · ' + esc(this.fmt.format(total)) + '</button></div>';
  };

  Quiz.prototype.card = function (r, i, head) {
    var p = r.p, c = this.copy;
    return '<li class="sq-card' + (head ? ' sq-card--shelf' : '') + (r.mine ? ' is-mine' : '') + '">' + (head || '') +
      '<a class="sq-card__img" href="' + esc(this.cartRoot + 'products/' + p.handle) + '" tabindex="-1" aria-hidden="true">' +
      (p.image ? '<img src="' + esc(cdnSized(p.image, 600)) + '" srcset="' + esc(cdnSized(p.image, 600)) + ' 600w, ' + esc(cdnSized(p.image, 900)) + ' 900w" sizes="(min-width: 750px) 20vw, 30vw" alt="" width="600" height="600" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async">' : '') + '</a>' +
      '<div class="sq-card__body">' +
      '<p class="sq-card__house">' + esc(p.house) + '</p>' +
      '<h3 class="sq-card__name"><a href="' + esc(this.cartRoot + 'products/' + p.handle) + '">' + esc(p.title) + '</a></h3>' +
      (this.whyTaste(r) ? '<p class="sq-card__why sq-card__why--taste">' + esc(this.whyTaste(r)) + '</p>' : '') +
      '<p class="sq-card__why">' + esc(this.why(r)) + '</p>' +
      (this.cardNotes(p) ? '<p class="sq-card__notes">' + esc(this.cardNotes(p)) + '</p>' : '') +
      '<button type="button" class="sq-btn sq-btn--line" data-act="add" data-variant="' + esc(p.variant) + '" data-handle="' + esc(p.handle) + '">' + esc(c.add_sample) + ' · ' + esc(this.fmt.format(p.price)) + '</button>' +
      '</div></li>';
  };

  Quiz.prototype.showResult = function () {
    var self = this, c = this.copy, res = this.result, per = res.persona || { name: '', line: '' };
    var html = '<div class="sq-screen sq-result">';
    if (this.shared) html += '<div class="sq-shared"><p>' + esc(c.shared_note) + '</p><button type="button" class="sq-btn sq-btn--line" data-act="restart">' + esc(c.shared_cta) + '</button></div>';
    html += '<p class="sq-kicker">' + esc(c.result_kicker) + '</p>' +
      '<h2 class="sq-title sq-persona" tabindex="-1" data-sq-focus>' + esc(per.name) + '</h2>' +
      '<p class="sq-lead">' + esc(per.line) + '</p>';
    if (res.fallback) html += '<p class="sq-note">' + esc(c.fallback_note) + '</p>';
    var ctx = this.ctx;
    if (ctx && ctx.mode !== 'families') {
      html += '<div class="sq-ref sq-ref--result"><p class="sq-kicker">' + esc(fill(ctx.mode === 'complement' ? c.result_from_complement : c.result_from_similar, { name: ctx.label })) + '</p>' +
        this.dnaHtml(this.dna(ctx.vec, ctx.canon)) + '</div>';
    } else if (ctx) {
      html += '<div class="sq-ref sq-ref--result"><p class="sq-kicker">' + esc(c.result_from_families) + '</p>' + this.dnaHtml(this.dna(decodeVec(ctx.vec.join('')), [], 3)) + '</div>';
    }
    if (res.own) {
      var o = res.own;
      html += '<aside class="sq-set sq-own"><a class="sq-set__img" href="' + esc(this.cartRoot + 'products/' + o.handle) + '" tabindex="-1" aria-hidden="true">' +
        (o.image ? '<img src="' + esc(cdnSized(o.image, 600)) + '" alt="" width="600" height="600" loading="lazy" decoding="async">' : '') + '</a>' +
        '<div><p class="sq-kicker">' + esc(c.own_kicker) + '</p><h3 class="sq-card__name"><a href="' + esc(this.cartRoot + 'products/' + o.handle) + '">' + esc(o.title) + '</a></h3>' +
        '<p class="sq-card__why">' + esc(o.house) + '</p>' +
        '<button type="button" class="sq-btn sq-btn--line" data-act="add" data-variant="' + esc(o.variant) + '" data-handle="' + esc(o.handle) + '">' + esc(c.add_sample) + ' · ' + esc(this.fmt.format(o.price)) + '</button></div></aside>';
    }
    var axes = (this.config.wardrobes || []).filter(function (w) { return (res.wardrobes[w.id] || []).length; });
    var tabs = [{ id: 'matches', label: c.tab_matches || c.result_list_title }].concat(axes);
    if (axes.length) {
      html += '<div class="sq-tabs" role="tablist" aria-label="' + esc(c.tabs_label || '') + '">' + tabs.map(function (t, i) {
        return '<button type="button" class="sq-tab" role="tab" id="sq-tab-' + t.id + '" aria-controls="sq-panel-' + t.id + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-act="tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>';
    }
    html += '<div class="sq-panel" role="tabpanel" id="sq-panel-matches" aria-labelledby="sq-tab-matches" data-panel="matches">' +
      '<h3 class="sq-subtitle">' + esc(ctx && ctx.mode === 'complement' ? c.result_list_title_complement : c.result_list_title) + '</h3>' +
      '<ol class="sq-cards">' + res.items.map(function (r, i) { return self.card(r, i); }).join('') + '</ol>' +
      this.addAllBtn('matches', res.items) + '</div>';
    axes.forEach(function (w) {
      var list = res.wardrobes[w.id];
      html += '<div class="sq-panel" role="tabpanel" id="sq-panel-' + w.id + '" aria-labelledby="sq-tab-' + w.id + '" data-panel="' + w.id + '" hidden>' +
        (w.intro ? '<p class="sq-lead sq-panel__intro">' + esc(w.intro) + '</p>' : '') +
        '<ol class="sq-cards sq-shelves">' + list.map(function (r, i) {
          return self.card(r, i + 2, '<div class="sq-shelf__head"><p class="sq-shelf__name">' + esc(r.shelf.label) + (r.mine ? ' <span class="sq-shelf__mine">' + esc(c.shelf_mine) + '</span>' : '') + '</p>' +
            (r.shelf.shelf_text ? '<p class="sq-shelf__text">' + esc(r.shelf.shelf_text) + '</p>' : '') + '</div>');
        }).join('') + '</ol>' + self.addAllBtn(w.id, list) + '</div>';
    });
    html += '<p class="sq-msg" role="status" data-sq-msg></p>';
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

  Quiz.prototype.tab = function (id, focus) {
    this.app.querySelectorAll('[data-act=tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    this.app.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== id; });
    publish(this.root, 'quiz_tab', { quiz: this.config.id, tab: id });
  };

  Quiz.prototype.addAll = function (btn) {
    var self = this, list = btn.getAttribute('data-list') || 'matches';
    var rows = list === 'matches' ? this.result.items : (this.result.wardrobes[list] || []);
    var items = rows.map(function (r) { return { id: r.p.variant, quantity: 1 }; });
    this.busy(btn, true);
    this.msg('');
    this.post(items).then(function () {
      publish(self.root, 'quiz_add_to_cart', { quiz: self.config.id, mode: 'all', list: list, items: rows.map(function (r) { return { variant_id: r.p.variant, handle: r.p.handle }; }) });
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
