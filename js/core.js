/* Core: data lookups, storage, scoring, fixed test sets and performance analysis. */
(function () {
  'use strict';

  var DATA = window.AAI_DATA;
  var QUESTIONS = {};
  DATA.questions.forEach(function (q) { QUESTIONS[q.id] = q; });
  var CHAPTERS = {};
  DATA.chapters.forEach(function (c) { CHAPTERS[c.id] = c; });
  var TOPICS = {};
  (DATA.topics || []).forEach(function (t) { TOPICS[t.id] = t; });

  var KEYS = {
    attempts: 'aai.attempts.v1',
    current: 'aai.current.v1',
    settings: 'aai.settings.v1',
    bookmarks: 'aai.bookmarks.v1',
    infinity: 'aai.infinity.v1'
  };

  /* ---------- storage ---------- */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  function remove(key) { localStorage.removeItem(key); }

  function attempts() { return load(KEYS.attempts, []); }
  function saveAttempts(list) { save(KEYS.attempts, list.slice(-200)); }
  function settings() {
    return Object.assign({ perQuestionMinutes: 1, negative: 0, shuffle: true }, load(KEYS.settings, {}));
  }
  function bookmarks() { return load(KEYS.bookmarks, {}); }
  function toggleBookmark(qid) {
    var b = bookmarks();
    if (b[qid]) delete b[qid]; else b[qid] = true;
    save(KEYS.bookmarks, b);
    return !!b[qid];
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }
  function shuffled(list, rng) {
    var rand = rng || Math.random;
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function chapterName(id) { return CHAPTERS[id].title.replace(/^\d+\.\s*/, ''); }

  /* ---------- scoring ---------- */
  function qStatus(attempt, qid) {
    var a = attempt.answers[qid];
    if (a === undefined || a === null) return 'skipped';
    return a === QUESTIONS[qid].correct ? 'correct' : 'wrong';
  }
  function scoreOf(attempt) {
    var neg = attempt.config.negative || 0;
    var correct = 0, wrong = 0, skipped = 0;
    attempt.qids.forEach(function (qid) {
      var s = qStatus(attempt, qid);
      if (s === 'correct') correct++;
      else if (s === 'wrong') wrong++;
      else skipped++;
    });
    return {
      correct: correct, wrong: wrong, skipped: skipped,
      score: Math.round((correct - wrong * neg) * 100) / 100,
      max: attempt.qids.length
    };
  }
  function findAttempt(id) {
    return attempts().filter(function (a) { return a.id === id; })[0];
  }
  function latestStatuses() {
    var map = {};
    attempts().forEach(function (att) {
      att.qids.forEach(function (qid) { map[qid] = qStatus(att, qid); });
    });
    return map;
  }
  function mistakeIds() {
    var map = latestStatuses();
    return Object.keys(map).filter(function (qid) { return map[qid] !== 'correct' && QUESTIONS[qid]; });
  }

  /* ---------- fixed test sets ----------
     Every question appears exactly once across the six Full Mocks. The split is
     seeded, so Full Mock 3 is always the same set of questions. */
  var FULL_COUNT = 6;
  var _tests = null;
  function tests() {
    if (_tests) return _tests;
    var rng = mulberry32(20261008);
    var maths = shuffled(DATA.questions.filter(function (q) { return q.subject === 'Maths'; }).map(function (q) { return q.id; }), rng);
    var physics = shuffled(DATA.questions.filter(function (q) { return q.subject === 'Physics'; }).map(function (q) { return q.id; }), rng);
    function part(list, i) { return list.slice(Math.floor(i * list.length / FULL_COUNT), Math.floor((i + 1) * list.length / FULL_COUNT)); }
    var full = [];
    for (var i = 0; i < FULL_COUNT; i++) {
      var m = part(maths, i), p = part(physics, i);
      full.push({ key: 'full-mixed-' + (i + 1), kind: 'full', group: 'Mixed', title: 'Full Mock ' + (i + 1), qids: m.concat(p) });
    }
    for (var j = 0; j < FULL_COUNT; j++) {
      full.push({ key: 'full-maths-' + (j + 1), kind: 'full', group: 'Maths', title: 'Maths Test ' + (j + 1), qids: part(maths, j) });
    }
    for (var k = 0; k < FULL_COUNT; k++) {
      full.push({ key: 'full-physics-' + (k + 1), kind: 'full', group: 'Physics', title: 'Physics Test ' + (k + 1), qids: part(physics, k) });
    }
    var chapter = DATA.chapters.map(function (c) {
      return {
        key: 'chapter-' + c.id, kind: 'chapter', group: c.subject, title: chapterName(c.id), chapter: c.id,
        qids: DATA.questions.filter(function (q) { return q.chapter === c.id; }).map(function (q) { return q.id; })
      };
    });
    _tests = { full: full, chapter: chapter };
    return _tests;
  }

  function testRecord(key) {
    var list = attempts().filter(function (a) { return a.config.testKey === key; });
    if (!list.length) return null;
    var best = 0;
    list.forEach(function (a) { best = Math.max(best, a.result.max ? a.result.correct * 100 / a.result.max : 0); });
    var last = list[list.length - 1];
    return { count: list.length, best: Math.round(best), last: Math.round(last.result.max ? last.result.correct * 100 / last.result.max : 0), lastAt: last.submittedAt };
  }

  /* ---------- performance analysis ---------- */
  function computeStats() {
    var perQ = {};
    var trend = [];
    var totals = { attempts: 0, presented: 0, correct: 0, wrong: 0, skipped: 0, time: 0, timeN: 0 };
    attempts().forEach(function (a) {
      totals.attempts++;
      a.qids.forEach(function (qid) {
        if (!QUESTIONS[qid]) return;
        var st = qStatus(a, qid);
        var pq = perQ[qid] || (perQ[qid] = { seen: 0, c: 0, w: 0, s: 0, time: 0, timeN: 0, last: null });
        pq.seen++;
        if (st === 'correct') pq.c++; else if (st === 'wrong') pq.w++; else pq.s++;
        pq.last = st;
        var t = a.times && a.times[qid];
        if (t) { pq.time += t; pq.timeN++; totals.time += t; totals.timeN++; }
        totals.presented++;
        totals[st === 'correct' ? 'correct' : st === 'wrong' ? 'wrong' : 'skipped']++;
      });
      if (a.config.kind !== 'infinity' || a.qids.length >= 5) {
        trend.push({ at: a.submittedAt, pct: a.result.max ? a.result.correct * 100 / a.result.max : 0, title: a.title });
      }
    });

    var total = DATA.questions.length;
    var perCh = {};
    DATA.chapters.forEach(function (c) {
      perCh[c.id] = { id: c.id, subject: c.subject, total: c.count, weight: c.count / total, presented: 0, c: 0, w: 0, s: 0, time: 0, timeN: 0, seenQ: 0, mastered: 0, weakQ: [] };
    });
    DATA.questions.forEach(function (q) {
      var ch = perCh[q.chapter];
      var pq = perQ[q.id];
      if (!pq) return;
      ch.seenQ++;
      ch.presented += pq.seen; ch.c += pq.c; ch.w += pq.w; ch.s += pq.s;
      ch.time += pq.time; ch.timeN += pq.timeN;
      if (pq.last === 'correct') ch.mastered++; else ch.weakQ.push(q.id);
    });
    Object.keys(perCh).forEach(function (id) {
      var ch = perCh[id];
      ch.score = ch.presented ? ch.c / ch.presented : null;
      ch.avgTime = ch.timeN ? ch.time / ch.timeN : null;
      ch.coverage = ch.total ? ch.seenQ / ch.total : 0;
      // priority = how much the chapter matters x how badly it is going
      ch.priority = ch.score === null ? ch.weight * 0.5 : ch.weight * (1 - ch.score);
      ch.status = ch.score === null ? 'new' : ch.presented < 3 ? 'early' : ch.score < 0.5 ? 'weak' : ch.score < 0.75 ? 'improving' : 'strong';
    });
    return { perQ: perQ, perCh: perCh, trend: trend, totals: totals, unique: Object.keys(perQ).length, bank: total };
  }

  window.AAI = {
    DATA: DATA, QUESTIONS: QUESTIONS, CHAPTERS: CHAPTERS, TOPICS: TOPICS, KEYS: KEYS, LETTERS: ['A', 'B', 'C', 'D'],
    load: load, save: save, remove: remove,
    attempts: attempts, saveAttempts: saveAttempts, settings: settings,
    bookmarks: bookmarks, toggleBookmark: toggleBookmark,
    esc: esc, stripTags: stripTags, shuffled: shuffled, mulberry32: mulberry32,
    fmtTime: fmtTime, fmtDate: fmtDate, chapterName: chapterName,
    qStatus: qStatus, scoreOf: scoreOf, findAttempt: findAttempt,
    latestStatuses: latestStatuses, mistakeIds: mistakeIds,
    tests: tests, testRecord: testRecord, computeStats: computeStats
  };
})();
