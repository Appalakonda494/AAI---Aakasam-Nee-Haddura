/* AAI JE test app: views and events. Data, storage and analysis live in core.js. */
(function () {
  'use strict';

  var A = window.AAI;
  var QUESTIONS = A.QUESTIONS, CHAPTERS = A.CHAPTERS, TOPICS = A.TOPICS, DATA = A.DATA, LETTERS = A.LETTERS, KEYS = A.KEYS;
  var esc = A.esc, fmtTime = A.fmtTime, fmtDate = A.fmtDate, chapterName = A.chapterName;
  var qStatus = A.qStatus, attempts = A.attempts, settings = A.settings;

  var app = document.getElementById('app');
  var nav = document.getElementById('nav');
  var modalRoot = document.getElementById('modal-root');
  var topExtra = document.getElementById('topbar-extra');

  var timerHandle = null;
  var current = null;   // finite test in progress
  var inf = null;       // infinity session in progress
  var clock = { qid: null, start: 0 };
  var view = { screen: 'home', tab: 'full', i: 0, filter: 'all', shown: {} };

  /* ---------- telugu motivation ---------- */
  function resultMessage(a) {
    var r = a.result, p = r.max ? r.correct * 100 / r.max : 0;
    if (a.config.reattemptOf && r.correct > 0) return 'నిన్నటికంటే ఈరోజు బెటర్ – అదే అసలైన గెలుపు!';
    if (p >= 85) return 'గెలిచావురా… నా బంగారు కొండ! శభాష్, ఇలాగే కొనసాగించు.';
    if (p >= 65) return 'చాలా బాగుంది! ఇంకొంచెం కష్టపడితే టాప్ స్కోర్ నీదే.';
    if (p >= 40) return 'పర్లేదు, పట్టు వస్తోంది! తప్పులను సొల్యూషన్స్‌లో చూసి మళ్లీ రాయి.';
    return 'గెలవడం కానీ ఓడిపోవడం కానీ నీ చేతిలోనే ఉందిరా – సొల్యూషన్స్ చూసి మళ్లీ ప్రయత్నించు.';
  }

  /* ---------- film watermark ---------- */
  // film frames (sepia) for the faint background. 'script' is the handwriting texture for the empty state.
  var WM_WIN = ['arms', 'point', 'sky', 'couple'];      // triumphant / hopeful frames
  var WM_TRY = ['face', 'serious', 'warm', 'red'];      // resolve / keep-going frames
  var WM = WM_WIN.concat(WM_TRY, ['script']);
  var wmEl = document.getElementById('watermark');
  var wmOk = {};
  WM.forEach(function (k) { var i = new Image(); i.onload = function () { wmOk[k] = true; if (wmWanted) setWatermark(wmWanted); }; i.src = 'assets/wm-' + k + '.jpg'; });
  var wmWanted = null;
  function pickFrom(list, seed) {
    var ok = list.filter(function (k) { return wmOk[k]; });
    var pool = ok.length ? ok : list;
    return pool[seed % pool.length];
  }
  // Home rotates daily; the result screen picks by score (triumph vs resolve); empty analysis gets the handwriting texture.
  function setWatermark(kind) {
    wmWanted = kind;
    if (!wmEl) return;
    if (!kind || !wmOk[kind]) { wmEl.classList.remove('on'); return; }
    wmEl.style.setProperty('--wm', 'url("' + new URL('assets/wm-' + kind + '.jpg', document.baseURI).href + '")');
    wmEl.classList.add('on');
  }
  function watermarkFor(screen) {
    var day = Math.floor(Date.now() / 86400000);
    if (screen === 'home') return pickFrom(WM_WIN.concat(WM_TRY), day);
    if (screen === 'result') {
      var a = A.findAttempt(view.attemptId);
      var p = a && a.result.max ? a.result.correct * 100 / a.result.max : 0;
      var seed = 0, id = a ? a.id : '';
      for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
      return pickFrom(p >= 60 ? WM_WIN : WM_TRY, seed);
    }
    if (screen === 'insights' && !attempts().length) return 'script';
    return null;
  }

  /* ---------- shabash for right-and-quick answers ---------- */
  function recommendedSec() {
    var m = settings().perQuestionMinutes;
    return m > 0 ? m * 60 : 60;
  }
  function isFastRight(qid, answer, times) {
    return answer !== undefined && answer === QUESTIONS[qid].correct && ((times && times[qid]) || 0) <= recommendedSec();
  }
  function shabashLine(qid) {
    var lines = window.AAI_SHABASH || [];
    if (!lines.length) return '';
    var h = 0;
    for (var i = 0; i < qid.length; i++) h = (h * 31 + qid.charCodeAt(i)) % 9973;
    return lines[h % lines.length];
  }
  function shabashBox(qid, seconds) {
    var line = shabashLine(qid);
    if (!line) return '';
    return '<div class="shabash te">' + line + ' <span class="when">' + (seconds < 1 ? 'under 1s' : seconds + 's') + ' of ' + recommendedSec() + 's</span></div>';
  }

  /* ---------- custom dialogs (replace the browser's confirm / alert) ---------- */
  var dialogHandler = null;
  function closeDialog() { modalRoot.innerHTML = ''; dialogHandler = null; }
  // opts: title, message, yes (button label), no (label, omit for a plain notice), danger (red yes button)
  function askConfirm(opts, onYes) {
    var hasNo = opts.no !== null;
    modalRoot.innerHTML = '<div class="modal-back" data-dialog="backdrop"><div class="modal" role="dialog" aria-modal="true">' +
      '<h3>' + esc(opts.title) + '</h3><div class="muted">' + esc(opts.message) + '</div>' +
      '<div class="row" style="margin-top:16px;justify-content:flex-end">' +
      (hasNo ? '<button class="big" data-dialog="no">' + esc(opts.no || 'Cancel') + '</button>' : '') +
      '<button class="big ' + (opts.danger ? 'danger' : 'primary') + '" data-dialog="yes" id="dialog-yes">' + esc(opts.yes || 'OK') + '</button></div></div></div>';
    dialogHandler = { onYes: onYes || null, hasNo: hasNo };
    var yes = document.getElementById('dialog-yes');
    if (yes) yes.focus();
  }
  function notify(message, title) { askConfirm({ title: title || 'Heads up', message: message, no: null, yes: 'OK' }); }

  /* ---------- small helpers ---------- */
  function go(next) {
    view = Object.assign({ screen: 'home', tab: view.tab || 'full', i: 0, filter: 'all', shown: {} }, next);
    render();
  }
  function pct(n) { return Math.round(n * 100); }
  function chipGroup(name, items, selected, attr) {
    return '<div class="chips">' + items.map(function (it) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + it[0] + '"' + (attr || '') +
        (String(it[0]) === String(selected) ? ' checked' : '') + '><span>' + it[1] + '</span></label>';
    }).join('') + '</div>';
  }
  function statusTag(status) {
    var map = { new: ['plain', 'Not started'], early: ['plain', 'Early days'], weak: ['bad', 'Weak'], improving: ['warn', 'Improving'], strong: ['good', 'Strong'] };
    var m = map[status];
    return '<span class="tag ' + m[0] + '">' + m[1] + '</span>';
  }
  function minutesFor(n) {
    var s = settings();
    return s.perQuestionMinutes ? Math.ceil(n * s.perQuestionMinutes) : 0;
  }

  /* ---------- per-question live timer (shown quietly next to the question number) ---------- */
  var qTimerHandle = null;
  function stopQTimer() { if (qTimerHandle) { clearInterval(qTimerHandle); qTimerHandle = null; } }
  function startQTimer(getTimes) {
    stopQTimer();
    var el = document.getElementById('qtimer');
    if (!el) return;
    function upd() {
      if (!clock.qid) return;
      var t = (getTimes()[clock.qid] || 0) + Math.round((Date.now() - clock.start) / 1000);
      var rec = recommendedSec();
      el.textContent = fmtTime(t) + ' / ' + fmtTime(rec);
      el.className = 'qtimer' + (t > rec ? ' over' : '');
    }
    upd();
    qTimerHandle = setInterval(upd, 1000);
  }

  /* ---------- per-question clock ---------- */
  function clockStart(qid) { clock = { qid: qid, start: Date.now() }; }
  function clockStop(times) {
    if (clock.qid) {
      var sec = Math.min(300, Math.round((Date.now() - clock.start) / 1000));
      times[clock.qid] = (times[clock.qid] || 0) + sec;
    }
    clock = { qid: null, start: 0 };
  }

  /* ---------- finite tests ---------- */
  function startTest(o) {
    if (!o.qids.length) { notify('No questions match that selection.'); return; }
    var s = settings();
    var qids = o.noShuffle ? o.qids : (s.shuffle ? A.shuffled(o.qids) : o.qids);
    var minutes = minutesFor(qids.length);
    current = {
      id: 'a' + Date.now(), title: o.title, startedAt: Date.now(),
      endsAt: minutes ? Date.now() + minutes * 60000 : 0,
      config: { kind: o.kind, testKey: o.testKey || null, minutes: minutes, negative: s.negative, reattemptOf: o.reattemptOf || null },
      qids: qids, answers: {}, marked: {}, visited: {}, times: {}
    };
    A.save(KEYS.current, current);
    go({ screen: 'test' });
  }
  function startKey(key) {
    var t = A.tests().full.concat(A.tests().chapter).filter(function (x) { return x.key === key; })[0];
    if (t) startTest({ kind: t.kind, testKey: t.key, title: t.title + ' (' + t.qids.length + ' Q)', qids: t.qids });
  }
  function chapterQids(chId, mode) {
    var st = A.computeStats().perQ;
    return A.tests().chapter.filter(function (t) { return t.chapter === chId; })[0].qids.filter(function (qid) {
      var pq = st[qid];
      if (mode === 'weak') return pq && pq.last !== 'correct';
      if (mode === 'unseen') return !pq;
      return true;
    });
  }
  function startChapter(chId, mode) {
    var label = { all: 'Chapter test', weak: 'Weak questions', unseen: 'New questions' }[mode];
    var qids = chapterQids(chId, mode);
    startTest({ kind: 'chapter', testKey: mode === 'all' ? 'chapter-' + chId : null, title: chapterName(chId) + ' - ' + label + ' (' + qids.length + ' Q)', qids: qids });
  }
  function startReattempt(att, mode) {
    var qids = att.qids.filter(function (qid) { return mode === 'all' || qStatus(att, qid) !== 'correct'; });
    startTest({ kind: 'reattempt', title: (mode === 'all' ? 'Retake: ' : 'Re-attempt: ') + att.title, qids: qids, reattemptOf: att.id, noShuffle: true });
  }
  function startList(kind, title, qids) { startTest({ kind: kind, title: title + ' (' + qids.length + ' Q)', qids: qids }); }

  function submitCurrent(auto) {
    if (!current) return;
    stopTimer();
    clockStop(current.times);
    var done = current;
    done.submittedAt = Date.now();
    done.timeSpent = Math.round((done.submittedAt - done.startedAt) / 1000);
    done.autoSubmitted = !!auto;
    done.result = A.scoreOf(done);
    var list = attempts();
    list.push(done);
    A.saveAttempts(list);
    A.remove(KEYS.current);
    current = null;
    modalRoot.innerHTML = '';
    go({ screen: 'result', attemptId: done.id });
  }

  /* ---------- timer ---------- */
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  function startTimer() {
    stopTimer();
    if (!current || !current.endsAt) return;
    timerHandle = setInterval(tick, 1000);
    tick();
  }
  function tick() {
    if (!current) return;
    var left = (current.endsAt - Date.now()) / 1000;
    var el = document.getElementById('timer');
    if (el) {
      el.textContent = fmtTime(left);
      el.className = 'timer-pill' + (left < 60 ? ' low' : '');
      var note = document.getElementById('timer-note');
      if (!note && left < 60 && el.parentNode) { note = document.createElement('span'); note.id = 'timer-note'; note.className = 'timer-note te'; note.textContent = 'టైమ్ తక్కువ – స్పీడ్ పెంచు!'; el.parentNode.insertBefore(note, el); }
    }
    if (left <= 0) submitCurrent(true);
  }

  /* ---------- infinity practice ---------- */
  function infPool() {
    return DATA.questions.filter(function (q) {
      return (inf.subject === 'Mixed' || q.subject === inf.subject) && (!inf.chapter || q.chapter === inf.chapter);
    }).map(function (q) { return q.id; });
  }
  function infAddBatch() {
    var pool = infPool();
    var left = pool.filter(function (id) { return !inf.served[id]; });
    if (!left.length) { inf.served = {}; inf.cycle++; left = pool; }
    var st = A.computeStats().perQ;
    var bm = A.bookmarks();
    function group(id) {
      var pq = st[id];
      if (!pq) return 1;                       // never seen
      return pq.last === 'correct' ? 2 : 0;    // 0 = missed last time
    }
    var batch;
    if (inf.focus === 'random') {
      batch = A.shuffled(left);
    } else if (inf.focus === 'weak' || inf.focus === 'unseen') {
      var order = inf.focus === 'weak' ? [0, 1, 2] : [1, 0, 2];
      batch = [];
      order.forEach(function (g) { batch = batch.concat(A.shuffled(left.filter(function (id) { return group(id) === g; }))); });
    } else {
      // smart mix: weighted random, missed questions and unseen ones come up more often
      var weights = { 0: 4, 1: 3, 2: 1 };
      var rest = left.slice();
      batch = [];
      while (rest.length && batch.length < 10) {
        var total = rest.reduce(function (n, id) { return n + weights[group(id)] * (bm[id] ? 1.5 : 1); }, 0);
        var r = Math.random() * total, pick = 0;
        for (var k = 0; k < rest.length; k++) {
          r -= weights[group(rest[k])] * (bm[rest[k]] ? 1.5 : 1);
          if (r <= 0) { pick = k; break; }
        }
        batch.push(rest.splice(pick, 1)[0]);
      }
    }
    batch.slice(0, 10).forEach(function (id) { inf.qids.push(id); inf.served[id] = true; });
  }
  function infStart() {
    var s = settings();
    inf = {
      id: 'i' + Date.now(), startedAt: Date.now(), subject: s.infSubject || 'Mixed', focus: s.infFocus || 'smart',
      chapter: s.infChapter || null, qids: [], answers: {}, checked: {}, times: {}, served: {}, cycle: 1, streak: 0, best: 0, i: 0
    };
    infAddBatch();
    A.save(KEYS.infinity, inf);
    go({ screen: 'infinity' });
  }
  function infStartChapter(chId) {
    var s = settings();
    s.infChapter = chId; s.infSubject = CHAPTERS[chId].subject; A.save(KEYS.settings, s);
    infStart();
  }
  function infEnd() {
    clockStop(inf.times);
    var done = inf.qids.filter(function (id) { return inf.checked[id]; });
    var session = inf;
    inf = null;
    A.remove(KEYS.infinity);
    modalRoot.innerHTML = '';
    if (!done.length) { go({ screen: 'home' }); return; }
    var att = {
      id: 'a' + Date.now(), title: 'Infinity practice' + (session.chapter ? ': ' + chapterName(session.chapter) : ' (' + session.subject + ')'),
      startedAt: session.startedAt, submittedAt: Date.now(), timeSpent: Math.round((Date.now() - session.startedAt) / 1000),
      config: { kind: 'infinity', testKey: null, minutes: 0, negative: settings().negative, reattemptOf: null },
      qids: done, answers: session.answers, marked: {}, visited: {}, times: session.times
    };
    att.result = A.scoreOf(att);
    var list = attempts();
    list.push(att);
    A.saveAttempts(list);
    go({ screen: 'result', attemptId: att.id });
  }

  /* ---------- shared pieces ---------- */
  function starBtn(qid) {
    var on = A.bookmarks()[qid];
    return '<button class="star' + (on ? ' on' : '') + '" data-action="bookmark" data-arg="' + qid + '" title="Bookmark this question">' + (on ? '&#9733; Bookmarked' : '&#9734; Bookmark') + '</button>';
  }
  function bulletList(items, cls) {
    return items.length ? '<ul' + (cls ? ' class="' + cls + '"' : '') + '>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '';
  }
  // the full note for one topic: everything the topic is about
  function topicBody(t) {
    var p = [];
    t.overview.forEach(function (x) { p.push('<p>' + x + '</p>'); });
    if (t.terms.length) p.push('<h5>Key terms</h5><dl class="terms">' + t.terms.map(function (x) { return '<dt>' + x.term + '</dt><dd>' + x.meaning + '</dd>'; }).join('') + '</dl>');
    if (t.formulas.length) p.push('<h5>Formulas and results</h5>' + bulletList(t.formulas, 'formulas'));
    if (t.how.length) { p.push('<h5>Why it works</h5>'); t.how.forEach(function (x) { p.push('<p>' + x + '</p>'); }); }
    if (t.cases.length) p.push('<h5>Types, cases and properties</h5>' + bulletList(t.cases));
    if (t.values.length) p.push('<h5>Values to remember</h5>' + bulletList(t.values));
    if (t.uses.length) p.push('<h5>Where it is used</h5>' + bulletList(t.uses));
    if (t.mistakes.length) p.push('<h5>Common mistakes</h5>' + bulletList(t.mistakes, 'mistakes'));
    if (t.exam.length) p.push('<h5>In the exam and practice</h5>' + bulletList(t.exam));
    return p.join('');
  }
  // collapsible "Additional info" block shown under every solution
  function deepHtml(q) {
    var t = q.topic && TOPICS[q.topic];
    if (!t) return '';
    return '<details class="deep" open><summary class="deep-head"><small>Additional info</small>' + t.title + '</summary><div class="deep-body">' +
      (q.topicLink ? '<div class="deep-link"><b>In this question:</b> ' + q.topicLink + '</div>' : '') + topicBody(t) +
      '<div style="margin-top:14px"><button class="sm soft" data-action="topic" data-arg="' + t.id + '">Open this topic as a full page</button></div></div></details>';
  }
  // order: shortcut trick, given, concept, formula, calculation, answer, good-to-know, then the in-depth topic notes
  function solutionHtml(q) {
    var parts = ['<div class="solution">'];
    if (q.trick) parts.push('<div class="note trick"><b>Shortcut trick</b>' + q.trick + '</div>');
    if (q.given) parts.push('<div class="sol-block"><h4>Given</h4><div>' + q.given + '</div></div>');
    if (q.concept) parts.push('<div class="sol-block"><h4>Concept</h4><div>' + q.concept + '</div></div>');
    if (q.formula) parts.push('<div class="sol-block"><h4>Formula used</h4><div>' + q.formula + '</div></div>');
    if (q.steps.length) {
      parts.push('<div class="sol-block"><h4>Calculation</h4><ol class="sol-steps">' + q.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>');
    }
    parts.push('<div class="hence">Hence, option ' + LETTERS[q.correct] + ' is correct.</div>');
    if (q.info) parts.push('<div class="note info"><b>Good to know</b>' + q.info + '</div>');
    parts.push(deepHtml(q));
    parts.push('</div>');
    return parts.join('');
  }
  function revealBlock(q, shown) {
    return shown
      ? solutionHtml(q) + '<div style="margin-top:10px"><button class="link" data-action="toggle-solution" data-arg="' + q.id + '">Hide solution</button></div>'
      : '<div class="reveal"><div class="muted" style="margin-bottom:4px">Think it through first, then check.</div><div class="te-note" style="margin:0 0 10px">ఒక్కసారి నువ్వే ఆలోచించు, తర్వాత చూడు.</div>' +
        '<button class="primary" data-action="toggle-solution" data-arg="' + q.id + '">Show solution</button></div>';
  }
  // options for review-style screens: the right answer stays hidden until the solution is opened
  function reviewOptions(q, mine, shown) {
    return q.options.map(function (o, idx) {
      var cls = 'option static', note = '';
      if (shown && idx === q.correct) {
        cls += ' correct';
        note = '<span class="tag good">' + (idx === mine ? 'Correct &middot; your answer' : 'Correct answer') + '</span>';
      } else if (idx === mine) {
        if (shown) { cls += ' wrong'; note = '<span class="tag bad">Your answer</span>'; }
        else { cls += ' yours'; note = '<span class="tag">Your answer</span>'; }
      }
      return '<div class="' + cls + '"><span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span>' + note + '</div>';
    }).join('');
  }
  function tagsFor(q, extra) {
    return (extra || '') + '<span class="tag">' + q.subject + '</span><span class="tag plain">' + esc(chapterName(q.chapter)) + '</span>' +
      (q.source ? '<span class="tag plain">' + esc(q.source) + '</span>' : '');
  }
  function sparkline(points) {
    if (points.length < 2) return '<div class="muted small">Take at least two tests to see your trend.</div>';
    var w = 300, h = 70, pad = 6;
    var xs = points.map(function (p, i) { return pad + i * (w - 2 * pad) / (points.length - 1); });
    var ys = points.map(function (p) { return h - pad - (p.pct / 100) * (h - 2 * pad); });
    var line = xs.map(function (x, i) { return x.toFixed(1) + ',' + ys[i].toFixed(1); }).join(' ');
    var dots = xs.map(function (x, i) { return '<circle cx="' + x.toFixed(1) + '" cy="' + ys[i].toFixed(1) + '" r="2.5" fill="#8f3d14"><title>' + esc(points[i].title) + ': ' + Math.round(points[i].pct) + '%</title></circle>'; }).join('');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline points="' + line + '" fill="none" stroke="#8f3d14" stroke-width="1.6" stroke-linejoin="round"/>' + dots + '</svg>';
  }

  /* ---------- home ---------- */
  function renderHome() {
    var s = settings();
    var st = A.computeStats();
    var mistakes = A.mistakeIds().length;
    var bmCount = Object.keys(A.bookmarks()).length;
    var acc = st.totals.presented ? pct(st.totals.correct / st.totals.presented) + '%' : '-';

    var banner = '';
    if (current) {
      banner = '<div class="banner"><div><b>Test in progress:</b> ' + esc(current.title) + ' <span class="muted small">(answered ' +
        Object.keys(current.answers).length + ' of ' + current.qids.length + ')</span></div><div class="row">' +
        '<button class="primary" data-action="resume">Resume</button><button data-action="discard">Discard</button></div></div>';
    }
    if (inf) {
      banner += '<div class="banner"><div><b>Infinity session in progress:</b> ' + Object.keys(inf.checked).length + ' answered</div><div class="row">' +
        '<button class="primary" data-action="resume-inf">Resume</button><button data-action="discard-inf">End session</button></div></div>';
    }

    var tabs = [['full', 'Full tests'], ['chapter', 'Chapter tests'], ['infinity', 'Infinity practice'], ['custom', 'Custom & revision']].map(function (t) {
      return '<button class="' + (view.tab === t[0] ? 'active' : '') + '" data-action="tab" data-arg="' + t[0] + '">' + t[1] + '</button>';
    }).join('');

    var panel = view.tab === 'full' ? fullTab() : view.tab === 'chapter' ? chapterTab(st) : view.tab === 'infinity' ? infinityTab(s) : customTab(s, mistakes, bmCount);

    var hist = attempts().slice().reverse();
    var histHtml = hist.length ? hist.slice(0, 6).map(function (a) {
      var r = a.result;
      var kindTag = a.config.kind === 'reattempt' ? '<span class="tag warn">Re-attempt</span>' : a.config.kind === 'infinity' ? '<span class="tag mark">Infinity</span>' : '';
      return '<div class="history-item"><div><div>' + kindTag + '<b>' + esc(a.title) + '</b></div>' +
        '<div class="muted small"><span class="score-badge">' + r.score + '/' + r.max + '</span>' + fmtDate(a.submittedAt) + ' &middot; ' +
        r.correct + ' right &middot; ' + r.wrong + ' wrong &middot; ' + r.skipped + ' skipped</div></div><div class="row">' +
        '<button class="sm" data-action="open-result" data-arg="' + a.id + '">Result</button>' +
        '<button class="sm" data-action="open-review" data-arg="' + a.id + '">Solutions</button>' +
        (r.wrong + r.skipped > 0 ? '<button class="sm soft" data-action="reattempt" data-arg="' + a.id + '">Re-attempt</button>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty">No attempts yet. Pick a test above and your results will show up here.</div>';

    app.innerHTML = banner +
      '<div class="hero"><div class="hero-text"><div class="hero-title"><span class="t-text">ఆకాశం నీ హద్దురా!</span><img class="t-img" src="assets/title-dark.png" alt="ఆకాశం నీ హద్దురా!"></div>' +
      '<div class="hero-quote te">ఇప్పుడు గెలవడం గాని ఓడిపోవడం గాని – నీ చేతిలోనే ఉంది, గెలుస్తావు కదా మహా?</div>' +
      '<div class="hero-sub">AAI JE Airport Operations &middot; Maths &amp; Physics mock tests</div>' +
      '<div class="hero-sub2">Take a test, open the solutions one by one, and see exactly where to focus.</div>' +
      '<div class="row" style="margin-top:14px"><button class="primary" data-action="tab" data-arg="full">Start a test</button><button class="soft" data-action="insights">View my analysis</button></div></div>' +
      '<div class="hero-img"></div></div>' +

      '<div class="kpis"><div class="kpi"><b>' + DATA.questions.length + '</b><span>questions in bank</span></div>' +
      '<div class="kpi pri"><b>' + st.unique + '</b><span>practised so far</span></div>' +
      '<div class="kpi good"><b>' + acc + '</b><span>overall accuracy</span></div>' +
      '<div class="kpi bad"><b>' + mistakes + '</b><span>in mistake bank</span></div></div>' +
      '<div class="card settings-bar"><div class="grp"><span class="field-label">Timer</span>' +
      chipGroup('set-time', [[0, 'Off'], [0.5, '30 s / Q'], [1, '1 min / Q'], [2, '2 min / Q']], s.perQuestionMinutes, ' data-setting="perQuestionMinutes"') + '</div>' +
      '<div class="grp"><span class="field-label">Negative marking</span>' +
      chipGroup('set-neg', [[0, 'None'], [0.25, '-0.25'], [0.33, '-0.33'], [1, '-1']], s.negative, ' data-setting="negative"') + '</div>' +
      '<label class="check"><input type="checkbox" data-setting="shuffle"' + (s.shuffle ? ' checked' : '') + '> Shuffle questions</label></div>' +
      '<div class="tabs">' + tabs + '</div>' + panel +
      '<div class="card"><div class="card-head"><div class="section-title">Recent attempts</div>' +
      (hist.length ? '<button class="link danger" data-action="clear-history">Clear history</button>' : '') + '</div>' + histHtml + '</div>';
  }

  function fullTab() {
    var all = A.tests().full;
    var groups = [['Mixed', 'Full mocks (Maths + Physics)'], ['Maths', 'Maths tests'], ['Physics', 'Physics tests']];
    return '<div class="muted" style="margin-bottom:12px">Fixed question sets. The six Full Mocks together cover every question in the bank exactly once, ' +
      'so you can retake the same test later and compare.</div>' + groups.map(function (g) {
      var rows = all.filter(function (t) { return t.group === g[0]; }).map(function (t) {
        var rec = A.testRecord(t.key);
        return '<tr><td class="name">' + esc(t.title) + '</td><td class="num">' + t.qids.length + '</td>' +
          '<td class="num">' + (rec ? rec.best + '%' : '-') + '</td><td class="num">' + (rec ? rec.last + '%' : '-') + '</td>' +
          '<td class="num">' + (rec ? rec.count : 0) + '</td>' +
          '<td class="right"><button class="sm primary" data-action="start-key" data-arg="' + t.key + '">' + (rec ? 'Retake' : 'Start') + '</button></td></tr>';
      }).join('');
      return '<div class="card flush"><div class="card-head"><div class="section-title">' + g[1] + '</div></div><div class="table-scroll"><table class="tbl"><thead><tr>' +
        '<th>Test</th><th class="num">Questions</th><th class="num">Best</th><th class="num">Last</th><th class="num">Attempts</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).join('');
  }

  function chapterTab(st) {
    var sub = view.subject || 'All';
    var filters = chipGroup('ch-sub', [['All', 'All'], ['Maths', 'Maths'], ['Physics', 'Physics']], sub, ' data-view="subject"');
    var rows = A.tests().chapter.filter(function (t) { return sub === 'All' || t.group === sub; }).map(function (t) {
      var c = st.perCh[t.chapter];
      var rec = A.testRecord(t.key);
      return '<tr><td class="name">' + esc(t.title) + (sub === 'All' ? ' <span class="tag plain">' + t.group + '</span>' : '') + '</td>' +
        '<td class="num">' + t.qids.length + '</td>' +
        '<td class="num">' + (c.score === null ? '-' : pct(c.score) + '%') + '</td>' +
        '<td>' + statusTag(c.status) + '</td>' +
        '<td class="right"><div class="row" style="justify-content:flex-end">' +
        '<button class="sm primary" data-action="start-chapter" data-arg="' + t.chapter + '">' + (rec ? 'Retake' : 'Start test') + '</button>' +
        '<button class="sm" data-action="chapter" data-arg="' + t.chapter + '">Focus</button></div></td></tr>';
    }).join('');
    return '<div class="card flush"><div class="card-head"><div class="section-title">Chapter tests</div>' + filters + '</div>' +
      '<div class="table-scroll"><table class="tbl"><thead><tr><th>Chapter</th><th class="num">Questions</th><th class="num">Your score</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="muted small" style="margin-bottom:14px">"Focus" opens the chapter page: the concepts you keep missing and one-click practice on them.</div>';
  }

  function infinityTab(s) {
    var chapterOpts = '<option value="">All chapters</option>' + DATA.chapters.map(function (c) {
      return '<option value="' + c.id + '"' + (s.infChapter === c.id ? ' selected' : '') + '>' + esc(c.subject + ': ' + chapterName(c.id)) + '</option>';
    }).join('');
    return '<div class="card"><div class="card-head"><div><div class="section-title">Infinity practice</div>' +
      '<div class="muted">Endless questions, one at a time. Check each answer straight away, open the solution if you want it, and keep going. ' +
      'When the bank runs out it starts a new round. Stop whenever you like and the session is saved to your analysis.</div></div></div>' +
      '<div class="field-label first">Subject</div>' + chipGroup('inf-sub', [['Mixed', 'Maths + Physics'], ['Maths', 'Maths'], ['Physics', 'Physics']], s.infSubject || 'Mixed', ' data-setting="infSubject"') +
      '<div class="field-label">Which questions first</div>' +
      chipGroup('inf-focus', [['smart', 'Smart mix'], ['weak', 'My weak ones'], ['unseen', 'New ones'], ['random', 'Random']], s.infFocus || 'smart', ' data-setting="infFocus"') +
      '<div class="field-label">Limit to one chapter (optional)</div>' +
      '<select data-setting="infChapter" style="font:inherit;font-size:12px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text2);min-width:260px">' + chapterOpts + '</select>' +
      '<div style="margin-top:16px"><button class="primary big" data-action="inf-start">Start infinity practice</button></div></div>';
  }

  function customTab(s, mistakes, bmCount) {
    var chapterHtml = ['Maths', 'Physics'].map(function (sub) {
      var chips = DATA.chapters.filter(function (c) { return c.subject === sub; }).map(function (c) {
        return '<label class="chip"><input type="checkbox" name="chapter" data-subject="' + sub + '" value="' + c.id + '"><span>' +
          esc(chapterName(c.id)) + '<small>' + c.count + '</small></span></label>';
      }).join('');
      return '<div><div class="chapter-head"><b>' + sub + '</b><span><button type="button" class="link" data-action="chapters-all" data-arg="' + sub + '">Select all</button>' +
        '<button type="button" class="link" data-action="chapters-none" data-arg="' + sub + '">Clear</button></span></div><div class="chips">' + chips + '</div></div>';
    }).join('');
    return '<div class="grid-2"><div class="card"><div class="section-title" style="margin-bottom:10px">Random mock</div><form id="mock-form">' +
      '<div class="field-label first">Subject</div>' + chipGroup('subject', [['Maths', 'Maths'], ['Physics', 'Physics'], ['Mixed', 'Mixed']], 'Mixed') +
      '<div class="field-label">Questions</div>' + chipGroup('count', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [0, 'All']], 30) +
      '<div style="margin-top:16px"><button class="primary big block" type="submit">Start random mock</button></div></form></div>' +
      '<div><div class="card"><div class="card-head" style="margin:0"><div><div class="section-title">Mistake bank</div>' +
      '<div class="muted small">Latest result wrong or skipped: <b style="color:var(--text)">' + mistakes + '</b> questions</div></div>' +
      '<button class="primary" data-action="mistakes"' + (mistakes ? '' : ' disabled') + '>Practise mistakes</button></div></div>' +
      '<div class="card"><div class="card-head" style="margin:0"><div><div class="section-title">Bookmarked</div>' +
      '<div class="muted small">Questions you starred to revisit: <b style="color:var(--text)">' + bmCount + '</b></div></div>' +
      '<button class="primary" data-action="bookmarks"' + (bmCount ? '' : ' disabled') + '>Practise bookmarks</button></div></div></div></div>' +
      '<div class="card"><div class="section-title" style="margin-bottom:10px">Pick your own chapters</div><form id="chapter-form"><div class="chapter-cols">' + chapterHtml + '</div>' +
      '<div class="row spread" style="margin-top:16px"><span class="muted small">Uses the timer and marking set above.</span><button class="primary big" type="submit">Start practice</button></div></form></div>';
  }

  /* ---------- finite test screen ---------- */
  function paletteClass(qid, i) {
    var cls = 'pbtn';
    if (current.marked[qid]) cls += ' marked';
    else if (current.answers[qid] !== undefined) cls += ' answered';
    else if (current.visited[qid]) cls += ' skipped';
    if (i === view.i) cls += ' current';
    return cls;
  }
  function renderTest() {
    clockStop(current.times);
    var qid = current.qids[view.i];
    var q = QUESTIONS[qid];
    clockStart(qid);
    current.visited[qid] = true;
    var chosen = current.answers[qid];
    var total = current.qids.length;
    var answered = Object.keys(current.answers).length;
    var opts = q.options.map(function (o, idx) {
      return '<div class="option' + (chosen === idx ? ' selected' : '') + '" data-action="choose" data-arg="' + idx + '"><span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span></div>';
    }).join('');
    var palette = current.qids.map(function (id, i) { return '<div class="' + paletteClass(id, i) + '" data-action="goto" data-arg="' + i + '">' + (i + 1) + '</div>'; }).join('');

    topExtra.innerHTML = current.endsAt ? '<span class="timer-pill" id="timer"></span>' : '<span class="muted small">No timer</span>';
    app.innerHTML = '<div class="progress"><i style="width:' + Math.round(answered * 100 / total) + '%"></i></div><div class="test-layout"><div class="card">' +
      '<div class="qhead"><div><span class="tag">' + q.subject + '</span><span class="tag plain">' + esc(chapterName(q.chapter)) + '</span></div>' +
      '<div class="qnum"><span class="qtimer" id="qtimer" title="Time on this question / recommended"></span>Question <b>' + (view.i + 1) + '</b> of ' + total + '</div></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts +
      '<div class="actions"><button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>&larr; Previous</button>' +
      '<button data-action="mark">' + (current.marked[qid] ? 'Unmark review' : 'Mark for review') + '</button>' +
      '<button data-action="clear"' + (chosen === undefined ? ' disabled' : '') + '>Clear</button>' + starBtn(qid) + '<span class="spacer"></span>' +
      '<button class="primary" data-action="next"' + (view.i === total - 1 ? ' disabled' : '') + '>Save &amp; next &rarr;</button></div></div>' +
      '<div class="side"><div class="card"><div class="section-title" style="margin-bottom:2px">' + esc(current.title) + '</div>' +
      '<div class="muted small" style="margin-bottom:12px">Answered ' + answered + ' of ' + total + '</div><div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Answered</span><span style="--c:var(--bad)">Not answered</span><span style="--c:var(--mark)">Marked</span><span style="--c:var(--line)">Not visited</span></div>' +
      '<div style="margin-top:14px"><button class="primary big block" data-action="submit">Submit test</button></div></div></div></div>';
    A.save(KEYS.current, current);
    startQTimer(function () { return current.times; });
    if (current.endsAt) tick();
  }
  function confirmSubmit() {
    var total = current.qids.length;
    var answered = Object.keys(current.answers).length;
    var marked = Object.keys(current.marked).filter(function (k) { return current.marked[k]; }).length;
    modalRoot.innerHTML = '<div class="modal-back"><div class="modal"><h3>Submit your test?</h3><div class="muted">You cannot change your answers after this.</div><div class="te-note te">ధైర్యంగా సబ్మిట్ చెయ్యి – ఆల్ ది బెస్ట్!</div>' +
      '<div class="modal-stats"><div class="stat good"><b>' + answered + '</b>Answered</div><div class="stat bad"><b>' + (total - answered) + '</b>Not answered</div><div class="stat"><b>' + marked + '</b>Marked</div></div>' +
      '<div class="row"><button class="primary big" data-action="confirm-submit">Yes, submit</button><button class="big" data-action="cancel-modal">Keep working</button></div></div></div>';
  }

  /* ---------- infinity screen ---------- */
  function renderInfinity() {
    clockStop(inf.times);
    if (inf.i >= inf.qids.length) infAddBatch();
    var qid = inf.qids[inf.i];
    var q = QUESTIONS[qid];
    var checked = !!inf.checked[qid];
    var mine = inf.answers[qid];
    if (!checked) clockStart(qid);
    var shown = !!view.shown[qid];
    var n = Object.keys(inf.checked).length;
    var correct = Object.keys(inf.checked).filter(function (id) { return inf.answers[id] === QUESTIONS[id].correct; }).length;

    var opts;
    if (!checked) {
      opts = q.options.map(function (o, idx) {
        return '<div class="option' + (mine === idx ? ' selected' : '') + '" data-action="inf-choose" data-arg="' + idx + '"><span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span></div>';
      }).join('');
    } else {
      opts = q.options.map(function (o, idx) {
        var cls = 'option static', note = '';
        if (idx === q.correct) { cls += ' correct'; note = '<span class="tag good">Correct</span>'; }
        else if (idx === mine) { cls += ' wrong'; note = '<span class="tag bad">Your answer</span>'; }
        return '<div class="' + cls + '"><span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span>' + note + '</div>';
      }).join('');
    }
    var verdict = !checked ? '' : mine === undefined ? '<span class="tag warn">Skipped</span>' : mine === q.correct ? '<span class="tag good">Correct</span>' : '<span class="tag bad">Wrong</span>';

    topExtra.innerHTML = '<span class="tag mark" style="margin:0">Infinity &middot; round ' + inf.cycle + '</span>';
    app.innerHTML = '<div class="card"><div class="live"><div><b>' + n + '</b>answered</div><div><b>' + correct + '</b>correct</div>' +
      '<div><b>' + (n ? pct(correct / n) + '%' : '-') + '</b>accuracy</div><div><b>' + inf.streak + '</b>streak</div><div><b>' + inf.best + '</b>best streak</div>' +
      '<span style="flex:1"></span><button class="primary" data-action="inf-end">End session</button></div></div>' +
      '<div class="card"><div class="qhead"><div>' + verdict + tagsFor(q) + '</div><div class="qnum"><span class="qtimer" id="qtimer" title="Time on this question / recommended"></span>Question <b>' + (inf.i + 1) + '</b></div></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts + infMood(inf, checked, mine, q) +
      (checked ? revealBlock(q, shown) : '') +
      '<div class="actions">' + starBtn(qid) + '<span class="spacer"></span>' +
      (!checked
        ? '<button data-action="inf-skip">Skip</button><button class="primary" data-action="inf-check"' + (mine === undefined ? ' disabled' : '') + '>Check answer</button>'
        : '<button class="primary" data-action="inf-next">Next question &rarr;</button>') + '</div></div>';
    A.save(KEYS.infinity, inf);
    if (checked) {
      var qt = document.getElementById('qtimer');
      var spent = inf.times[qid] || 0;
      if (qt) { qt.textContent = fmtTime(spent) + ' / ' + fmtTime(recommendedSec()); qt.className = 'qtimer' + (spent > recommendedSec() ? ' over' : ''); }
      stopQTimer();
    } else {
      startQTimer(function () { return inf.times; });
    }
  }
  function infMood(session, checked, mine, q) {
    if (!checked) return '';
    if (isFastRight(q.id, mine, session.times)) return shabashBox(q.id, session.times[q.id] || 0);
    if (mine === q.correct) return session.streak >= 3 ? '<div class="te-note te">ఫైర్‌లో ఉన్నావ్! ' + session.streak + ' వరుసగా సరైనవి – ఆగకు!</div>' : '<div class="te-note te">సూపర్! సరైన సమాధానం.</div>';
    return '<div class="te-note te">పర్లేదు, గెలుస్తావు కదా? తర్వాతి ప్రశ్న నీదే.</div>';
  }
  function infCheck(skip) {
    var qid = inf.qids[inf.i];
    if (inf.checked[qid]) return;
    if (skip) delete inf.answers[qid];
    clockStop(inf.times);
    inf.checked[qid] = true;
    if (inf.answers[qid] === QUESTIONS[qid].correct) { inf.streak++; inf.best = Math.max(inf.best, inf.streak); } else { inf.streak = 0; }
    renderInfinity();
  }

  /* ---------- result ---------- */
  function chapterBreakdown(a) {
    var by = {};
    a.qids.forEach(function (qid) {
      var ch = QUESTIONS[qid].chapter;
      var row = by[ch] || (by[ch] = { id: ch, c: 0, w: 0, s: 0 });
      var s = qStatus(a, qid);
      if (s === 'correct') row.c++; else if (s === 'wrong') row.w++; else row.s++;
    });
    return Object.keys(by).map(function (k) { by[k].t = by[k].c + by[k].w + by[k].s; return by[k]; });
  }
  function fastNote(a) {
    var n = a.qids.filter(function (id) { return isFastRight(id, a.answers[id], a.times); }).length;
    if (!n) return '';
    return '<div class="te-note te">శభాష్ బేటా! ' + n + ' ప్రశ్నలు సరైన సమాధానంతో, టైమ్ లోపలే (' + recommendedSec() + 's లోపు) పూర్తి చేశావు.</div>';
  }
  function renderResult() {
    var a = A.findAttempt(view.attemptId);
    if (!a) { go({ screen: 'home' }); return; }
    var r = a.result;
    var accuracy = r.correct + r.wrong ? pct(r.correct / (r.correct + r.wrong)) : 0;
    var pc = r.max ? r.correct * 100 / r.max : 0, pw = r.max ? r.wrong * 100 / r.max : 0;
    var rows = chapterBreakdown(a);
    var tableRows = rows.map(function (row) {
      return '<tr class="click" data-action="chapter" data-arg="' + row.id + '"><td class="name">' + esc(chapterName(row.id)) + '</td>' +
        '<td><div class="bar"><i class="g" style="width:' + row.c * 100 / row.t + '%"></i><i class="r" style="width:' + row.w * 100 / row.t + '%"></i><i class="y" style="width:' + row.s * 100 / row.t + '%"></i></div></td>' +
        '<td class="num">' + row.c + ' / ' + row.t + '</td></tr>';
    }).join('');
    var weak = rows.filter(function (row) { return row.c / row.t < 0.6; }).sort(function (x, y) { return x.c / x.t - y.c / y.t; }).slice(0, 3);
    var focus = weak.length
      ? '<div class="card"><div class="section-title" style="margin-bottom:8px">Where to focus next</div>' + weak.map(function (row) {
        return '<div class="focus-item"><div class="focus-main"><span class="focus-rank">!</span><div><b>' + esc(chapterName(row.id)) + '</b><div class="muted small">' +
          row.c + ' of ' + row.t + ' right in this test &middot; ' + row.w + ' wrong &middot; ' + row.s + ' skipped</div></div></div>' +
          '<button class="sm soft" data-action="chapter" data-arg="' + row.id + '">See what to revise</button></div>';
      }).join('') + '</div>'
      : '<div class="tip good">Nice - every chapter in this test is at 60% or better. Try a harder set or a different chapter.</div>';

    var compare = '';
    if (a.config.reattemptOf) {
      var fixed = a.qids.filter(function (qid) { return qStatus(a, qid) === 'correct'; }).length;
      compare = '<div class="tip good">You fixed <b>' + fixed + '</b> of the ' + a.qids.length + ' questions you missed last time.</div>';
    }
    var tms = Object.keys(a.times || {});
    var avg = tms.length ? Math.round(tms.reduce(function (n, k) { return n + a.times[k]; }, 0) / tms.length) : 0;

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="card"><div class="result-top"><div class="donut" style="--a:' + pc + '%;--b:' + (pc + pw) + '%"><div><b>' + r.score + '</b><span>out of ' + r.max + '</span></div></div>' +
      '<div><div class="section-title">' + esc(a.title) + '</div><div class="muted small" style="margin:2px 0 8px">' + fmtDate(a.submittedAt) + ' &middot; time ' + fmtTime(a.timeSpent) +
      (avg ? ' &middot; avg ' + avg + 's per question' : '') + (a.autoSubmitted ? ' &middot; auto-submitted when time ended' : '') + '</div>' +
      '<div class="score-grid"><div class="stat good"><b>' + r.correct + '</b>Correct</div><div class="stat bad"><b>' + r.wrong + '</b>Wrong</div>' +
      '<div class="stat warn"><b>' + r.skipped + '</b>Skipped</div><div class="stat"><b>' + accuracy + '%</b>Accuracy</div></div>' +
      '<div class="te-note te">' + resultMessage(a) + '</div>' + fastNote(a) + '</div></div>' +
      '<div class="row" style="margin-top:16px"><button class="primary big" data-action="open-review" data-arg="' + a.id + '">Review &amp; solutions</button>' +
      (r.wrong + r.skipped > 0 ? '<button class="big soft" data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped (' + (r.wrong + r.skipped) + ')</button>' : '') +
      '<button class="big" data-action="retake" data-arg="' + a.id + '">Retake whole test</button><button class="big" data-action="home">Home</button></div></div>' +
      compare + focus +
      '<div class="card flush"><div class="card-head"><div class="section-title">Chapter-wise</div><span class="muted small">Click a chapter to see what to revise</span></div>' +
      '<div class="table-scroll"><table class="tbl"><thead><tr><th>Chapter</th><th></th><th class="num">Correct</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></div>';
  }

  /* ---------- review and study ---------- */
  function renderReview() {
    var a = A.findAttempt(view.attemptId);
    if (!a) { go({ screen: 'home' }); return; }
    var filter = view.filter;
    var list = a.qids.filter(function (qid) { return filter === 'all' || qStatus(a, qid) === filter; });
    if (!list.length) { list = a.qids; filter = 'all'; view.filter = 'all'; }
    if (view.i >= list.length) view.i = 0;
    var qid = list[view.i], q = QUESTIONS[qid];
    var st = qStatus(a, qid), mine = a.answers[qid], shown = !!view.shown[qid];
    var palette = list.map(function (id, i) {
      var s = qStatus(a, id);
      return '<div class="pbtn ' + (s === 'correct' ? 'right' : s === 'wrong' ? 'wrongq' : 'unatt') + (i === view.i ? ' current' : '') + '" data-action="goto" data-arg="' + i + '">' + (a.qids.indexOf(id) + 1) + '</div>';
    }).join('');
    var filters = chipGroup('rf', [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['correct', 'Correct']], filter, ' data-view="filter"');
    var stTag = st === 'correct' ? '<span class="tag good">You got it right</span>' : st === 'wrong' ? '<span class="tag bad">You got it wrong</span>' : '<span class="tag warn">Skipped</span>';
    var t = a.times && a.times[qid];

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="page-head"><div class="page-title">Review: ' + esc(a.title) + '</div><button data-action="open-result" data-arg="' + a.id + '">&larr; Back to result</button></div>' +
      '<div class="test-layout"><div class="card"><div class="qhead"><div>' + stTag + tagsFor(q) + (t ? '<span class="tag plain">' + t + 's spent</span>' : '') + '</div>' +
      '<div class="qnum">Question <b>' + (a.qids.indexOf(qid) + 1) + '</b></div></div><div class="qtext">' + q.q + '</div>' +
      (isFastRight(qid, mine, a.times) ? shabashBox(qid, (a.times && a.times[qid]) || 0) : '') + reviewOptions(q, mine, shown) + revealBlock(q, shown) +
      '<div class="actions"><button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>&larr; Previous</button>' + starBtn(qid) + '<span class="spacer"></span>' +
      '<button class="primary" data-action="next"' + (view.i === list.length - 1 ? ' disabled' : '') + '>Next &rarr;</button></div></div>' +
      '<div class="side"><div class="card"><div class="field-label first">Show</div>' + filters +
      '<div class="field-label">Questions (' + list.length + ')</div><div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Correct</span><span style="--c:var(--bad)">Wrong</span><span style="--c:var(--warn)">Skipped</span></div>' +
      (a.result.wrong + a.result.skipped > 0 ? '<div style="margin-top:14px"><button class="soft block" data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped</button></div>' : '') + '</div></div></div>';
  }

  function renderStudy() {
    var list = view.studyQids;
    var perQ = A.computeStats().perQ;
    var qid = list[view.i], q = QUESTIONS[qid];
    var shown = !!view.shown[qid];
    var pq = perQ[qid];
    var hist = pq ? '<span class="tag plain">seen ' + pq.seen + 'x &middot; ' + pq.c + ' right &middot; ' + (pq.w + pq.s) + ' missed</span>' : '<span class="tag plain">not attempted yet</span>';
    var palette = list.map(function (id, i) {
      var p = perQ[id];
      var cls = !p ? '' : p.last === 'correct' ? ' right' : p.last === 'wrong' ? ' wrongq' : ' unatt';
      return '<div class="pbtn' + cls + (i === view.i ? ' current' : '') + '" data-action="goto" data-arg="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    topExtra.innerHTML = '';
    app.innerHTML = '<div class="page-head"><div><div class="page-title">Study: ' + esc(view.studyTitle) + '</div><div class="page-sub">Read the question, then open the solution. Nothing here is scored.</div></div>' +
      '<button data-action="' + (view.back || 'home') + '" data-arg="' + (view.backArg || '') + '">&larr; Back</button></div>' +
      '<div class="test-layout"><div class="card"><div class="qhead"><div>' + tagsFor(q, hist) + '</div><div class="qnum">Question <b>' + (view.i + 1) + '</b> of ' + list.length + '</div></div>' +
      '<div class="qtext">' + q.q + '</div>' + reviewOptions(q, -1, shown) + revealBlock(q, shown) +
      '<div class="actions"><button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>&larr; Previous</button>' + starBtn(qid) + '<span class="spacer"></span>' +
      '<button class="primary" data-action="next"' + (view.i === list.length - 1 ? ' disabled' : '') + '>Next &rarr;</button></div></div>' +
      '<div class="side"><div class="card"><div class="field-label first">Questions</div><div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Right</span><span style="--c:var(--bad)">Wrong</span><span style="--c:var(--warn)">Skipped</span><span style="--c:var(--line)">New</span></div></div></div></div>';
  }

  /* ---------- insights ---------- */
  function focusList(st, subject) {
    var rows = Object.keys(st.perCh).map(function (k) { return st.perCh[k]; }).filter(function (c) { return subject === 'All' || c.subject === subject; });
    var seen = rows.filter(function (c) { return c.score !== null && c.score < 0.75; }).sort(function (x, y) { return y.priority - x.priority; });
    var fresh = rows.filter(function (c) { return c.score === null; }).sort(function (x, y) { return y.weight - x.weight; });
    return { seen: seen.slice(0, 5), fresh: fresh.slice(0, 3), all: rows };
  }
  function renderInsights() {
    var st = A.computeStats();
    var sub = view.subject || 'All';
    var f = focusList(st, sub);
    var T = st.totals;
    topExtra.innerHTML = '';
    if (!T.attempts) {
      app.innerHTML = '<div class="page-head"><div class="page-title">My analysis</div></div><div class="card"><div class="empty">Take a test first. This page then shows where you are losing marks and which chapters to work on.<div class="te-note te">మొదటి టెస్ట్ రాయి – అక్కడినుంచే ప్రయాణం మొదలు!</div></div>' +
        '<div style="text-align:center"><button class="primary" data-action="home">Go to tests</button></div></div>' + dataTools();
      return;
    }
    var acc = T.presented ? T.correct / T.presented : 0;
    var avgT = T.timeN ? T.time / T.timeN : 0;
    var skipRate = T.presented ? T.skipped / T.presented : 0, wrongRate = T.presented ? T.wrong / T.presented : 0;
    var tips = [];
    if (wrongRate >= 0.3) tips.push('<div class="tip bad"><b>' + pct(wrongRate) + '% of your answers are wrong.</b> That points to concept gaps, not speed. Open your weakest chapters below and read the concepts before taking more tests.<div class="te-note te">కాన్సెప్ట్ మీద ఫోకస్ పెట్టు – స్పీడ్ తర్వాత దానంతట అదే వస్తుంది.</div></div>');
    if (skipRate >= 0.2) tips.push('<div class="tip warn"><b>You leave ' + pct(skipRate) + '% of questions unanswered.</b> Practise eliminating two options and guessing between the rest' + (settings().negative ? ' (with the marking you set, weigh the penalty first)' : '') + '.<div class="te-note te">తెలిసినంత వరకు ప్రయత్నించు – ఖాళీ వదలొద్దు!</div></div>');
    if (avgT > 90) tips.push('<div class="tip warn"><b>You average ' + Math.round(avgT) + 's per question.</b> The exam gives roughly a minute each. Learn the quick tricks for the chapters marked slow below.</div>');
    if (acc >= 0.75 && wrongRate < 0.2) tips.push('<div class="tip good"><b>Strong overall (' + pct(acc) + '%).</b> Keep the weak chapters moving and revisit your mistake bank.<div class="te-note te">అదరగొడుతున్నావ్! ఇదే జోరు కొనసాగించు.</div></div>');

    var focusHtml = f.seen.length ? f.seen.map(function (c, i) {
      return '<div class="focus-item"><div class="focus-main"><span class="focus-rank">' + (i + 1) + '</span><div><b>' + esc(chapterName(c.id)) + '</b> <span class="tag plain">' + c.subject + '</span>' + statusTag(c.status) +
        '<div class="muted small">Score ' + pct(c.score) + '% &middot; ' + c.w + ' wrong, ' + c.s + ' skipped &middot; ' + c.total + ' questions in past papers (' + (c.weight * 100).toFixed(1) + '% of the bank)</div></div></div>' +
        '<div class="row"><button class="sm soft" data-action="practice-weak" data-arg="' + c.id + '">Practise weak (' + c.weakQ.length + ')</button><button class="sm" data-action="chapter" data-arg="' + c.id + '">What to revise</button></div></div>';
    }).join('') : '<div class="muted">No chapter is below 75% yet. Keep testing different chapters to find your gaps.</div>';
    if (f.fresh.length) {
      focusHtml += '<div class="field-label">Not started yet - biggest first</div><div class="row">' + f.fresh.map(function (c) {
        return '<button class="sm" data-action="chapter" data-arg="' + c.id + '">' + esc(chapterName(c.id)) + ' (' + c.total + ' Q)</button>';
      }).join('') + '</div>';
    }

    var slow = f.all.filter(function (c) { return c.avgTime && avgT && c.avgTime > avgT * 1.4 && c.timeN >= 3; }).sort(function (x, y) { return y.avgTime - x.avgTime; }).slice(0, 4);
    var slowHtml = slow.length ? '<div class="tip warn"><b>Slow chapters:</b> ' + slow.map(function (c) { return esc(chapterName(c.id)) + ' (' + Math.round(c.avgTime) + 's)'; }).join(', ') + '. Practise these against the clock.</div>' : '';

    var rows = f.all.slice().sort(function (x, y) { return y.priority - x.priority; }).map(function (c) {
      return '<tr class="click" data-action="chapter" data-arg="' + c.id + '"><td class="name">' + esc(chapterName(c.id)) + (sub === 'All' ? ' <span class="tag plain">' + c.subject + '</span>' : '') + '</td>' +
        '<td class="num">' + c.total + '</td><td><div class="bar"><i class="p" style="width:' + pct(c.coverage) + '%"></i></div></td>' +
        '<td class="num">' + (c.score === null ? '-' : pct(c.score) + '%') + '</td><td class="num">' + (c.avgTime ? Math.round(c.avgTime) + 's' : '-') + '</td><td>' + statusTag(c.status) + '</td></tr>';
    }).join('');

    app.innerHTML = '<div class="page-head"><div><div class="page-title">My analysis</div><div class="page-sub">Based on all your attempts stored in this browser.</div></div>' +
      chipGroup('ins-sub', [['All', 'All'], ['Maths', 'Maths'], ['Physics', 'Physics']], sub, ' data-view="subject"') + '</div>' +
      '<div class="kpis"><div class="kpi"><b>' + T.attempts + '</b><span>tests taken</span></div><div class="kpi pri"><b>' + st.unique + ' / ' + st.bank + '</b><span>questions practised</span></div>' +
      '<div class="kpi good"><b>' + pct(acc) + '%</b><span>overall accuracy</span></div><div class="kpi bad"><b>' + pct(wrongRate) + '%</b><span>answered wrong</span></div>' +
      '<div class="kpi warn"><b>' + pct(skipRate) + '%</b><span>left unanswered</span></div><div class="kpi"><b>' + (avgT ? Math.round(avgT) + 's' : '-') + '</b><span>avg per question</span></div></div>' +
      tips.join('') + slowHtml +
      '<div class="card"><div class="card-head"><div><div class="section-title">Focus here first</div><div class="muted small">Ranked by how often a chapter appears in the papers, and how badly it is going for you.</div></div>' +
      '<button class="soft" data-action="mistakes">Practise all mistakes (' + A.mistakeIds().length + ')</button></div>' + focusHtml + '</div>' +
      '<div class="card"><div class="section-title" style="margin-bottom:4px">Your trend</div><div class="muted small" style="margin-bottom:6px">Score % in your last ' + Math.min(st.trend.length, 15) + ' tests</div>' + sparkline(st.trend.slice(-15)) + '</div>' +
      '<div class="card flush"><div class="card-head"><div class="section-title">All chapters</div><span class="muted small">Sorted by priority &middot; click a row for details</span></div><div class="table-scroll"><table class="tbl"><thead><tr>' +
      '<th>Chapter</th><th class="num">Questions</th><th>Practised</th><th class="num">Score</th><th class="num">Avg time</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + dataTools();
  }
  function dataTools() {
    return '<div class="card"><div class="card-head" style="margin:0"><div><div class="section-title">Your data</div><div class="muted small">Everything is stored only in this browser. Export a backup to move it to another device.</div></div>' +
      '<div class="row"><button data-action="export">Export backup</button><button data-action="import">Import backup</button><button class="link danger" data-action="reset-all">Erase all data</button>' +
      '<input type="file" id="import-file" accept="application/json" style="display:none"></div></div></div>';
  }

  /* ---------- topic notes ---------- */
  function topicsCard(chId) {
    var list = DATA.topics ? DATA.topics.filter(function (t) { return t.chapter === chId; }) : [];
    if (!list.length) return '';
    var rows = list.map(function (t) {
      var n = DATA.questions.filter(function (q) { return q.topic === t.id; }).length;
      return '<div class="focus-item"><div class="focus-main"><div><b>' + t.title + '</b><div class="muted small">' + n + ' question' + (n === 1 ? '' : 's') + ' in the bank</div></div></div>' +
        '<button class="sm soft" data-action="topic" data-arg="' + t.id + '">Read full notes</button></div>';
    }).join('');
    return '<div class="card"><div class="section-title" style="margin-bottom:2px">Topic notes</div><div class="muted small" style="margin-bottom:10px">Everything each topic is about, in one place.</div>' + rows + '</div>';
  }
  function renderTopic() {
    var t = TOPICS[view.topicId];
    var qs = DATA.questions.filter(function (q) { return q.topic === t.id; });
    var perQ = A.computeStats().perQ;
    var rows = qs.map(function (q, i) {
      var pq = perQ[q.id];
      var dot = !pq ? '' : pq.last === 'correct' ? ' right' : pq.last === 'wrong' ? ' wrongq' : ' unatt';
      var plain = A.stripTags(q.q);
      return '<tr class="click" data-action="study-topic" data-arg="' + i + '"><td><span class="dot' + dot + '"></span>' + esc(plain.slice(0, 100)) + (plain.length > 100 ? '...' : '') + '</td></tr>';
    }).join('');
    view.studyQids = qs.map(function (q) { return q.id; });
    view.chapterId = t.chapter;
    topExtra.innerHTML = '';
    app.innerHTML = '<div class="page-head"><div><div class="page-title">' + t.title + '</div><div class="page-sub"><span class="tag">' + CHAPTERS[t.chapter].subject + '</span><span class="tag plain">' + esc(chapterName(t.chapter)) + '</span></div></div>' +
      '<button data-action="chapter" data-arg="' + t.chapter + '">&larr; Back to chapter</button></div>' +
      '<div class="card"><div class="deep-body" style="padding:0 4px 6px">' + topicBody(t) + '</div></div>' +
      '<div class="card flush"><div class="card-head"><div class="section-title">Questions on this topic</div><span class="muted small">Click to study with solutions</span></div>' +
      '<div class="table-scroll"><table class="tbl"><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------- chapter focus page ---------- */
  function renderChapter() {
    var id = view.chapterId, ch = CHAPTERS[id];
    var st = A.computeStats();
    var c = st.perCh[id];
    var qs = DATA.questions.filter(function (q) { return q.chapter === id; });
    var weak = c.weakQ;
    var unseen = qs.filter(function (q) { return !st.perQ[q.id]; });

    // group the questions you missed by the concept they test
    var groups = {};
    weak.forEach(function (qid) {
      var q = QUESTIONS[qid], pq = st.perQ[qid];
      var key = A.stripTags(q.concept) || qid;
      var g = groups[key] || (groups[key] = { q: q, missed: 0, qids: [] });
      g.missed += pq.w + pq.s;
      g.qids.push(qid);
    });
    var concepts = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (x, y) { return y.missed - x.missed; }).slice(0, 8);
    var conceptHtml = concepts.length ? concepts.map(function (g) {
      return '<div class="concept-card"><div class="hd"><div><span class="tag bad">missed ' + g.missed + 'x</span><span class="tag plain">' + g.qids.length + ' question' + (g.qids.length > 1 ? 's' : '') + '</span></div>' +
        '<button class="sm" data-action="study-list" data-arg="' + g.qids.join(',') + '">Study these</button></div><div>' + g.q.concept + '</div>' +
        (g.q.formula ? '<div class="muted small" style="margin-top:4px"><b>Formula:</b> ' + g.q.formula + '</div>' : '') +
        (g.q.trick ? '<div class="note trick" style="margin-top:6px"><b>Quick trick</b>' + g.q.trick + '</div>' : '') + '</div>';
    }).join('') : (c.presented ? '<div class="tip good">You got your latest attempt of every question you tried in this chapter right. Try the new ones below.</div>'
      : '<div class="tip">No data yet for this chapter. Take the chapter test and this section will list the exact concepts you keep missing.</div>');

    var list = qs.map(function (q, i) {
      var pq = st.perQ[q.id];
      var dot = !pq ? '' : pq.last === 'correct' ? ' right' : pq.last === 'wrong' ? ' wrongq' : ' unatt';
      var plain = A.stripTags(q.q);
      return '<tr class="click" data-action="study-open" data-arg="' + i + '"><td><span class="dot' + dot + '"></span>' + esc(plain.slice(0, 90)) + (plain.length > 90 ? '...' : '') + '</td>' +
        '<td class="num">' + (pq ? pq.seen : 0) + '</td><td class="num">' + (pq ? pq.w + pq.s : 0) + '</td><td class="num">' + (pq && pq.timeN ? Math.round(pq.time / pq.timeN) + 's' : '-') + '</td></tr>';
    }).join('');

    view.studyQids = qs.map(function (q) { return q.id; });
    topExtra.innerHTML = '';
    app.innerHTML = '<div class="page-head"><div><div class="page-title">' + esc(chapterName(id)) + '</div><div class="page-sub"><span class="tag">' + ch.subject + '</span>' + statusTag(c.status) +
      ' ' + c.total + ' questions &middot; ' + (c.weight * 100).toFixed(1) + '% of the bank, so ' + (c.weight > 0.04 ? 'a high-value chapter' : 'a smaller chapter') + '</div></div>' +
      '<button data-action="home">&larr; Back</button></div>' +
      '<div class="kpis"><div class="kpi pri"><b>' + c.seenQ + ' / ' + c.total + '</b><span>questions practised</span></div>' +
      '<div class="kpi good"><b>' + (c.score === null ? '-' : pct(c.score) + '%') + '</b><span>your score</span></div>' +
      '<div class="kpi bad"><b>' + weak.length + '</b><span>to revisit</span></div><div class="kpi"><b>' + unseen.length + '</b><span>not tried yet</span></div>' +
      '<div class="kpi"><b>' + (c.avgTime ? Math.round(c.avgTime) + 's' : '-') + '</b><span>avg per question</span></div></div>' +
      '<div class="card"><div class="row"><button class="primary" data-action="start-chapter" data-arg="' + id + '">Take chapter test</button>' +
      '<button class="soft" data-action="practice-weak" data-arg="' + id + '"' + (weak.length ? '' : ' disabled') + '>Practise weak questions (' + weak.length + ')</button>' +
      '<button class="soft" data-action="practice-new" data-arg="' + id + '"' + (unseen.length ? '' : ' disabled') + '>Try new questions (' + unseen.length + ')</button>' +
      '<button data-action="inf-chapter" data-arg="' + id + '">Infinity practice here</button><button data-action="study-all">Study all solutions</button></div></div>' +
      topicsCard(id) +
      '<div class="card"><div class="section-title" style="margin-bottom:4px">What to focus on in this chapter</div><div class="muted small" style="margin-bottom:10px">Concepts behind the questions you got wrong or skipped, most-missed first.</div>' + conceptHtml + '</div>' +
      '<div class="card flush"><div class="card-head"><div class="section-title">All questions</div><span class="muted small">Green right, red wrong, amber skipped, grey new</span></div>' +
      '<div class="table-scroll"><table class="tbl"><thead><tr><th>Question</th><th class="num">Seen</th><th class="num">Missed</th><th class="num">Avg time</th></tr></thead><tbody>' + list + '</tbody></table></div></div>';
  }

  /* ---------- router ---------- */
  var SCREENS = { topic: renderTopic, home: renderHome, test: renderTest, infinity: renderInfinity, result: renderResult, review: renderReview, study: renderStudy, insights: renderInsights, chapter: renderChapter };

  function renderNav() {
    var hide = view.screen === 'test' || view.screen === 'infinity';
    nav.innerHTML = hide ? '' : [['home', 'Tests'], ['insights', 'My analysis']].map(function (n) {
      var onInsights = view.screen === 'insights' || view.screen === 'chapter' || view.screen === 'topic';
      var active = n[0] === 'insights' ? onInsights : !onInsights;
      return '<button class="' + (active ? 'active' : '') + '" data-action="' + n[0] + '">' + n[1] + '</button>';
    }).join('');
  }
  function render() {
    window.scrollTo(0, 0);
    stopQTimer();
    modalRoot.innerHTML = '';
    if (view.screen !== 'test') { stopTimer(); if (current) clockStop(current.times); }
    if (view.screen !== 'infinity' && inf) clockStop(inf.times);
    if (view.screen !== 'test' && view.screen !== 'infinity') topExtra.innerHTML = '';
    renderNav();
    SCREENS[view.screen]();
    setWatermark(watermarkFor(view.screen));
    if (view.screen === 'test') startTimer();
  }
  function rerenderKeepScroll() {
    var y = window.scrollY;
    SCREENS[view.screen]();
    window.scrollTo(0, y);
  }

  /* ---------- actions ---------- */
  // runs `then` right away, or after the user confirms when a test or infinity session is open
  function guard(then) {
    if (view.screen !== 'test' && view.screen !== 'infinity') { then(); return; }
    askConfirm({ title: 'Leave this screen?', message: 'Your progress is saved. You can resume from the Tests page.', yes: 'Leave', no: 'Stay here' }, then);
  }

  function handleAction(action, arg) {
    var qid, a;
    switch (action) {
      case 'home': guard(function () { go({ screen: 'home' }); }); break;
      case 'insights': guard(function () { go({ screen: 'insights' }); }); break;
      case 'tab': view.tab = arg; render(); break;
      case 'chapter': go({ screen: 'chapter', chapterId: arg }); break;
      case 'topic': go({ screen: 'topic', topicId: arg }); break;
      case 'study-topic':
        go({ screen: 'study', studyQids: view.studyQids, studyTitle: TOPICS[view.topicId] ? TOPICS[view.topicId].title : 'Topic', i: parseInt(arg, 10), back: 'topic', backArg: view.topicId, chapterId: view.chapterId });
        break;
      case 'start-key': startKey(arg); break;
      case 'start-chapter': startChapter(arg, 'all'); break;
      case 'practice-weak': startChapter(arg, 'weak'); break;
      case 'practice-new': startChapter(arg, 'unseen'); break;
      case 'mistakes': startList('mistakes', 'My mistake bank', A.mistakeIds()); break;
      case 'bookmarks': startList('bookmarks', 'Bookmarked questions', Object.keys(A.bookmarks()).filter(function (id) { return QUESTIONS[id]; })); break;
      case 'choose':
        qid = current.qids[view.i];
        if (current.answers[qid] === parseInt(arg, 10)) delete current.answers[qid]; else current.answers[qid] = parseInt(arg, 10);
        rerenderKeepScroll();
        break;
      case 'clear': delete current.answers[current.qids[view.i]]; rerenderKeepScroll(); break;
      case 'mark':
        qid = current.qids[view.i];
        if (current.marked[qid]) delete current.marked[qid]; else current.marked[qid] = true;
        rerenderKeepScroll();
        break;
      case 'next': view.i++; render(); break;
      case 'prev': view.i--; render(); break;
      case 'goto': view.i = parseInt(arg, 10); render(); break;
      case 'submit': confirmSubmit(); break;
      case 'confirm-submit': submitCurrent(false); break;
      case 'cancel-modal': modalRoot.innerHTML = ''; break;
      case 'resume': go({ screen: 'test' }); break;
      case 'discard':
        askConfirm({ title: 'Discard this test?', message: 'The answers you have given so far will be lost.', yes: 'Discard', no: 'Keep it', danger: true }, function () { current = null; A.remove(KEYS.current); render(); });
        break;
      case 'bookmark': A.toggleBookmark(arg); rerenderKeepScroll(); break;
      case 'toggle-solution':
        if (view.shown[arg]) delete view.shown[arg]; else view.shown[arg] = true;
        rerenderKeepScroll();
        break;
      case 'open-result': go({ screen: 'result', attemptId: arg }); break;
      case 'open-review': go({ screen: 'review', attemptId: arg }); break;
      case 'reattempt': a = A.findAttempt(arg); if (a) startReattempt(a, 'missed'); break;
      case 'retake': a = A.findAttempt(arg); if (a) startReattempt(a, 'all'); break;
      case 'study-open':
        go({ screen: 'study', studyQids: view.studyQids, studyTitle: chapterName(view.chapterId), i: parseInt(arg, 10), back: 'chapter', backArg: view.chapterId, chapterId: view.chapterId });
        break;
      case 'study-all':
        go({ screen: 'study', studyQids: view.studyQids, studyTitle: chapterName(view.chapterId), i: 0, back: 'chapter', backArg: view.chapterId, chapterId: view.chapterId });
        break;
      case 'study-list':
        go({ screen: 'study', studyQids: arg.split(','), studyTitle: chapterName(view.chapterId) + ' - concepts you missed', i: 0, back: 'chapter', backArg: view.chapterId, chapterId: view.chapterId });
        break;
      case 'chapters-all':
      case 'chapters-none':
        Array.prototype.forEach.call(document.querySelectorAll('input[name=chapter][data-subject=' + arg + ']'), function (box) { box.checked = action === 'chapters-all'; });
        break;
      case 'inf-start': infStart(); break;
      case 'inf-chapter': infStartChapter(arg); break;
      case 'resume-inf': go({ screen: 'infinity' }); break;
      case 'discard-inf':
        askConfirm({ title: 'End the infinity session?', message: 'Answers so far are saved to your analysis.', yes: 'End session', no: 'Keep going' }, infEnd);
        break;
      case 'inf-choose': qid = inf.qids[inf.i]; inf.answers[qid] = parseInt(arg, 10); rerenderKeepScroll(); break;
      case 'inf-check': infCheck(false); break;
      case 'inf-skip': infCheck(true); break;
      case 'inf-next': inf.i++; view.shown = {}; render(); break;
      case 'inf-end':
        modalRoot.innerHTML = '<div class="modal-back"><div class="modal"><h3>End this session?</h3><div class="muted">' + Object.keys(inf.checked).length +
          ' questions answered. They are saved to your analysis.</div><div class="row" style="margin-top:14px"><button class="primary big" data-action="inf-end-yes">End and see result</button><button class="big" data-action="cancel-modal">Keep going</button></div></div></div>';
        break;
      case 'inf-end-yes': infEnd(); break;
      case 'clear-history':
        askConfirm({ title: 'Clear attempt history?', message: 'All saved attempts will be deleted from this browser.', yes: 'Clear history', no: 'Cancel', danger: true }, function () { A.remove(KEYS.attempts); render(); });
        break;
      case 'export': exportData(); break;
      case 'import': document.getElementById('import-file').click(); break;
      case 'reset-all':
        askConfirm({ title: 'Erase all your data?', message: 'Attempts, bookmarks and settings will be removed from this browser. This cannot be undone.', yes: 'Erase everything', no: 'Cancel', danger: true }, function () {
          Object.keys(KEYS).forEach(function (k) { A.remove(KEYS[k]); });
          current = null; inf = null; go({ screen: 'home' });
        });
        break;
      default: break;
    }
  }

  function exportData() {
    var payload = { app: 'aai-je-mock-tests', exportedAt: Date.now(), attempts: attempts(), bookmarks: A.bookmarks(), settings: settings() };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'aai-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var p = JSON.parse(reader.result);
        if (p.app !== 'aai-je-mock-tests') throw new Error('not a backup');
        var have = {};
        var list = attempts();
        list.forEach(function (x) { have[x.id] = true; });
        var added = 0;
        (p.attempts || []).forEach(function (x) { if (!have[x.id]) { list.push(x); added++; } });
        list.sort(function (x, y) { return x.submittedAt - y.submittedAt; });
        A.saveAttempts(list);
        A.save(KEYS.bookmarks, Object.assign({}, A.bookmarks(), p.bookmarks || {}));
        notify('Imported ' + added + ' new attempt(s).', 'Backup imported');
        render();
      } catch (e) {
        notify('That file is not a valid backup.', 'Import failed');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var d = e.target.closest('[data-dialog]');
    if (d && dialogHandler) {
      var kind = d.getAttribute('data-dialog');
      if (kind === 'backdrop' && e.target !== d) return;          // click inside the card
      var fn = kind === 'yes' ? dialogHandler.onYes : null;
      closeDialog();
      if (fn) fn();
      return;
    }
    var el = e.target.closest('[data-action]');
    if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') handleAction(el.getAttribute('data-action'), el.getAttribute('data-arg'));
  });
  document.getElementById('brand').addEventListener('click', function (e) { e.preventDefault(); handleAction('home'); });

  document.addEventListener('change', function (e) {
    var t = e.target;
    var setting = t.getAttribute && t.getAttribute('data-setting');
    if (setting) {
      var s = settings();
      var v = t.type === 'checkbox' ? t.checked : t.value;
      if (setting === 'perQuestionMinutes' || setting === 'negative') v = parseFloat(v);
      if (setting === 'infChapter') {
        s.infChapter = v || null;
        if (v) s.infSubject = CHAPTERS[v].subject;
      } else {
        s[setting] = v;
      }
      A.save(KEYS.settings, s);
      return;
    }
    var vw = t.getAttribute && t.getAttribute('data-view');
    if (vw) { view[vw] = t.value; view.i = 0; render(); return; }
    if (t.id === 'import-file' && t.files[0]) importData(t.files[0]);
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'mock-form') {
      var subject = f.subject.value, count = parseInt(f.count.value, 10);
      var pool = DATA.questions.filter(function (q) { return subject === 'Mixed' || q.subject === subject; }).map(function (q) { return q.id; });
      var qids;
      if (subject === 'Mixed' && count) {
        var half = Math.ceil(count / 2);
        var m = A.shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Maths'; }));
        var p = A.shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Physics'; }));
        qids = m.slice(0, half).concat(p.slice(0, count - half));
      } else {
        qids = count ? A.shuffled(pool).slice(0, count) : pool;
      }
      startTest({ kind: 'mock', title: subject + ' random mock (' + qids.length + ' Q)', qids: qids });
    } else if (f.id === 'chapter-form') {
      var chosen = Array.prototype.map.call(f.querySelectorAll('input[name=chapter]:checked'), function (c) { return c.value; });
      if (!chosen.length) { notify('Pick at least one chapter.'); return; }
      var ids = DATA.questions.filter(function (q) { return chosen.indexOf(q.chapter) !== -1; }).map(function (q) { return q.id; });
      startTest({ kind: 'chapter', title: (chosen.length === 1 ? chapterName(chosen[0]) : chosen.length + ' chapters') + ' (' + ids.length + ' Q)', qids: ids });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (dialogHandler && modalRoot.querySelector('[data-dialog]')) {
      if (e.key === 'Escape') closeDialog();
      return;                                                    // Enter activates the focused button
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    var letter = /^[a-dA-D]$/.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : /^[1-4]$/.test(e.key) ? parseInt(e.key, 10) - 1 : -1;
    if (view.screen === 'test' && current) {
      if (e.key === 'ArrowRight' && view.i < current.qids.length - 1) handleAction('next');
      else if (e.key === 'ArrowLeft' && view.i > 0) handleAction('prev');
      else if (letter >= 0) handleAction('choose', String(letter));
    } else if (view.screen === 'infinity' && inf) {
      var qid = inf.qids[inf.i];
      if (letter >= 0 && !inf.checked[qid]) handleAction('inf-choose', String(letter));
      else if (e.key === 'Enter') {
        if (inf.checked[qid]) handleAction('inf-next');
        else if (inf.answers[qid] !== undefined) handleAction('inf-check');
      }
    }
  });

  /* ---------- boot ---------- */
  current = A.load(KEYS.current, null);
  inf = A.load(KEYS.infinity, null);
  if (current && current.endsAt && current.endsAt < Date.now()) submitCurrent(true);
  else render();
})();
