/*! scent-quiz engine v3 - perfume-stylist consultation. Brand-agnostic: all text, images and products come from
    the config JSON asset (data-config), the taste JSON asset (data-taste) and the section's block overrides. */
(function (global) {
  'use strict';

  var DIMS = ['gender', 'moment', 'mood', 'presence', 'season'];
  var PARAM = 'sq';
  var KEEP_PARAMS = ['preview_theme_id'];

  // ================================================================== data
  // catalog = { img, houses[], values{dim:[...]}, fields[], items[[...]], sets[[...]] }  (see build script)
  // A dimension cell is one char per value: digit = index (store fact / solid derived), letter = Low-confidence derived.
  function decodeCatalog(cat) {
    var f = {};
    cat.fields.forEach(function (name, i) { f[name] = i; });
    function row(r, isSet) {
      var h = String(r[f.handle]);
      if (h.charAt(0) === '~') h = (cat.hpre || [])[r[f.house]] + h.slice(1);
      var p = {
        handle: h, title: r[f.title], house: cat.houses[r[f.house]] || '',
        image: r[f.image] ? (/^(https?:)?\/\//.test(r[f.image]) ? r[f.image] : cat.img + r[f.image]) : '',
        variant: r[f.variant], price: r[f.price], available: !!r[f.available], isSet: isSet, dims: {},
        hot: 0
      };
      DIMS.forEach(function (d) {
        var cell = f[d] != null ? String(r[f[d]] || '') : '';
        p.dims[d] = cell.split('').map(function (ch) {
          var low = ch >= 'a' && ch <= 'j';
          return { v: cat.values[d][low ? ch.charCodeAt(0) - 97 : +ch], low: low };
        });
      });
      return p;
    }
    return { products: cat.items.map(function (r) { return row(r, false); }), sets: (cat.sets || []).map(function (r) { return row(r, true); }) };
  }

  // taste = { families[], canon[[label, fam]], houses[], items[[vec, canon]], sets[[vec, canon]],
  //           refs[[id, name, house, gender, vec, canon, flags, aliases]], popular[[id, family]] }
  // vec = 12 digits (family share x 10), canon = ALL canonical notes as 2-digit indices, strongest first.
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
    model.ownByHandle = {};
    model.products.forEach(function (p) { model.ownByHandle[p.handle] = p; });
    // refs[i][8] = index of the same perfume on our shelf: then our own notes are used
    model.refs = (t.refs || []).map(function (r) {
      var own = r[8] != null ? model.products[r[8]] : null;
      return { id: r[0], name: r[1], house: t.houses ? t.houses[r[2]] : r[2], gender: r[3],
        vec: own ? own.vec : r[4] ? decodeVec(r[4]) : null, canon: own ? own.canon : decodeCanon(r[5]),
        popular: !!(r[6] & 1), img: !!(r[6] & 2), noNotes: !!(r[6] & 4), aliases: r[7] ? String(r[7]).split('|') : [], own: own };
    });
    model.refById = {};
    model.refs.forEach(function (r) { model.refById[r.id] = r; });
  }
  function cosine(a, b) {
    if (!a || !b) return 0;
    var d = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }
  function carries(p, dim, val) {
    var best = 0;
    (p.dims[dim] || []).forEach(function (d) { if (d.v === val) best = Math.max(best, d.low ? 0.5 : 1); });
    return best;
  }
  function famIndex(model, f) { return model.taste ? model.taste.families.indexOf(f) : -1; }

  // ================================================================== state
  // state = { for, refs:[{k:'r'|'p', id}] | 'none', notes:[family ids], taboos:[ids], week:[0..2 x rows],
  //           how, feel:[ids], presence, matters, climate, style }
  function Q(config, id) { return config.questions.filter(function (q) { return q.id === id; })[0]; }
  function findAnswer(q, id) { return q && (q.answers || []).filter(function (a) { return a.id === id; })[0] || null; }

  function perfumeOf(model, v) {
    if (!v) return null;
    if (v.k === 'p') {
      var p = model.ownByHandle && model.ownByHandle[v.id];
      return p && p.vec ? { key: 'p~' + p.handle, name: p.title, house: p.house, vec: p.vec, canon: p.canon, handle: p.handle } : null;
    }
    var r = model.refById && model.refById[v.id];
    return r ? { key: 'r~' + r.id, id: r.id, name: r.name, house: r.house, vec: r.vec, canon: r.canon || [], img: r.img, handle: r.own ? r.own.handle : null } : null;
  }
  function visible(model, state, qid) {
    var q = Q(model.config, qid);
    if (!q) return false;
    if ((q.type === 'perfume' || q.type === 'families') && !model.taste) return false;
    // the note families: without a perfume, or when none of the named perfumes publishes its notes
    if (q.show_if === 'no_ref') return state.ref === 'none' || (Array.isArray(state.ref) && state.ref.length > 0 &&
      !state.ref.some(function (v) { var pf = perfumeOf(model, v); return pf && pf.vec; }));
    return true;
  }

  // URL code: one token per question in config order, '.'-joined. multi: a+b, perfume: r~id+p~handle | none,
  // week: one digit per row, hidden: _
  function encodeCode(model, state) {
    return model.config.questions.map(function (q) {
      if (!visible(model, state, q.id)) return '_';
      var v = state[q.id];
      if (q.type === 'perfume') return v === 'none' ? 'none' : (v || []).map(function (x) { return x.k + '~' + x.id; }).join('+');
      if (q.type === 'week') return (v || []).join('');
      if (Array.isArray(v)) return v.length ? v.join('+') : '-';
      return v == null ? '_' : v;
    }).join('.');
  }
  function parseCode(model, code) {
    var qs = model.config.questions, toks = String(code || '').split('.'), state = {};
    if (toks.length !== qs.length) return null;
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], t = toks[i];
      if (t === '_') continue;
      if (q.type === 'perfume') {
        if (t === 'none') { state[q.id] = 'none'; continue; }
        var list = t.split('+').map(function (s) { var m = /^(r|p)~(.+)$/.exec(s); return m ? { k: m[1], id: m[2] } : null; });
        if (!list.length || list.length > (q.max || 2) || list.some(function (x) { return !x || !perfumeOf(model, x); })) return null;
        state[q.id] = list;
      } else if (q.type === 'week') {
        if (!new RegExp('^[0-2]{' + q.rows.length + '}$').test(t)) return null;
        state[q.id] = t.split('').map(Number);
      } else if (q.type === 'multi' || q.type === 'families' || q.type === 'taboo') {
        var ids = t === '-' ? [] : t.split('+');
        if (ids.some(function (id) { return !findAnswer(q, id); })) return null;
        if (ids.length > (q.max || 99) || ids.length < (q.min || 0)) return null;
        state[q.id] = ids;
      } else {
        if (!findAnswer(q, t)) return null;
        state[q.id] = t;
      }
    }
    for (var k = 0; k < qs.length; k++) if (visible(model, state, qs[k].id) !== (state[qs[k].id] != null)) return null;
    return state;
  }

  // ================================================================== profile & filters
  // what the visitor loves: the named perfumes, or the families they picked
  function tasteContext(model, state) {
    if (!model.taste) return null;
    var refs = state.ref && state.ref !== 'none' ? state.ref.map(function (v) { return perfumeOf(model, v); }).filter(function (r) { return r && r.vec; }) : [];
    if (refs.length) {
      var vec = model.taste.families.map(function (_, i) { return refs.reduce(function (s, r) { return s + r.vec[i]; }, 0) / refs.length; });
      return { mode: 'refs', refs: refs, vec: vec };
    }
    var fams = state.notes || [];
    if (!fams.length) return null;
    var q = Q(model.config, 'notes'), v2 = model.taste.families.map(function () { return 0; });
    fams.forEach(function (id) { var a = findAnswer(q, id); var k = a ? famIndex(model, a.family) : -1; if (k >= 0) v2[k] = 1; });
    return { mode: 'families', refs: [], vec: v2, families: fams.map(function (id) { return findAnswer(q, id).family; }) };
  }

  function canonIdx(model, ids) {
    var out = [];
    ids.forEach(function (id) { model.taste.canon.forEach(function (c, i) { if (c[2] === id) out.push(i); }); });
    return out;
  }
  // hard filter: a perfume carrying a tabooed note (or too much of a tabooed family) never appears
  function tabooRules(model, state) {
    var q = Q(model.config, 'taboos'), rules = [];
    (state.taboos || []).forEach(function (id) {
      var a = findAnswer(q, id);
      if (a && a.rule) rules.push({ id: id, notes: canonIdx(model, a.rule.notes || []), fam: a.rule.family ? famIndex(model, a.rule.family) : -1, max: a.rule.max_share || 1, presence: a.rule.presence || null });
    });
    return rules;
  }
  function breaksTaboo(p, rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.presence && carries(p, 'presence', r.presence) === 1) return r.id;
      if (!p.canon) continue;
      for (var j = 0; j < r.notes.length; j++) if (p.canon.indexOf(r.notes[j]) >= 0) return r.id;
      // family shares are stored rounded to tenths: stay strict by that margin so a borderline perfume never slips through
      if (r.fam >= 0 && p.vec && p.vec[r.fam] >= r.max - 0.06) return r.id;
    }
    return null;
  }
  // owner rule: gender matters only for perfumes in the gendered moods (Focus & Flow, Romance & Presence, Celebrate & Indulge)
  function genderOk(model, p, who) {
    var G = model.config.gender || {};
    if (!who || who === 'both') return true;
    var opposite = who === 'her' ? 'Masculine' : 'Feminine';
    var gs = (p.dims.gender || []).filter(function (g) { return !g.low; }).map(function (g) { return g.v; });
    if (!gs.length || gs.some(function (g) { return g !== opposite; })) return true;
    return !(G.moods || []).some(function (m) { return carries(p, 'mood', m) > 0; });
  }

  // ================================================================== slots
  // every week row at "sometimes" / "a lot" becomes a wardrobe slot, biggest first; "how" decides how many are kept
  function slotsFor(model, state) {
    var cfg = model.config, wq = Q(cfg, 'week'), levels = state.week || [];
    var byId = {};
    cfg.slots.forEach(function (s) { byId[s.id] = s; });
    var active = wq.rows.map(function (r, i) { return { slot: r.slot, lv: levels[i] || 0, i: i }; })
      .filter(function (x) { return x.lv > 0; })
      .sort(function (a, b) { return (b.lv - a.lv) || (a.i - b.i); })
      .map(function (x) { return x.slot; });
    var how = findAnswer(Q(cfg, 'how'), state.how) || { min: 1, max: 1 };
    var out = [];
    function add(id) { if (id && out.indexOf(id) < 0 && byId[id]) out.push(id); }
    if (how.split) {
      // day + night: the busiest day slot and the busiest night slot
      var day = active.filter(function (id) { return byId[id].time !== 'night'; })[0] || how.split[0];
      var night = active.filter(function (id) { return byId[id].time === 'night'; })[0] || how.split[1];
      var order = active.indexOf(night) >= 0 && (active.indexOf(day) < 0 || active.indexOf(night) < active.indexOf(day)) ? [night, day] : [day, night];
      order.forEach(add);
    } else {
      active.slice(0, how.max).forEach(add);
      (cfg.slot_fill || []).forEach(function (id) { if (out.length < how.min) add(id); });
    }
    return out.map(function (id) { return byId[id]; });
  }

  // ================================================================== scoring
  // 0..1 components, weighted: ref 35, slot 20, feel 15, presence 10, climate 10, style+matters 10
  function refFit(p, ctx) {
    if (!ctx || !p.vec) return { t: 0, shared: [], ref: null };
    if (ctx.mode === 'families') return { t: cosine(ctx.vec, p.vec), shared: [], ref: null };
    var best = { t: -1, shared: [], ref: null };
    ctx.refs.forEach(function (r) {
      var key = r.canon.slice(0, 8);
      var shared = r.canon.filter(function (c) { return p.canon.indexOf(c) >= 0; });
      var keyShared = shared.filter(function (c) { return key.indexOf(c) >= 0; }).length;
      var t = 0.65 * cosine(r.vec, p.vec) + 0.35 * Math.min(keyShared, 3) / 3;
      if (t > best.t) best = { t: t, shared: shared, ref: r };
    });
    return best;
  }
  var NEAR = { close: { noticed: 0.4 }, noticed: { close: 0.4, fills: 0.4 }, fills: { noticed: 0.4 } };
  function presenceFit(p, want) {
    var best = 0;
    (p.dims.presence || []).forEach(function (d) {
      var s = d.v === want ? 1 : (NEAR[want] && NEAR[want][d.v]) || 0;
      best = Math.max(best, d.low ? s * 0.5 : s);
    });
    return best;
  }
  function slotPresence(slot, state) {
    if (slot.presence) return slot.presence;
    if (slot.id === 'work' && (state.taboos || []).indexOf('office') >= 0) return 'close';
    return state.presence || 'noticed';
  }

  // context shared by every slot of one result
  function prepare(model, state) {
    var cfg = model.config, W = cfg.weights;
    var ctx = tasteContext(model, state);
    var rules = tabooRules(model, state);
    var feels = (state.feel || []).map(function (id) { return findAnswer(Q(cfg, 'feel'), id); }).filter(Boolean);
    // seasons ("climate"): one or more answers; per season the highest weight counts
    var cq = Q(cfg, 'climate'), chosen = (Array.isArray(state.climate) ? state.climate : state.climate ? [state.climate] : []).map(function (id) { return findAnswer(cq, id); }).filter(Boolean);
    var climate = chosen.length ? { seasons: {}, why: chosen[0].why } : null;
    chosen.forEach(function (a) { Object.keys(a.seasons || {}).forEach(function (k) { climate.seasons[k] = Math.max(climate.seasons[k] || 0, a.seasons[k]); }); });
    var pres = findAnswer(Q(cfg, 'presence'), state.presence);
    var style = findAnswer(Q(cfg, 'style'), state.style);
    var matters = findAnswer(Q(cfg, 'matters'), state.matters);
    var styleFams = style && style.families ? style.families.map(function (f) { return famIndex(model, f); }) : [];
    var avoid = {};
    // never recommend the perfume they already wear
    if (Array.isArray(state.ref)) state.ref.forEach(function (v) { var pf = perfumeOf(model, v); if (pf && pf.handle) avoid[pf.handle] = 1; });
    if (matters && matters.avoid_popular && model.closestToPopular) model.closestToPopular.forEach(function (h) { avoid[h] = 1; });
    var pool = model.products.filter(function (p) {
      return p.available && !breaksTaboo(p, rules) && genderOk(model, p, state['for']) && !avoid[p.handle] &&
        !(pres && pres.exclude_presence && carries(p, 'presence', pres.exclude_presence) === 1);
    });
    return { W: W, ctx: ctx, rules: rules, feels: feels, climate: climate, style: style, matters: matters, styleFams: styleFams, pool: pool, state: state };
  }

  function scoreFor(model, P, p, slot) {
    var W = P.W, parts = {};
    var rf = refFit(p, P.ctx);
    parts.ref = P.ctx ? rf.t : 0;
    var tag = slot.tag, s = carries(p, tag.dim, tag.value);
    if (!s && slot.related) Object.keys(slot.related).forEach(function (v) { s = Math.max(s, carries(p, tag.dim, v) * slot.related[v]); });
    if (!s && slot.related_mood) Object.keys(slot.related_mood).forEach(function (v) { s = Math.max(s, carries(p, 'mood', v) * slot.related_mood[v]); });
    parts.slot = s;
    var f = 0;
    P.feels.forEach(function (a) { (a.moods || []).forEach(function (m, i) { f = Math.max(f, carries(p, 'mood', m) * (i ? 0.7 : 1)); }); });
    parts.feel = f;
    parts.presence = presenceFit(p, slotPresence(slot, P.state));
    var c = 0;
    if (P.climate) Object.keys(P.climate.seasons).forEach(function (v) { c = Math.max(c, carries(p, 'season', v) * P.climate.seasons[v]); });
    parts.climate = c;
    var st = 0;
    if (p.vec) P.styleFams.forEach(function (k) { if (k >= 0) st += p.vec[k]; });
    parts.style = Math.min(1, st * 1.5);
    var m = 0.5;
    if (P.matters && model.fame) {
      var fame = model.fame[p.handle] || 0;
      if (P.matters.prefer === 'popular') m = fame;
      else if (P.matters.prefer === 'trending') m = Math.max(p.hot ? 1 : 0, fame * 0.6);
      else if (P.matters.prefer === 'rare') m = 1 - fame;
    }
    parts.matters = m;
    var score = W.ref * parts.ref + W.slot * parts.slot + W.feel * parts.feel + W.presence * parts.presence + W.climate * parts.climate +
      W.style * parts.style + W.matters * parts.matters;
    if (!P.ctx) score += W.ref * 0.5 * parts.slot; // no taste signal: lean on the occasion instead of a flat zero
    // "Unisex" on screen 1: unisex perfumes first, the others stay possible
    if (P.state['for'] === 'both' && (p.dims.gender || []).some(function (g) { return g.v === 'Unisex' && !g.low; })) score += 0.05;
    return { p: p, score: score, parts: parts, shared: rf.shared, ref: rf.ref };
  }

  function rankSlot(model, P, slot) {
    var pool = P.pool;
    // a scent-sensitive office: the work slot only takes perfumes that stay close to the skin
    if (slot.id === 'work' && (P.state.taboos || []).indexOf('office') >= 0) {
      var close = pool.filter(function (p) { return carries(p, 'presence', 'close') === 1; });
      if (close.length) pool = close;
    }
    return pool.map(function (p) { return scoreFor(model, P, p, slot); }).sort(function (a, b) {
      return (b.score - a.score) || (a.p.price - b.p.price) || (a.p.handle < b.p.handle ? -1 : 1);
    });
  }

  // the wardrobe: one perfume per slot, biggest slot first; no repeats, >= 2 houses when >= 2 slots, max 2 per house
  function wardrobe(model, state, opts) {
    var P = prepare(model, state), slots = slotsFor(model, state), S = model.config.scoring;
    var ranked = slots.map(function (s) { return rankSlot(model, P, s); });
    var used = {}, houses = {}, rows = [];
    slots.forEach(function (s, i) {
      var pick = ranked[i].filter(function (r) { return !used[r.p.handle] && (houses[r.p.house] || 0) < S.max_per_house; })[0] || null;
      if (pick) { used[pick.p.handle] = 1; houses[pick.p.house] = (houses[pick.p.house] || 0) + 1; }
      rows.push({ slot: s, pick: pick, ranked: ranked[i] });
    });
    // >= 2 houses: swap the weakest slot to the best perfume from another house
    var filled = rows.filter(function (r) { return r.pick; });
    if (filled.length >= 2 && Object.keys(houses).length < 2) {
      var last = filled[filled.length - 1], h = filled[0].pick.p.house;
      var alt = last.ranked.filter(function (r) { return !used[r.p.handle] && r.p.house !== h; })[0];
      if (alt) { delete used[last.pick.p.handle]; last.pick = alt; used[alt.p.handle] = 1; }
    }
    // "also fits this slot": next best, unused anywhere
    rows.forEach(function (r) {
      if (!r.pick) return;
      r.alt = r.ranked.filter(function (x) { return !used[x.p.handle]; })[0] || null;
      if (r.alt) used[r.alt.p.handle] = 1;
    });
    var set = null;
    if (filled.length && model.sets.length) {
      var top = rows[0];
      var sr = model.sets.filter(function (s) { return s.available && s.vec && setGenderOk(s, state['for']) && !breaksTaboo(s, P.rules) && !setBreaksTaboo(model, s, P.rules); })
        .map(function (s) { return scoreFor(model, P, s, top.slot); }).sort(function (a, b) { return b.score - a.score; })[0];
      if (sr && top.pick && sr.score >= (1 - S.set_within) * top.pick.score) set = sr;
    }
    var res = { rows: rows, set: set, ctx: P.ctx, P: P };
    res.persona = personaFor(model, res, state);
    res.profile = profileOf(model, res);
    res.candidates = opts && opts.candidates ? candidatesOf(rows, opts.candidates) : null;
    return res;
  }
  // the set card follows screen 1 strictly: her -> feminine or unisex sets, him -> masculine or unisex, both -> any
  function setGenderOk(s, who) {
    if (!who || who === 'both') return true;
    var g = (s.dims.gender || []).map(function (x) { return x.v; });
    return g.indexOf('Unisex') >= 0 || g.indexOf(who === 'her' ? 'Feminine' : 'Masculine') >= 0;
  }
  function setBreaksTaboo(model, s, rules) {
    return (s.members || []).some(function (h) { var p = model.ownByHandle[h]; return p && breaksTaboo(p, rules); });
  }
  function candidatesOf(rows, n) {
    var out = [], seen = {};
    rows.forEach(function (r) { r.ranked.slice(0, n).forEach(function (x) { if (!seen[x.p.handle]) { seen[x.p.handle] = 1; out.push(x.p); } }); });
    return out;
  }

  // ================================================================== persona & profile
  function union(list) {
    var u = {};
    list.forEach(function (p) { (p.canon || []).forEach(function (c) { u[c] = 1; }); });
    return u;
  }
  // a persona line names notes; it qualifies only if every named note is in at least one pick
  function personaQualifies(model, persona, have) {
    return (persona.notes || []).every(function (req) {
      return req.some(function (n) {
        if (n.indexOf('fam:') === 0) {
          var k = famIndex(model, n.slice(4));
          return model.taste.canon.some(function (c, i) { return c[1] === k && have[i]; });
        }
        return canonIdx(model, [n]).some(function (i) { return have[i]; });
      });
    });
  }
  function personaFor(model, res, state) {
    var P = model.config.personas;
    if (!P || !model.taste) return P ? P.list[0] : null;
    var picks = res.rows.filter(function (r) { return r.pick; }).map(function (r) { return r.pick.p; });
    var have = union(picks);
    var feel = findAnswer(Q(model.config, 'feel'), (state.feel || [])[0]);
    var mood = feel && feel.moods ? feel.moods[0] : null;
    var matrixKey = mood && P.matrix[mood] ? P.matrix[mood][state.presence] : null;
    var style = findAnswer(Q(model.config, 'style'), state.style);
    var best = null;
    P.list.forEach(function (x, i) {
      if (!personaQualifies(model, x, have)) return;
      var s = (x.notes || []).length * 2 + (x.key === matrixKey ? 3 : 0) + (style && (style.personas || []).indexOf(x.key) >= 0 ? 1.5 : 0) - i * 0.001;
      if (!best || s > best.s) best = { s: s, x: x };
    });
    return best ? best.x : (P.list.filter(function (x) { return !(x.notes || []).length; })[0] || P.list[0]);
  }
  function profileOf(model, res) {
    if (!model.taste) return [];
    var picks = res.rows.filter(function (r) { return r.pick && r.pick.p.vec; }).map(function (r) { return r.pick.p.vec; });
    var fams = model.taste.families, vec = fams.map(function () { return 0; });
    picks.forEach(function (v) { v.forEach(function (x, i) { vec[i] += x / picks.length; }); });
    if (res.ctx) vec = vec.map(function (x, i) { return picks.length ? (x + res.ctx.vec[i] / (res.ctx.mode === 'families' ? res.ctx.vec.reduce(function (a, b) { return a + b; }, 0) : 1)) / 2 : x; });
    var top = fams.map(function (f, i) { return { f: f, v: vec[i] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
    var sum = top.reduce(function (s, x) { return s + x.v; }, 0) || 1;
    var pct = top.map(function (x) { return Math.round(x.v / sum * 100); });
    pct[0] += 100 - pct.reduce(function (a, b) { return a + b; }, 0);
    return top.map(function (x, i) { return { family: x.f, pct: pct[i] }; });
  }

  // ================================================================== texts
  function noteLabel(model, i) { return model.taste && model.taste.canon[i] ? model.taste.canon[i][0] : ''; }
  function joinList(parts, and) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' ' + and + ' ' + parts[parts.length - 1];
  }
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  // line 1: only notes both perfumes really carry
  function sharesLine(model, r, c) {
    if (!r.ref || !r.shared.length) return '';
    // specific notes first; broad catch-alls ("woods", "floral notes") only when nothing specific is shared
    var spec = r.shared.filter(function (i) { return !model.taste.canon[i][3]; });
    var notes = (spec.length ? spec : r.shared).slice(0, 3).map(function (i) { return noteLabel(model, i); });
    return fill(c.shares, { notes: joinList(notes, c.and), name: r.ref.name });
  }
  // line 2: from this perfume's own matched tags + 2-3 of its real notes; unique within one result
  function whyLines(model, res, c) {
    var used = {}, out = [];
    var P = res.P;
    res.rows.forEach(function (row) {
      if (!row.pick) { out.push(''); return; }
      var r = row.pick, p = r.p, leads = [];
      if (r.parts.slot >= 1 && row.slot.why) leads.push(row.slot.why);
      P.feels.forEach(function (a) { if (a.why && (a.moods || []).some(function (m) { return carries(p, 'mood', m) === 1; })) leads.push(a.why); });
      if (P.climate && P.climate.why && r.parts.climate >= 1) leads.push(P.climate.why);
      if (r.parts.slot > 0 && r.parts.slot < 1 && row.slot.why) leads.push(row.slot.why_near || row.slot.why);
      var top = model.taste ? model.taste.families.map(function (f, i) { return { f: f, v: (p.vec || [])[i] || 0 }; }).sort(function (a, b) { return b.v - a.v; })[0] : null;
      if (top) leads.push(fill(c.why_family_lead, { family: ((c.families || {})[top.f] || top.f).toLowerCase() }));
      var shared = r.shared || [];
      var spec = (p.canon || []).filter(function (i) { return !model.taste.canon[i][3]; });
      var own = (spec.length >= 2 ? spec : p.canon || []).filter(function (i) { return shared.slice(0, 3).indexOf(i) < 0; });
      if (own.length < 2) own = (p.canon || []).slice();
      var combos = [];
      for (var a = 0; a < own.length; a++) for (var b = a + 1; b < own.length; b++) {
        combos.push([own[a], own[b]]);
        if (b + 1 < own.length) combos.push([own[a], own[b], own[b + 1]]);
      }
      combos.sort(function (x, y) { return (x[0] + x[1] * 0.01) - (y[0] + y[1] * 0.01); });
      var ordered = [];
      for (var k = 0; k < own.length - 1; k++) { ordered.push(own.slice(k, k + 3)); ordered.push(own.slice(k, k + 2)); }
      ordered = ordered.concat(combos).filter(function (x) { return x.length >= 2 || own.length < 2; });
      if (!ordered.length && own.length) ordered = [own.slice(0, 1)];
      var pres = c.why_presence && c.why_presence[(p.dims.presence[0] || {}).v] || '';
      var line = '';
      for (var li = 0; li < leads.length && !line; li++) {
        for (var oi = 0; oi < ordered.length && !line; oi++) {
          var cand = fill(c.why, { lead: leads[li], notes: joinList(ordered[oi].map(function (i) { return noteLabel(model, i); }), c.and), presence: pres });
          if (!used[cand]) line = cand;
        }
      }
      if (line) used[line] = 1;
      row.whyNotes = line ? ordered : [];
      out.push(line);
    });
    return out;
  }
  function howToWear(model, row, c) {
    var p = row.pick.p, pr = (p.dims.presence[0] || {}).v || 'noticed';
    return fill(c.how_to_wear, { sprays: (c.sprays || {})[pr] || '', where: row.slot.where || '' });
  }

  // ================================================================== search
  function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  // Damerau-Levenshtein with a cap (returns cap + 1 when farther)
  function dist(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      var rowMin = cap + 1;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > cap) return cap + 1;
    }
    return d[a.length][b.length];
  }
  var STOP = { de: 1, du: 1, la: 1, le: 1, l: 1, d: 1, the: 1, and: 1, eau: 1, parfum: 1, perfume: 1, edp: 1, edt: 1, toilette: 1, by: 1, for: 1, pour: 1, of: 1 };
  function buildIndex(model) {
    var list = [], seen = {};
    var HA = (model.taste && model.taste.house_aliases) || {};
    function entry(kind, id, name, house, aliases) {
      var names = [name].concat(aliases || []).map(norm);
      var htoks = norm(house).split(' ');
      (HA[house] || []).forEach(function (a) { norm(a).split(' ').forEach(function (t) { if (htoks.indexOf(t) < 0) htoks.push(t); }); });
      return { kind: kind, id: id, name: name, house: house, names: names, ntoks: names.map(function (n) { return n.split(' '); }), htoks: htoks, joined: names.map(function (n) { return n.replace(/ /g, ''); }) };
    }
    // a popular perfume we also stock is listed once, under its popular name and aliases
    (model.refs || []).forEach(function (r, i) {
      if (r.own) seen[r.own.handle] = 1;
      var e = entry('r', r.id, r.name, r.house, r.aliases);
      e.rank = i;
      e.own = !!r.own;
      e.g = r.gender;
      list.push(e);
    });
    model.products.forEach(function (p) {
      if (!p.vec || seen[p.handle]) return;
      var e = entry('p', p.handle, p.title, p.house, []);
      e.own = true;
      e.rank = 1000 + list.length;
      var gs = (p.dims.gender || []).map(function (x) { return x.v; });
      e.g = gs.indexOf('Unisex') >= 0 || (gs.indexOf('Feminine') >= 0 && gs.indexOf('Masculine') >= 0) ? 'U' : gs.indexOf('Feminine') >= 0 ? 'F' : gs.indexOf('Masculine') >= 0 ? 'M' : '';
      list.push(e);
    });
    return list;
  }
  function tokScore(q, t) {
    if (q === t) return 3;
    if (q.length >= 2 && t.indexOf(q) === 0) return 2.4;
    var cap = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    if (!cap) return 0;
    var d = dist(q, t.length > q.length + 2 ? t.slice(0, q.length + 1) : t, cap);
    if (d <= cap) return 2.2 - 0.5 * d;
    return 0;
  }
  // query words may name the house, the perfume, or both, in any order, with typos (up to 2 edits)
  function search(index, query, limit, who) {
    var qn = norm(query);
    if (!qn) return [];
    // filler words ("eau", "de", "parfum") count when they hit, but a miss does not rule a perfume out
    var all0 = qn.split(' '), qt = all0.filter(function (w) { return !STOP[w]; });
    var opt = all0.filter(function (w) { return STOP[w]; });
    if (!qt.length) { qt = all0; opt = []; }
    var qj = qn.replace(/ /g, '');
    var hits = [];
    index.forEach(function (e) {
      var best = 0;
      // whole query against a whole name / alias ("lveb", "br540", "bacarat")
      e.joined.forEach(function (j, i) {
        if (j === qj) best = Math.max(best, 10);
        else if (qj.length >= 3 && j.indexOf(qj) === 0) best = Math.max(best, 8);
        else if (qj.length >= 5) { var d = dist(qj, j, 2); if (d <= 2) best = Math.max(best, 7.5 - d); }
      });
      // word by word: every query word must hit the name or the house
      var sum = 0, nameHit = 0, all = true;
      qt.forEach(function (w) {
        var s = 0, onName = false;
        e.ntoks.forEach(function (toks) { toks.forEach(function (t) { var x = tokScore(w, t); if (x > s) { s = x; onName = true; } }); });
        e.htoks.forEach(function (t) { var x = tokScore(w, t) * 0.8; if (x > s) { s = x; onName = false; } });
        if (!s) all = false;
        sum += s;
        if (onName) nameHit++;
      });
      var bonus = 0;
      opt.forEach(function (w) { e.ntoks[0].forEach(function (t) { if (t === w) bonus += 0.4; }); });
      if (all && nameHit) best = Math.max(best, sum / qt.length + Math.min(qt.length, 3) * 0.6 + (nameHit === qt.length ? 0.3 : 0) + bonus);
      else if (all) best = Math.max(best, sum / qt.length * 0.5);
      // ties: fewer extra words in the name first ("Bleu de Chanel" before "... Parfum"), then the more popular perfume
      var extra = e.ntoks[0].filter(function (t) { return !STOP[t] && !qt.some(function (w) { return tokScore(w, t) > 0; }); }).length;
      // screen 1 answer: perfumes of that gender (and unisex) rank first; nothing is hidden
      var fit = who && e.g ? (e.g === 'U' || e.g === (who === 'her' ? 'F' : who === 'him' ? 'M' : 'U') ? 0.6 : 0) : 0;
      if (best > 0) hits.push({ e: e, s: best + fit - extra * 0.05 - (e.rank || 0) * 0.00001 });
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    return hits.slice(0, limit || 8).map(function (h) { return h.e; });
  }

  function buildModel(config, tasteData) {
    config.questions.forEach(function (q) { (q.answers || []).forEach(function (a) { a.q = q.id; if (a.image && a.image.charAt(0) === '@') a.image = (config.cdn || '') + a.image.slice(1); }); });
    var cat = decodeCatalog(config.catalog);
    var model = { config: config, products: cat.products, sets: cat.sets };
    (config.catalog.hot || []).forEach(function (i) { if (model.products[i]) model.products[i].hot = 1; });
    (config.catalog.set_members || []).forEach(function (m, i) { if (model.sets[i]) model.sets[i].members = m.map(function (k) { return model.products[k] && model.products[k].handle; }); });
    attachTaste(model, tasteData);
    if (model.taste) {
      // "fame" of a perfume we stock: how close it sits to the profiles everybody wears (the popular references)
      var pops = model.refs.filter(function (r) { return r.popular; });
      var famous = {};
      (config.famous_houses || []).forEach(function (h) { famous[h] = 1; });
      model.fame = {};
      model.products.forEach(function (p) {
        var m = 0;
        pops.forEach(function (r) { m = Math.max(m, cosine(r.vec, p.vec)); });
        model.fame[p.handle] = Math.min(1, 0.6 * m + (famous[p.house] ? 0.4 : 0) + (p.hot ? 0.2 : 0));
      });
      // the two closest perfumes we stock to each popular profile ("unique" excludes them)
      model.closestToPopular = [];
      pops.forEach(function (r) {
        model.products.filter(function (p) { return p.vec; }).map(function (p) { return { h: p.handle, c: cosine(r.vec, p.vec) }; })
          .sort(function (a, b) { return b.c - a.c; }).slice(0, 2).forEach(function (x) { model.closestToPopular.push(x.h); });
      });
    }
    return model;
  }

  var API = { decodeCatalog: decodeCatalog, buildModel: buildModel, encodeCode: encodeCode, parseCode: parseCode, wardrobe: wardrobe,
    slotsFor: slotsFor, tasteContext: tasteContext, breaksTaboo: breaksTaboo, tabooRules: tabooRules, personaQualifies: personaQualifies,
    whyLines: whyLines, sharesLine: sharesLine, howToWear: howToWear, union: union, buildIndex: buildIndex, search: search, norm: norm,
    dist: dist, perfumeOf: perfumeOf, visible: visible, cosine: cosine, genderOk: genderOk, setGenderOk: setGenderOk, noteLabel: noteLabel };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.ScentQuiz = API;
  if (typeof document === 'undefined') return;

  // ================================================================== UI
  // temporary line icons (stroke = currentColor) until the owner's own icon files are uploaded
  var ICONS = {
    winter: '<path d="M24 6v36M8.4 15l31.2 18M8.4 33l31.2-18M19 9l5 4 5-4M19 39l5-4 5 4"/>',
    spring: '<path d="M24 42V22M24 22c-9 0-14-6-14-14 9 0 14 6 14 14zM24 30c7 0 11-5 11-11-7 0-11 5-11 11z"/>',
    summer: '<circle cx="24" cy="24" r="8"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/>',
    fall: '<path d="M24 44V24M24 6l4 8 8-3-3 9 8 3-9 5 2 7-10-4-10 4 2-7-9-5 8-3-3-9 8 3z"/>',
    'all-year': '<path d="M38 18a15 15 0 0 0-27-4M10 30a15 15 0 0 0 27 4M11 6v8h8M37 42v-8h-8"/>'
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function cdnSized(url, w) {
    if (!url) return '';
    if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return url;
    return url.replace(/([?&])width=\d+&?/, '$1').replace(/[?&]$/, '') + (url.indexOf('?') >= 0 ? '&' : '?') + 'width=' + w;
  }
  function publish(root, name, data) {
    try {
      if (global.Shopify && global.Shopify.analytics && typeof global.Shopify.analytics.publish === 'function') global.Shopify.analytics.publish(name, data);
    } catch (e) { /* analytics must never break the quiz */ }
    root.dispatchEvent(new CustomEvent('scent-quiz:' + name, { bubbles: true, detail: data }));
  }

  function Quiz(root) {
    this.root = root;
    this.app = root.querySelector('[data-sq-app]');
    this.state = {};
    this.step = -1;
    this.shared = false;
    this.cartRoot = (global.Shopify && global.Shopify.routes && global.Shopify.routes.root) || '/';
    this.live = {};
    // reference bottle images sit next to the config asset: .../assets/sq-ref-<id>.webp
    var cfgUrl = root.getAttribute('data-config') || '';
    this.assetBase = cfgUrl.replace(/[^/]*$/, '');
  }

  Quiz.prototype.load = function () {
    var self = this;
    var get = function (url) {
      return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
    };
    var tasteUrl = this.root.getAttribute('data-taste');
    return Promise.all([get(this.root.getAttribute('data-config')), tasteUrl ? get(tasteUrl).catch(function () { return null; }) : Promise.resolve(null)])
      .then(function (both) {
        var config = both[0];
        self.applyOverrides(config);
        self.model = buildModel(config, both[1]);
        self.config = config;
        self.copy = config.copy;
        self.qs = config.questions;
        self.fmt = new Intl.NumberFormat(config.locale || 'en-US', { style: 'currency', currency: config.currency || 'USD' });
        self.bind();
        self.root.hidden = false;
        var code = new URLSearchParams(global.location.search).get(PARAM);
        if (code) code = code.replace(/ /g, '+');
        var shared = code && parseCode(self.model, code);
        if (shared) { self.shared = true; self.state = shared; self.finish(false); } else self.show(-1);
      })
      .catch(function (e) { if (global.console) console.warn('[scent-quiz]', e); });
  };

  // section blocks (theme editor) override question titles, answer labels/images and persona texts
  Quiz.prototype.applyOverrides = function (config) {
    var el = this.root.querySelector('[data-sq-overrides]'), o = {};
    try { if (el) o = JSON.parse(el.textContent); } catch (e) { o = {}; }
    this.blocks = o.blocks || [];
    var s = o.settings || {};
    Object.keys(s).forEach(function (k) { if (s[k]) config.copy[k] = s[k]; });
    this.blocks.forEach(function (b) {
      var q = Q(config, b.q);
      if (b.type === 'question' && q && b.title) q.title = b.title;
      if (b.type === 'answer' && q) {
        var a = findAnswer(q, b.a);
        if (!a) return;
        if (b.label) a.label = b.label;
        if (b.img) a.img = b.img;
        a.block = b.id;
      }
    });
    if (config.personas) document.querySelectorAll('[data-sq-persona]').forEach(function (li) {
      var p = config.personas.list.filter(function (x) { return x.key === li.getAttribute('data-sq-persona'); })[0];
      var h = li.querySelector('h3'), d = li.querySelector('p');
      if (p && h && h.textContent.trim()) p.name = h.textContent.trim();
      if (p && d && d.textContent.trim() && d.textContent.trim() !== p.line) { p.line = d.textContent.trim(); }
    });
  };

  Quiz.prototype.bind = function () {
    var self = this;
    this.app.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !self.app.contains(t)) return;
      var act = t.getAttribute('data-act'), qid = t.getAttribute('data-q');
      if (act === 'start') { publish(self.root, 'quiz_started', { quiz: self.config.id }); self.state = {}; self.go(0); }
      else if (act === 'answer') { self.state[qid] = t.getAttribute('data-a'); self.advance(qid); }
      else if (act === 'toggle') self.toggle(t);
      else if (act === 'level') self.level(t);
      else if (act === 'next') self.advance(qid);
      else if (act === 'perfume') self.addPerfume(qid, t.getAttribute('data-kind'), t.getAttribute('data-id'));
      else if (act === 'unpick') self.removePerfume(qid, t.getAttribute('data-key'));
      else if (act === 'no-ref') { self.state[qid] = 'none'; self.advance(qid); }
      else if (act === 'back') self.go(self.prevVisible(self.step));
      else if (act === 'add') self.addOne(t);
      else if (act === 'add-all') self.addAll(t);
      else if (act === 'add-set') self.addOne(t, 'set');
      else if (act === 'restart') self.restart();
      else if (act === 'share-open') self.openShare(t);
      else if (act === 'download') self.shareDownload();
      else if (act === 'native') self.shareNative();
      else if (act === 'copy') self.shareCopy(t);
    });
    this.app.addEventListener('input', function (e) { if (e.target.matches('[data-sq-search]')) self.search(e.target); });
    this.app.addEventListener('keydown', function (e) {
      if (!e.target.matches('[data-sq-search]')) return;
      var first = self.app.querySelector('[data-sq-results] button');
      if (e.key === 'Enter' && first) { e.preventDefault(); first.click(); }
      if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
    });
  };

  Quiz.prototype.nextVisible = function (i) {
    for (var k = i + 1; k < this.qs.length; k++) if (visible(this.model, this.state, this.qs[k].id)) return k;
    return this.qs.length;
  };
  Quiz.prototype.prevVisible = function (i) {
    for (var k = i - 1; k >= 0; k--) if (visible(this.model, this.state, this.qs[k].id)) return k;
    return -1;
  };
  Quiz.prototype.go = function (i) {
    if (i >= 0 && i < this.qs.length && !visible(this.model, this.state, this.qs[i].id)) i = this.nextVisible(i);
    if (i >= this.qs.length) this.finish(true); else this.show(i);
  };
  Quiz.prototype.advance = function (qid) {
    var self = this, at = this.qs.indexOf(Q(this.config, qid));
    this.qs.forEach(function (q) { if (!visible(self.model, self.state, q.id)) delete self.state[q.id]; });
    this.go(this.nextVisible(at));
  };
  Quiz.prototype.toggle = function (btn) {
    var qid = btn.getAttribute('data-q'), q = Q(this.config, qid), id = btn.getAttribute('data-a');
    var cur = (this.state[qid] || []).slice(), at = cur.indexOf(id), a = findAnswer(q, id);
    var elsewhere = function (x) { var y = findAnswer(q, x); return !!(y && y.screen); };
    if (a && a.exclusive) cur = (at >= 0 ? [] : [id]).concat(cur.filter(elsewhere));
    else {
      cur = cur.filter(function (x) { var y = findAnswer(q, x); return !(y && y.exclusive && !a.screen); });
      if (at >= 0) cur.splice(cur.indexOf(id), 1);
      else if (cur.length < (q.max || 99)) cur.push(id);
    }
    this.state[qid] = cur;
    this.app.querySelectorAll('[data-act=toggle][data-q="' + qid + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(cur.indexOf(b.getAttribute('data-a')) >= 0)); });
    var next = this.app.querySelector('[data-act=next]');
    if (next) next.disabled = cur.length < (q.min || 0);
    var hint = this.app.querySelector('[data-sq-count]');
    if (hint && q.max < 99) hint.textContent = fill(this.copy.multi_count, { n: cur.length, max: q.max });
  };
  Quiz.prototype.level = function (btn) {
    var qid = btn.getAttribute('data-q'), row = +btn.getAttribute('data-row'), lv = +btn.getAttribute('data-lv');
    var q = Q(this.config, qid), cur = (this.state[qid] || q.rows.map(function () { return 0; })).slice();
    cur[row] = lv;
    this.state[qid] = cur;
    this.app.querySelectorAll('[data-act=level][data-row="' + row + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-lv') === lv)); });
  };

  // ---------------------------------------------------------------- perfume picker
  Quiz.prototype.refImg = function (id) { return this.assetBase + 'sq-ref-' + id + '.webp'; };
  Quiz.prototype.index = function () { return this._index || (this._index = buildIndex(this.model)); };
  Quiz.prototype.addPerfume = function (qid, kind, id) {
    var q = Q(this.config, qid), cur = Array.isArray(this.state[qid]) ? this.state[qid].slice() : [];
    var key = kind + '~' + id;
    // a second tap on a chosen tile takes it back out
    if (cur.some(function (x) { return x.k + '~' + x.id === key; })) { this.removePerfume(qid, key); return; }
    if (cur.length >= (q.max || 2)) cur.shift();
    cur.push({ k: kind, id: id });
    this.state[qid] = cur;
    this.showInPlace();
    // the chip under the box gets focus for screen readers; no scrolling, no focus on the search box (no phone keyboard)
    var card = this.app.querySelector('[data-sq-picked="' + key.replace(/"/g, '\\"') + '"]');
    if (card) card.focus({ preventScroll: true });
  };
  Quiz.prototype.removePerfume = function (qid, key) {
    var cur = (Array.isArray(this.state[qid]) ? this.state[qid] : []).filter(function (x) { return x.k + '~' + x.id !== key; });
    this.state[qid] = cur.length ? cur : null;
    this.showInPlace();
  };
  // re-draw the current screen without jumping to its top
  Quiz.prototype.showInPlace = function () {
    var y = global.scrollY;
    this.keepScroll = true;
    this.show(this.step);
    this.keepScroll = false;
    global.scrollTo(0, y);
  };
  Quiz.prototype.search = function (input) {
    var qid = input.getAttribute('data-q'), box = this.app.querySelector('[data-sq-results]'), c = this.copy, self = this;
    var hits = input.value.trim() ? search(this.index(), input.value, 8, this.state['for']) : [];
    box.innerHTML = hits.map(function (x) {
      var r = x.kind === 'r' ? self.model.refById[x.id] : null;
      return '<li><button type="button" class="sq-result-item" data-act="perfume" data-q="' + qid + '" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '">' +
        (r && r.img ? '<img class="sq-result-item__img" src="' + esc(self.refImg(r.id)) + '" alt="" width="40" height="40" loading="lazy">' : '<span class="sq-result-item__img" aria-hidden="true"></span>') +
        '<span class="sq-result-item__text"><span class="sq-result-item__name">' + esc(x.name) + '</span>' +
        '<span class="sq-result-item__house">' + esc(x.house) + (x.own ? ' · ' + esc(c.on_our_shelf) : '') + '</span></span></button></li>';
    }).join('') + (input.value.trim() && !hits.length ? '<li class="sq-noresult">' + esc(c.search_none) + '</li>' : '');
  };

  // ---------------------------------------------------------------- screens
  Quiz.prototype.render = function (html, focusSel) {
    this.app.innerHTML = html;
    // while a question is on screen the persona list below waits (it stays in the page for search engines)
    document.documentElement.classList.toggle('sq-asking', !!this.app.querySelector('.sq-q'));
    this.floatNext();
    if (this.keepScroll) return;
    if (this.root.getBoundingClientRect().top < 0) this.root.scrollIntoView({ block: 'start' });
    var f = this.app.querySelector(focusSel || '[data-sq-focus]');
    if (f && this.started) f.focus({ preventScroll: true });
    this.started = true;
  };
  Quiz.prototype.img = function (a, eager) {
    if (a.icon_file) return '<img class="sq-icon" src="' + esc(this.assetBase + a.icon_file) + '" alt="" width="600" height="600" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async">';
    if (a.icon && ICONS[a.icon]) return '<svg class="sq-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + ICONS[a.icon] + '</svg>';
    if (a.dots) return '<span class="sq-dots" aria-hidden="true">' + [1, 2, 3].map(function (k) { return '<i class="sq-dot' + (k <= a.dots ? ' is-on' : '') + '" style="--d:' + (6 + k * 7) + 'px"></i>'; }).join('') + '</span>';
    var alt = esc(a.img && a.img.alt ? a.img.alt : ''), s600, s900;
    if (a.img) { s600 = a.img.s; s900 = a.img.l || a.img.s; } else { s600 = cdnSized(a.image, 600); s900 = cdnSized(a.image, 900); }
    if (!s600) return '<span class="sq-tile__ph" aria-hidden="true"></span>';
    return '<img src="' + esc(s600) + '" srcset="' + esc(s600) + ' 600w, ' + esc(s900) + ' 900w" sizes="(min-width: 750px) 25vw, 50vw" alt="' + alt + '" width="600" height="600" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async">';
  };
  // Continue on a long step: while the question is on screen but its Continue is still below, Continue rides at
  // the bottom of the screen (fixed: the theme's #root clips, so sticky does not work there)
  Quiz.prototype.floatNext = function () {
    if (this.io) { this.io.disconnect(); this.io = null; }
    var n = this.app.querySelector('.sq-q .sq-next'), scr = this.app.querySelector('.sq-q');
    if (!n || !global.IntersectionObserver) return;
    var slot = document.createElement('div'), seen = {};
    slot.className = 'sq-next-slot';
    n.parentNode.insertBefore(slot, n);
    slot.appendChild(n);
    var update = function () {
      var below = slot.getBoundingClientRect().bottom > global.innerHeight;
      var on = !!(seen.scr && !seen.slot && below);
      if (on === n.classList.contains('is-floating')) return;
      slot.style.minHeight = on ? n.offsetHeight + 'px' : '';
      n.classList.toggle('is-floating', on);
    };
    this.io = new global.IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.target === slot) seen.slot = e.intersectionRatio > 0.98; else seen.scr = e.isIntersecting; });
      update();
    }, { threshold: [0, 0.99, 1] });
    this.io.observe(slot);
    this.io.observe(scr);
  };
  // the owner's icon next to a chip or week-row label (assets/sq-icon-avoid-<id>.svg, sq-icon-week-<id>.svg)
  Quiz.prototype.smallIcon = function (a) {
    return '<img class="sq-icon-sm" src="' + esc(this.assetBase + a.icon_file) + '" alt="" width="28" height="28" loading="lazy" decoding="async">';
  };
  Quiz.prototype.progress = function (i) {
    var n = 0, at = 0, self = this;
    this.qs.forEach(function (q, k) { if (q.sub) return; if (k === i || visible(self.model, self.state, q.id)) { n++; if (k <= i) at = n; } });
    if (this.qs[i].sub) at = Math.max(at, 1);
    return '<div class="sq-top"><button type="button" class="sq-back" data-act="back"><span aria-hidden="true">&larr;</span> ' + esc(this.copy.back) + '</button>' +
      '<p class="sq-step">' + esc(fill(this.copy.step, { n: at, total: n })) + '</p></div>' +
      '<div class="sq-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + at + '"><span style="width:' + (at / n * 100) + '%"></span></div>';
  };
  Quiz.prototype.dnaHtml = function (vec, canon) {
    var t = this.model.taste, labels = this.copy.families || {};
    var fams = t.families.map(function (f, i) { return { f: f, v: vec[i] || 0 }; }).filter(function (x) { return x.v > 0.04; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
    var notes = (canon || []).slice(0, 6).map(function (k) { return noteLabel({ taste: t }, k); }).filter(Boolean);
    return '<div class="sq-dna">' + (notes.length ? '<p class="sq-dna__notes">' + notes.map(esc).join(' · ') + '</p>' : '') +
      '<ul class="sq-dna__bars">' + fams.map(function (f) {
        var pct = Math.round(f.v * 100);
        return '<li><span class="sq-dna__label">' + esc(labels[f.f] || f.f) + '</span><span class="sq-dna__track"><span style="width:' + pct + '%"></span></span><span class="sq-dna__pct">' + pct + '%</span></li>';
      }).join('') + '</ul></div>';
  };

  Quiz.prototype.show = function (i, focusSel) {
    this.step = i;
    var c = this.copy, self = this;
    if (i < 0) {
      this.render('<div class="sq-screen sq-intro">' + (c.intro_kicker ? '<p class="sq-kicker">' + esc(c.intro_kicker) + '</p>' : '') +
        '<h2 class="sq-title" tabindex="-1" data-sq-focus>' + esc(c.intro_title) + '</h2><p class="sq-lead">' + esc(c.intro_text) + '</p>' +
        '<button type="button" class="sq-btn" data-act="start">' + esc(c.start) + '</button></div>');
      return;
    }
    var q = this.qs[i], v = this.state[q.id];
    var head = '<div class="sq-screen sq-q" data-q="' + esc(q.id) + '">' + this.progress(i) +
      '<h2 class="sq-title" tabindex="-1" data-sq-focus>' + esc(q.title) + '</h2>' + (q.subtitle ? '<p class="sq-lead sq-sub">' + esc(q.subtitle) + '</p>' : '');
    var body;
    if (q.type === 'perfume') body = this.perfumeScreen(q);
    else if (q.type === 'week') body = this.weekScreen(q);
    else if (q.type === 'taboo') body = this.tabooScreen(q);
    else {
      var multi = q.type === 'multi' || q.type === 'families';
      var chosen = multi ? (v || []) : (v ? [v] : []);
      body = '<ul class="sq-tiles" data-count="' + q.answers.length + '"' + (multi ? ' data-multi' : '') + '>' + q.answers.map(function (a) {
        return '<li><button type="button" class="sq-tile" data-act="' + (multi ? 'toggle' : 'answer') + '" data-q="' + esc(q.id) + '" data-a="' + esc(a.id) + '" aria-pressed="' + (chosen.indexOf(a.id) >= 0) + '">' +
          '<span class="sq-tile__img">' + self.img(a, i < 2) + '</span><span class="sq-tile__label">' + esc(a.label) + '</span>' +
          (a.hint ? '<span class="sq-tile__hint">' + esc(a.hint) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' + (multi ? this.nextBtn(q, chosen.length, true) : '');
      var sw = this.borrowed(q.id, null);
      if (sw) { if (!this.state.taboos) this.state.taboos = []; body = '<div class="sq-switches">' + sw + '</div>' + body; }
    }
    this.render(head + body + '</div>', focusSel);
  };
  Quiz.prototype.nextBtn = function (q, n, counter) {
    return '<div class="sq-next">' + (counter && q.max && q.max < (q.answers || []).length ? '<p class="sq-step" data-sq-count>' + esc(fill(this.copy.multi_count, { n: n, max: q.max })) + '</p>' : '') +
      '<button type="button" class="sq-btn" data-act="next" data-q="' + esc(q.id) + '"' + (n < (q.min || 0) ? ' disabled' : '') + '>' + esc(this.copy.next) + '</button></div>';
  };
  Quiz.prototype.perfumeScreen = function (q) {
    var c = this.copy, self = this, cur = Array.isArray(this.state[q.id]) ? this.state[q.id] : [];
    var keys = cur.map(function (x) { return x.k + '~' + x.id; });
    // the 12 tiles follow screen 1: her -> feminine, him -> masculine, both -> unisex
    var P = this.model.taste.popular || [];
    var popIds = Array.isArray(P) ? P : (P[this.state['for']] || P.both || []);
    var pop = popIds.map(function (id) { return self.model.refById[id]; }).filter(Boolean);
    // 1) type the name (chosen perfumes show right under the box)  2) or tap a bottle  3) Continue
    var chips = cur.map(function (v) {
      var pf = perfumeOf(self.model, v);
      var notes = pf.vec ? (pf.canon || []).slice(0, 4).map(function (k) { return noteLabel(self.model, k); }).filter(Boolean).join(' · ') : fill(c.no_notes_short, { name: pf.name });
      return '<li class="sq-picked" tabindex="-1" data-sq-picked="' + esc(pf.key) + '"><span class="sq-picked__text">' +
        '<span class="sq-picked__name">' + esc(pf.name) + '</span><span class="sq-picked__house">' + esc(pf.house) + '</span>' +
        '<span class="sq-picked__notes">' + esc(notes) + '</span></span>' +
        '<button type="button" class="sq-picked__x" data-act="unpick" data-q="' + esc(q.id) + '" data-key="' + esc(pf.key) + '" aria-label="' + esc(fill(c.remove_named, { name: pf.name })) + '">&times;</button></li>';
    }).join('');
    var html = '<div class="sq-pick"><label class="sq-search"><span class="sq-search__label sq-visually-hidden">' + esc(c.search_label) + '</span>' +
      '<input type="search" data-sq-search data-q="' + esc(q.id) + '" placeholder="' + esc(c.search_placeholder) + '" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="sq-results"></label>' +
      '<ul class="sq-results" id="sq-results" data-sq-results></ul>' +
      (chips ? '<ul class="sq-picked-list" aria-label="' + esc(fill(c.picked_count, { n: cur.length, max: q.max || 2 })) + '">' + chips + '</ul>' : '') +
      '<button type="button" class="sq-none" data-act="no-ref" data-q="' + esc(q.id) + '">' + esc(q.none_label) + '</button></div>' +
      '<p class="sq-pop-title sq-pop-title--tiles">' + esc(c.popular_title) + '</p>' +
      '<ul class="sq-pop" aria-label="' + esc(c.popular_title) + '">' + pop.map(function (r) {
      return '<li><button type="button" class="sq-pop__tile" data-act="perfume" data-q="' + esc(q.id) + '" data-kind="r" data-id="' + esc(r.id) + '" aria-pressed="' + (keys.indexOf('r~' + r.id) >= 0) + '">' +
        (r.img ? '<img src="' + esc(self.refImg(r.id)) + '" alt="" width="600" height="600" loading="eager" decoding="async">' : '<span class="sq-pop__ph" aria-hidden="true">' + esc(r.name.charAt(0)) + '</span>') +
        // a line may break after "&" (Dolce&<wbr>Gabbana), never inside a word
        '<span class="sq-pop__name">' + esc(r.name) + '</span><span class="sq-pop__house">' + esc(r.house).replace(/&amp;/g, '&amp;<wbr>') + '</span></button></li>';
    }).join('') + '</ul>' +
      '<div class="sq-next"><button type="button" class="sq-btn" data-act="next" data-q="' + esc(q.id) + '"' + (cur.length ? '' : ' disabled') + '>' + esc(c.next) + '</button></div>';
    return html;
  };
  Quiz.prototype.tabooScreen = function (q) {
    var cur = this.state[q.id] || [], self = this;
    this.state[q.id] = cur; // Continue with nothing ticked = nothing tabooed
    var chip = function (a) {
      return '<li><button type="button" class="sq-chip' + (a.toggle ? ' sq-chip--toggle' : '') + '" data-act="toggle" data-q="' + esc(q.id) + '" data-a="' + esc(a.id) + '" aria-pressed="' + (cur.indexOf(a.id) >= 0) + '">' +
        (a.icon_file ? self.smallIcon(a) : '') + '<span>' + esc(a.label) + '</span>' + (a.hint ? '<small>' + esc(a.hint) + '</small>' : '') + '</button></li>';
    };
    return '<ul class="sq-chips sq-chips--taboo">' + q.answers.filter(function (a) { return !a.screen; }).map(chip).join('') + '</ul>' + this.nextBtn(q, cur.length, false);
  };
  // switches stored with another question (q.answers[].screen = this question's id), drawn on this screen
  Quiz.prototype.borrowed = function (screenId, rowId) {
    var self = this, out = '';
    this.qs.forEach(function (oq) {
      (oq.answers || []).forEach(function (a) {
        if (a.screen !== screenId || (a.row || null) !== (rowId || null)) return;
        var on = (self.state[oq.id] || []).indexOf(a.id) >= 0;
        out += '<button type="button" class="sq-switch" data-act="toggle" data-q="' + esc(oq.id) + '" data-a="' + esc(a.id) + '" aria-pressed="' + on + '">' +
          '<span class="sq-switch__box" aria-hidden="true"></span><span>' + esc(a.label) + '</span></button>';
      });
    });
    return out;
  };
  Quiz.prototype.weekScreen = function (q) {
    var cur = this.state[q.id] || q.rows.map(function () { return 0; }), self = this;
    this.state[q.id] = cur;
    if (!this.state.taboos) this.state.taboos = [];
    return '<ul class="sq-week">' + q.rows.map(function (r, i) {
      var sw = self.borrowed(q.id, r.id);
      return '<li class="sq-week__row"><span class="sq-week__label" id="sq-week-' + i + '">' + (r.icon_file ? self.smallIcon(r) : '') + esc(r.label) + '</span><span class="sq-week__levels" role="group" aria-labelledby="sq-week-' + i + '">' +
        q.levels.map(function (lv, k) {
          return '<button type="button" class="sq-level" data-act="level" data-q="' + esc(q.id) + '" data-row="' + i + '" data-lv="' + k + '" aria-pressed="' + (cur[i] === k) + '">' + esc(lv) + '</button>';
        }).join('') + '</span>' + (sw ? '<span class="sq-week__switch">' + sw + '</span>' : '') + '</li>';
    }).join('') + '</ul>' + this.nextBtn(q, 1, false);
  };

  // ---------------------------------------------------------------- live inventory
  Quiz.prototype.refreshLive = function (products) {
    var self = this, queue = products.filter(function (p) { return !self.live[p.handle]; }), running = [];
    function one(p) {
      return fetch(self.cartRoot + 'products/' + encodeURIComponent(p.handle) + '.js', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.variants) return;
          var av = d.variants.filter(function (v) { return v.available; });
          p.available = av.length > 0;
          var cheapest = (av.length ? av : d.variants).slice().sort(function (a, b) { return a.price - b.price; })[0];
          p.variant = cheapest.id;
          p.price = cheapest.price / 100;
          self.live[p.handle] = true;
        }).catch(function () { /* keep catalog values */ });
    }
    function next() { var p = queue.shift(); return p ? one(p).then(next) : null; }
    for (var k = 0; k < 4; k++) running.push(next());
    return Promise.race([Promise.all(running), new Promise(function (res) { setTimeout(res, 4000); })]);
  };

  Quiz.prototype.finish = function (fresh) {
    var self = this, c = this.copy, S = this.config.scoring;
    this.step = this.qs.length;
    this.render('<div class="sq-screen sq-loading"><p class="sq-lead" tabindex="-1" data-sq-focus>' + esc(c.loading) + '</p><span class="sq-spinner" aria-hidden="true"></span></div>');
    var first = wardrobe(this.model, this.state, { candidates: S.live_check });
    this.refreshLive(first.candidates.concat(this.model.sets)).then(function () {
      var res = wardrobe(self.model, self.state);
      self.result = res;
      self.why = whyLines(self.model, res, c);
      self.setUrl(encodeCode(self.model, self.state));
      if (fresh) {
        publish(self.root, 'quiz_completed', { quiz: self.config.id, answers: encodeCode(self.model, self.state), persona: res.persona && res.persona.key,
          slots: res.rows.map(function (r) { return r.slot.id; }), products: res.rows.filter(function (r) { return r.pick; }).map(function (r) { return r.pick.p.handle; }) });
      }
      self.showResult();
    });
  };

  Quiz.prototype.setUrl = function (code) {
    try {
      var u = new URL(global.location.href);
      if (code) u.searchParams.set(PARAM, code); else u.searchParams.delete(PARAM);
      global.history.replaceState(global.history.state, '', u.toString());
    } catch (e) { /* ignore */ }
  };
  // the shared link reopens the same result; a theme preview id stays so the link works inside the preview
  Quiz.prototype.shareUrl = function () {
    var u = new URL(global.location.href), keep = {};
    KEEP_PARAMS.forEach(function (k) { if (u.searchParams.get(k)) keep[k] = u.searchParams.get(k); });
    u.hash = '';
    u.search = '';
    Object.keys(keep).forEach(function (k) { u.searchParams.set(k, keep[k]); });
    u.searchParams.set(PARAM, encodeCode(this.model, this.state));
    return u.toString();
  };

  Quiz.prototype.productLink = function (p) { return this.cartRoot + 'products/' + p.handle; };
  Quiz.prototype.card = function (row, i) {
    var r = row.pick, p = r.p, c = this.copy, why = this.why[i], shares = sharesLine(this.model, r, c);
    var alt = row.alt ? row.alt.p : null;
    return '<li class="sq-card sq-card--slot"><div class="sq-shelf__head"><p class="sq-shelf__name">' + esc(row.slot.label) + '</p>' +
      (row.slot.text ? '<p class="sq-shelf__text">' + esc(row.slot.text) + '</p>' : '') + '</div>' +
      '<a class="sq-card__img" href="' + esc(this.productLink(p)) + '" tabindex="-1" aria-hidden="true">' +
      (p.image ? '<img src="' + esc(cdnSized(p.image, 600)) + '" srcset="' + esc(cdnSized(p.image, 600)) + ' 600w, ' + esc(cdnSized(p.image, 900)) + ' 900w" sizes="(min-width: 750px) 20vw, 40vw" alt="" width="600" height="600" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async">' : '') + '</a>' +
      '<div class="sq-card__body"><h3 class="sq-card__name"><a href="' + esc(this.productLink(p)) + '">' + esc(p.title) + '</a></h3>' +
      '<p class="sq-card__house">' + esc(p.house) + '</p>' +
      (shares ? '<p class="sq-card__why sq-card__why--taste" data-sq-shares>' + esc(shares) + '</p>' : '') +
      (why ? '<p class="sq-card__why" data-sq-why>' + esc(why) + '</p>' : '') +
      '<p class="sq-card__wear">' + esc(howToWear(this.model, row, c)) + '</p>' +
      '<button type="button" class="sq-btn sq-btn--line" data-act="add" data-variant="' + esc(p.variant) + '" data-handle="' + esc(p.handle) + '">' + esc(c.add_sample) + ' · ' + esc(this.fmt.format(p.price)) + '</button>' +
      (alt ? '<details class="sq-alt"><summary>' + esc(c.also_fits) + '</summary><p><a href="' + esc(this.productLink(alt)) + '">' + esc(alt.title) + ' · ' + esc(alt.house) + '</a></p>' +
        '<button type="button" class="sq-btn sq-btn--line" data-act="add" data-variant="' + esc(alt.variant) + '" data-handle="' + esc(alt.handle) + '">' + esc(c.add_sample) + ' · ' + esc(this.fmt.format(alt.price)) + '</button></details>' : '') +
      '</div></li>';
  };
  Quiz.prototype.showResult = function () {
    var self = this, c = this.copy, res = this.result, per = res.persona || { name: '', line: '' };
    var rows = res.rows.filter(function (r) { return r.pick; });
    var html = '<div class="sq-screen sq-result">';
    if (this.shared) html += '<div class="sq-shared"><p>' + esc(c.shared_note) + '</p><button type="button" class="sq-btn sq-btn--line" data-act="restart">' + esc(c.shared_cta) + '</button></div>';
    html += '<p class="sq-kicker">' + esc(c.result_kicker) + '</p><h2 class="sq-title sq-persona" tabindex="-1" data-sq-focus>' + esc(per.name) + '</h2><p class="sq-lead">' + esc(per.line) + '</p>';
    if (res.profile.length) {
      html += '<div class="sq-ref sq-ref--result"><p class="sq-kicker">' + esc(c.profile_title) + '</p><ul class="sq-dna__bars">' + res.profile.map(function (f) {
        return '<li><span class="sq-dna__label">' + esc((c.families || {})[f.family] || f.family) + '</span><span class="sq-dna__track"><span style="width:' + f.pct + '%"></span></span><span class="sq-dna__pct">' + f.pct + '%</span></li>';
      }).join('') + '</ul></div>';
    }
    html += '<h3 class="sq-subtitle">' + esc(c.result_list_title) + '</h3><ol class="sq-cards sq-shelves">' +
      res.rows.map(function (r, i) { return r.pick ? self.card(r, i) : ''; }).join('') + '</ol>';
    var total = rows.reduce(function (s, r) { return s + r.pick.p.price; }, 0);
    if (rows.length > 1) html += '<div class="sq-actions"><button type="button" class="sq-btn" data-act="add-all">' + esc(fill(c.add_all, { n: rows.length })) + ' · ' + esc(this.fmt.format(total)) + '</button></div>';
    html += '<p class="sq-msg" role="status" data-sq-msg></p>';
    if (res.set) {
      var s = res.set.p;
      html += '<aside class="sq-set"><a class="sq-set__img" href="' + esc(this.productLink(s)) + '" tabindex="-1" aria-hidden="true">' +
        (s.image ? '<img src="' + esc(cdnSized(s.image, 600)) + '" alt="" width="600" height="600" loading="lazy" decoding="async">' : '') + '</a>' +
        '<div><p class="sq-kicker">' + esc(c.set_kicker) + '</p><h3 class="sq-card__name"><a href="' + esc(this.productLink(s)) + '">' + esc(s.title) + '</a></h3>' +
        '<p class="sq-card__why">' + esc(c.set_text) + '</p><button type="button" class="sq-btn sq-btn--line" data-act="add-set" data-variant="' + esc(s.variant) + '" data-handle="' + esc(s.handle) + '">' + esc(c.set_cta) + ' · ' + esc(this.fmt.format(s.price)) + '</button></div></aside>';
    }
    html += '<div class="sq-share"><button type="button" class="sq-btn sq-btn--line" data-act="share-open" aria-expanded="false">' + esc(c.share_title) + '</button>' +
      '<div class="sq-share__panel" hidden data-sq-share><img class="sq-share__preview" alt="" data-sq-preview>' +
      '<div class="sq-share__btns"><button type="button" class="sq-btn" data-act="download">' + esc(c.share_download) + '</button>' +
      (navigator.share ? '<button type="button" class="sq-btn sq-btn--line" data-act="native">' + esc(c.share_native) + '</button>' : '') +
      '<button type="button" class="sq-btn sq-btn--line" data-act="copy">' + esc(c.share_copy) + '</button></div></div></div>' +
      '<button type="button" class="sq-restart" data-act="restart">' + esc(c.start_over) + '</button></div>';
    this.render(html);
  };

  // ---------------------------------------------------------------- cart
  Quiz.prototype.post = function (items) {
    return fetch(this.cartRoot + 'cart/add.js', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: items })
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
    var cc = this.config.cart || {}, opener = cc.mode === 'drawer' && cc.open_selector && document.querySelector(cc.open_selector);
    if (opener) { this.updateCounters(); opener.click(); } else global.location.href = this.cartRoot + 'cart';
  };
  Quiz.prototype.busy = function (btn, on) {
    if (on) { btn.setAttribute('data-label', btn.innerHTML); btn.textContent = this.copy.adding; btn.disabled = true; }
    else { btn.innerHTML = btn.getAttribute('data-label'); btn.disabled = false; }
  };
  Quiz.prototype.msg = function (text) { var m = this.app.querySelector('[data-sq-msg]'); if (m) m.textContent = text || ''; };
  Quiz.prototype.addOne = function (btn, mode) {
    var self = this, id = +btn.getAttribute('data-variant'), handle = btn.getAttribute('data-handle');
    this.busy(btn, true);
    this.post([{ id: id, quantity: 1 }]).then(function () {
      btn.outerHTML = '<a class="sq-btn sq-btn--done" href="' + esc(self.cartRoot + 'cart') + '"><span aria-hidden="true">&#10003;</span> ' + esc(self.copy.added) + ' · ' + esc(self.copy.view_cart) + '</a>';
      self.updateCounters();
      publish(self.root, 'quiz_add_to_cart', { quiz: self.config.id, mode: mode || 'single', items: [{ variant_id: id, handle: handle }] });
    }).catch(function () { self.busy(btn, false); self.msg(self.copy.add_error); });
  };
  Quiz.prototype.addAll = function (btn) {
    var self = this, rows = this.result.rows.filter(function (r) { return r.pick; });
    this.busy(btn, true);
    this.msg('');
    this.post(rows.map(function (r) { return { id: r.pick.p.variant, quantity: 1 }; })).then(function () {
      publish(self.root, 'quiz_add_to_cart', { quiz: self.config.id, mode: 'all', items: rows.map(function (r) { return { variant_id: r.pick.p.variant, handle: r.pick.p.handle }; }) });
      self.busy(btn, false);
      self.openCart();
    }).catch(function () { self.busy(btn, false); self.msg(self.copy.add_error); });
  };

  Quiz.prototype.restart = function () {
    this.state = {};
    this.shared = false;
    this.result = null;
    this.blob = null;
    this.setUrl(null);
    this.go(0);
    publish(this.root, 'quiz_started', { quiz: this.config.id, restart: true });
  };

  // ---------------------------------------------------------------- share
  Quiz.prototype.openShare = function (btn) {
    var panel = this.app.querySelector('[data-sq-share]'), self = this, open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && !this.blob) this.story().then(function (blob) {
      self.blob = blob;
      var img = self.app.querySelector('[data-sq-preview]');
      if (img && blob) img.src = URL.createObjectURL(blob);
    });
  };
  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }
  // 1080x1920 story: persona, every slot with its perfume, the quiz address
  Quiz.prototype.story = function () {
    var self = this, c = this.copy, res = this.result, rows = res.rows.filter(function (r) { return r.pick; });
    var head = this.app.querySelector('.sq-persona') || this.app;
    var cs = getComputedStyle(this.root), hs = getComputedStyle(head);
    var bodyFont = cs.fontFamily, headFont = hs.fontFamily;
    var bg = getComputedStyle(this.root.closest('.sq-section') || this.root).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
    var fg = cs.color, accent = hs.color;
    var loads = document.fonts ? Promise.all([document.fonts.load('400 120px ' + headFont), document.fonts.load('400 34px ' + bodyFont), document.fonts.load('600 34px ' + bodyFont)]).catch(function () {}) : Promise.resolve();
    return loads.then(function () {
      var W = 1080, H = 1920, M = 110, LIMIT = H - 230;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var x = cv.getContext('2d');
      var spaced = function (on) { if ('letterSpacing' in x) x.letterSpacing = on ? '6px' : '0px'; };
      function paint(k, draw) {
        var put = function (t, y) { if (draw) x.fillText(t, W / 2, y); };
        var y = 300 * k;
        spaced(true); x.fillStyle = accent; x.font = '600 34px ' + bodyFont;
        put(String(c.share_story_kicker || '').toUpperCase(), y);
        spaced(false); x.fillStyle = fg; x.font = '400 ' + Math.round(110 * k) + 'px ' + headFont;
        y += 160 * k;
        wrap(x, res.persona ? res.persona.name : '', W - 2 * M).forEach(function (l) { put(l, y); y += 124 * k; });
        x.font = '400 ' + Math.round(38 * k) + 'px ' + bodyFont; y += 10 * k;
        wrap(x, res.persona ? res.persona.line : '', W - 2 * M - 40).forEach(function (l) { put(l, y); y += 56 * k; });
        y += 50 * k;
        if (draw) { x.fillStyle = accent; x.fillRect(W / 2 - 60, y, 120, 3); }
        y += 100 * k;
        spaced(true); x.fillStyle = accent; x.font = '600 32px ' + bodyFont;
        put(String(c.share_story_top || '').toUpperCase(), y);
        spaced(false);
        y += 90 * k;
        rows.forEach(function (r) {
          x.fillStyle = accent; x.font = '600 ' + Math.round(28 * k) + 'px ' + bodyFont;
          put(String(r.slot.label).toUpperCase(), y);
          x.fillStyle = fg; x.font = '400 ' + Math.round(54 * k) + 'px ' + headFont;
          var lines = wrap(x, r.pick.p.title, W - 2 * M).slice(0, 2);
          lines.forEach(function (l, i) { put(l, y + 66 * k + i * 60 * k); });
          y += 66 * k + (lines.length - 1) * 60 * k;
          x.font = '400 ' + Math.round(30 * k) + 'px ' + bodyFont;
          put(r.pick.p.house, y + 48 * k);
          y += 48 * k + 80 * k;
        });
        return y - 80 * k;
      }
      var k = 1;
      while (k > 0.5 && paint(k, false) > LIMIT) k -= 0.05;
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      x.strokeStyle = accent; x.lineWidth = 2; x.strokeRect(56, 56, W - 112, H - 112);
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      paint(k, true);
      x.fillStyle = fg; x.font = '400 36px ' + bodyFont;
      x.fillText((self.config.share && self.config.share.url_text) || global.location.host, W / 2, H - 150);
      return new Promise(function (done) { cv.toBlob(function (b) { done(b); }, 'image/png'); });
    });
  };
  Quiz.prototype.withBlob = function () {
    var self = this;
    return this.blob ? Promise.resolve(this.blob) : this.story().then(function (b) { self.blob = b; return b; });
  };
  Quiz.prototype.sharedEvent = function (method) { publish(this.root, 'quiz_shared', { quiz: this.config.id, method: method, persona: this.result.persona && this.result.persona.key }); };
  Quiz.prototype.shareDownload = function () {
    var self = this;
    this.withBlob().then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (self.config.share && self.config.share.file_name) || 'scent-wardrobe.png';
      document.body.appendChild(a); a.click(); a.remove();
      self.sharedEvent('download');
    });
  };
  Quiz.prototype.shareNative = function () {
    var self = this, url = this.shareUrl(), sh = this.config.share || {}, text = this.result.persona ? this.result.persona.name : '';
    this.withBlob().then(function (b) {
      var file = new File([b], sh.file_name || 'scent-wardrobe.png', { type: 'image/png' });
      var data = navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: sh.title, text: text + ' ' + url } : { title: sh.title, text: text, url: url };
      return navigator.share(data).then(function () { self.sharedEvent('native'); });
    }).catch(function () { /* cancelled */ });
  };
  Quiz.prototype.shareCopy = function (btn) {
    var self = this, url = this.shareUrl();
    var done = function () { btn.textContent = self.copy.share_copied; self.sharedEvent('copy'); };
    function fallback() {
      var t = document.createElement('textarea');
      t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      t.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
  };

  // ---------------------------------------------------------------- boot
  function boot(scope) {
    (scope || document).querySelectorAll('[data-scent-quiz]').forEach(function (root) {
      if (root.__sq) return;
      root.__sq = new Quiz(root);
      root.__sq.load();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); }); else boot();
  document.addEventListener('shopify:section:load', function (e) { boot(e.target); });
  document.addEventListener('shopify:block:select', function (e) {
    var root = e.target.closest ? e.target.closest('.sq-section') : null;
    var el = root && root.querySelector('[data-scent-quiz]'), quiz = el && el.__sq;
    if (!quiz || !quiz.config || !quiz.blocks) return;
    var b = quiz.blocks.filter(function (x) { return x.id === e.detail.blockId; })[0];
    var qi = b ? quiz.qs.indexOf(Q(quiz.config, b.q)) : -1;
    if (qi >= 0) quiz.show(qi);
  });
})(typeof window !== 'undefined' ? window : globalThis);
