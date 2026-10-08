/* AAI JE mock-test app. Plain JS, no build step, state kept in localStorage. */
(function () {
  'use strict';

  var DATA = window.AAI_DATA;
  var QUESTIONS = {};
  DATA.questions.forEach(function (q) { QUESTIONS[q.id] = q; });
  var CHAPTERS = {};
  DATA.chapters.forEach(function (c) { CHAPTERS[c.id] = c; });

  var KEY_ATTEMPTS = 'aai.attempts.v1';
  var KEY_CURRENT = 'aai.current.v1';
  var KEY_SETTINGS = 'aai.settings.v1';
  var LETTERS = ['A', 'B', 'C', 'D'];

  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');
  var topExtra = document.getElementById('topbar-extra');

  var timerHandle = null;
  var view = { screen: 'home', i: 0, reviewFilter: 'all', attemptId: null };
  var current = null; // in-progress attempt

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
  function attempts() { return load(KEY_ATTEMPTS, []); }
  function saveAttempts(list) { save(KEY_ATTEMPTS, list.slice(-100)); }
  function settings() {
    return Object.assign({ subject: 'Maths', count: 30, perQuestionMinutes: 1, negative: 0, shuffle: true }, load(KEY_SETTINGS, {}));
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
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
  function findAttempt(id) {
    return attempts().filter(function (a) { return a.id === id; })[0];
  }

  /* ---------- starting a test ---------- */
  function startTest(opts) {
    var qids = opts.qids;
    if (!qids.length) { alert('No questions match that selection.'); return; }
    if (opts.shuffle) qids = shuffled(qids);
    var minutes = opts.minutes || 0;
    current = {
      id: 'a' + Date.now(),
      title: opts.title,
      startedAt: Date.now(),
      endsAt: minutes ? Date.now() + minutes * 60000 : 0,
      config: {
        kind: opts.kind, minutes: minutes, negative: opts.negative || 0,
        reattemptOf: opts.reattemptOf || null
      },
      qids: qids,
      answers: {},
      marked: {},
      visited: {}
    };
    save(KEY_CURRENT, current);
    view = { screen: 'test', i: 0, reviewFilter: 'all', attemptId: null };
    render();
  }

  function startMock(form) {
    var subject = form.subject;
    var count = form.count;
    var pool = DATA.questions.filter(function (q) { return subject === 'Mixed' || q.subject === subject; }).map(function (q) { return q.id; });
    var qids;
    if (subject === 'Mixed') {
      var half = count ? Math.ceil(count / 2) : 0;
      var m = shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Maths'; }));
      var p = shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Physics'; }));
      qids = count ? m.slice(0, half).concat(p.slice(0, count - half)) : pool;
    } else {
      qids = count ? shuffled(pool).slice(0, count) : pool;
    }
    startTest({
      kind: 'mock', title: subject + ' mock (' + qids.length + ' Q)', qids: qids,
      minutes: form.perQuestionMinutes ? Math.ceil(qids.length * form.perQuestionMinutes) : 0,
      negative: form.negative, shuffle: true
    });
  }

  function startChapters(form) {
    var chosen = form.chapters;
    var qids = DATA.questions.filter(function (q) { return chosen.indexOf(q.chapter) !== -1; }).map(function (q) { return q.id; });
    var title = chosen.length === 1 ? CHAPTERS[chosen[0]].title : chosen.length + ' chapters practice';
    startTest({
      kind: 'chapter', title: title + ' (' + qids.length + ' Q)', qids: qids,
      minutes: form.perQuestionMinutes ? Math.ceil(qids.length * form.perQuestionMinutes) : 0,
      negative: form.negative, shuffle: form.shuffle
    });
  }

  function startReattempt(attempt, mode) {
    var qids = attempt.qids.filter(function (qid) {
      return mode === 'all' || qStatus(attempt, qid) !== 'correct';
    });
    var perQ = attempt.config.minutes ? attempt.config.minutes / attempt.qids.length : 0;
    startTest({
      kind: 'reattempt',
      title: (mode === 'all' ? 'Retake: ' : 'Re-attempt: ') + attempt.title,
      qids: qids, minutes: perQ ? Math.ceil(qids.length * perQ) : 0,
      negative: attempt.config.negative, shuffle: false,
      reattemptOf: attempt.id
    });
  }

  function startMistakeBank() {
    var ids = mistakeIds();
    var s = settings();
    startTest({
      kind: 'mistakes', title: 'My mistake bank (' + ids.length + ' Q)', qids: ids,
      minutes: s.perQuestionMinutes ? Math.ceil(ids.length * s.perQuestionMinutes) : 0,
      negative: s.negative, shuffle: true
    });
  }

  /* ---------- submit ---------- */
  function submitCurrent(auto) {
    if (!current) return;
    stopTimer();
    var finished = current;
    finished.submittedAt = Date.now();
    finished.timeSpent = Math.round((finished.submittedAt - finished.startedAt) / 1000);
    finished.autoSubmitted = !!auto;
    finished.result = scoreOf(finished);
    var list = attempts();
    list.push(finished);
    saveAttempts(list);
    localStorage.removeItem(KEY_CURRENT);
    current = null;
    modalRoot.innerHTML = '';
    view = { screen: 'result', i: 0, reviewFilter: 'all', attemptId: finished.id };
    render();
  }

  /* ---------- timer ---------- */
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }
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
    }
    if (left <= 0) submitCurrent(true);
  }

  /* ---------- rendering: home ---------- */
  function chipGroup(name, items, selected) {
    return '<div class="chips">' + items.map(function (it) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + it[0] + '"' +
        (String(it[0]) === String(selected) ? ' checked' : '') + '><span>' + it[1] + '</span></label>';
    }).join('') + '</div>';
  }

  function renderHome() {
    var s = settings();
    var mistakes = mistakeIds().length;
    var hist = attempts().slice().reverse();
    var maths = DATA.chapters.filter(function (c) { return c.subject === 'Maths'; }).reduce(function (n, c) { return n + c.count; }, 0);
    var physics = DATA.questions.length - maths;

    var chapterHtml = ['Maths', 'Physics'].map(function (sub) {
      var chips = DATA.chapters.filter(function (c) { return c.subject === sub; }).map(function (c) {
        return '<label class="chip"><input type="checkbox" name="chapter" data-subject="' + sub + '" value="' + c.id + '"><span>' +
          esc(c.title.replace(/^\d+\.\s*/, '')) + '<small>' + c.count + '</small></span></label>';
      }).join('');
      return '<div class="chapter-group"><div class="chapter-head"><b>' + sub + '</b><span>' +
        '<button type="button" class="link" data-action="chapters-all" data-arg="' + sub + '">Select all</button>' +
        '<button type="button" class="link" data-action="chapters-none" data-arg="' + sub + '">Clear</button></span></div>' +
        '<div class="chips">' + chips + '</div></div>';
    }).join('');

    var histHtml = hist.length ? hist.slice(0, 6).map(function (a) {
      var r = a.result;
      var kindTag = a.config.kind === 'reattempt' ? '<span class="tag warn">Re-attempt</span>' : '';
      return '<div class="history-item"><div><div>' + kindTag + '<b>' + esc(a.title) + '</b></div>' +
        '<div class="muted small"><span class="score-badge" style="color:var(--primary)">' + r.score + '/' + r.max + '</span>' +
        fmtDate(a.submittedAt) + ' &middot; ' + r.correct + ' right &middot; ' + r.wrong + ' wrong &middot; ' + r.skipped + ' skipped</div></div>' +
        '<div class="row">' +
        '<button data-action="open-result" data-arg="' + a.id + '">Result</button>' +
        '<button data-action="open-review" data-arg="' + a.id + '">Solutions</button>' +
        (r.wrong + r.skipped > 0 ? '<button class="soft" data-action="reattempt" data-arg="' + a.id + '">Re-attempt</button>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty">No attempts yet. Take a mock test and your results will show up here.</div>';

    var resume = '';
    if (current) {
      resume = '<div class="card" style="border-color:var(--warn)"><div class="row spread"><div><b>Test in progress</b><div>' +
        esc(current.title) + '</div><div class="muted small">Answered ' + Object.keys(current.answers).length + ' of ' + current.qids.length + '</div></div>' +
        '<div class="row"><button class="primary" data-action="resume">Resume</button>' +
        '<button data-action="discard">Discard</button></div></div></div>';
    }

    app.innerHTML = resume +
      '<div class="hero"><h1>AAI JE Airport Operations<br>Maths &amp; Physics mock tests</h1>' +
      '<p>Real past-paper questions. Tick your answers, submit, then open the solutions one by one. Re-attempt whatever you missed.</p>' +
      '<div class="hero-stats"><div class="hero-stat"><b>' + DATA.questions.length + '</b><span>questions</span></div>' +
      '<div class="hero-stat"><b>' + maths + ' / ' + physics + '</b><span>maths / physics</span></div>' +
      '<div class="hero-stat"><b>' + DATA.chapters.length + '</b><span>chapters</span></div></div></div>' +
      '<div class="grid-2">' +
      '<div class="card"><h3>Full mock test</h3><form id="mock-form">' +
      '<div class="field-label">Subject</div>' + chipGroup('subject', [['Maths', 'Maths'], ['Physics', 'Physics'], ['Mixed', 'Mixed']], s.subject) +
      '<div class="field-label">Questions</div>' + chipGroup('count', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [0, 'All']], s.count) +
      '<div class="field-label">Timer</div>' + chipGroup('time', [[0, 'Off'], [0.5, '30 s / Q'], [1, '1 min / Q'], [2, '2 min / Q']], s.perQuestionMinutes) +
      '<div class="field-label">Negative marking</div>' + chipGroup('neg', [[0, 'None'], [0.25, '-0.25'], [0.33, '-0.33'], [1, '-1']], s.negative) +
      '<div style="margin-top:22px"><button class="primary big block" type="submit">Start mock test</button></div></form></div>' +
      '<div><div class="card"><div class="row spread"><div><h3 style="margin-bottom:4px">Mistake bank</h3>' +
      '<div class="muted small">Latest result wrong or skipped: <b style="color:var(--text)">' + mistakes + '</b> questions</div></div>' +
      '<button class="primary" data-action="mistakes"' + (mistakes ? '' : ' disabled') + '>Practice my mistakes</button></div></div>' +
      '<div class="card"><div class="row spread" style="margin-bottom:14px"><h3 style="margin:0">Attempt history</h3>' +
      (hist.length ? '<button class="link danger" data-action="clear-history">Clear</button>' : '') + '</div>' + histHtml + '</div></div></div>' +
      '<div class="card"><h3>Chapter-wise practice</h3><form id="chapter-form"><div class="chapter-cols">' + chapterHtml + '</div>' +
      '<div class="row spread" style="margin-top:20px"><label class="check" style="margin:0"><input type="checkbox" name="shuffle"' + (s.shuffle ? ' checked' : '') + '> Shuffle questions' +
      '<span class="muted small">&nbsp;&middot; timer and negative marking follow the mock-test settings</span></label>' +
      '<button class="primary big" type="submit">Start practice</button></div></form></div>';
  }

  /* ---------- rendering: test ---------- */
  function paletteClass(qid, i) {
    var cls = 'pbtn';
    var answered = current.answers[qid] !== undefined;
    if (current.marked[qid]) cls += ' marked';
    else if (answered) cls += ' answered';
    else if (current.visited[qid]) cls += ' skipped';
    if (i === view.i) cls += ' current';
    return cls;
  }

  function renderTest() {
    var qid = current.qids[view.i];
    var q = QUESTIONS[qid];
    current.visited[qid] = true;
    var chosen = current.answers[qid];
    var opts = q.options.map(function (o, idx) {
      return '<div class="option' + (chosen === idx ? ' selected' : '') + '" data-action="choose" data-arg="' + idx + '">' +
        '<span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span></div>';
    }).join('');
    var palette = current.qids.map(function (id, i) {
      return '<div class="' + paletteClass(id, i) + '" data-action="goto" data-arg="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    var answeredCount = Object.keys(current.answers).length;
    var total = current.qids.length;
    var isLast = view.i === total - 1;

    topExtra.innerHTML = current.endsAt ? '<span class="timer-pill" id="timer"></span>' : '<span class="muted small">No timer</span>';

    app.innerHTML = '<div class="progress"><i style="width:' + Math.round(answeredCount * 100 / total) + '%"></i></div>' +
      '<div class="test-layout"><div class="card">' +
      '<div class="qhead"><div><span class="tag">' + q.subject + '</span><span class="tag plain">' + esc(CHAPTERS[q.chapter].title.replace(/^\d+\.\s*/, '')) + '</span></div>' +
      '<div class="qnum">Question <b>' + (view.i + 1) + '</b> of ' + total + '</div></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts +
      '<div class="actions">' +
      '<button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>&larr; Previous</button>' +
      '<button data-action="mark">' + (current.marked[qid] ? 'Unmark review' : 'Mark for review') + '</button>' +
      '<button data-action="clear"' + (chosen === undefined ? ' disabled' : '') + '>Clear</button>' +
      '<span class="spacer"></span>' +
      '<button class="primary" data-action="next"' + (isLast ? ' disabled' : '') + '>Save &amp; next &rarr;</button></div></div>' +
      '<div class="side"><div class="card"><h3>' + esc(current.title) + '</h3>' +
      '<div class="muted small" style="margin:-8px 0 14px">Answered ' + answeredCount + ' of ' + total + '</div>' +
      '<div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Answered</span><span style="--c:var(--bad)">Not answered</span>' +
      '<span style="--c:var(--mark)">Marked</span><span style="--c:var(--line)">Not visited</span></div>' +
      '<div style="margin-top:18px"><button class="primary big block" data-action="submit">Submit test</button></div></div></div></div>';
    save(KEY_CURRENT, current);
    if (current.endsAt) tick();
  }

  function confirmSubmit() {
    var total = current.qids.length;
    var answered = Object.keys(current.answers).length;
    var marked = Object.keys(current.marked).filter(function (k) { return current.marked[k]; }).length;
    modalRoot.innerHTML = '<div class="modal-back"><div class="modal"><h3>Submit your test?</h3>' +
      '<div class="muted">You will not be able to change your answers after this.</div>' +
      '<div class="modal-stats"><div class="stat good"><b>' + answered + '</b>Answered</div>' +
      '<div class="stat bad"><b>' + (total - answered) + '</b>Not answered</div>' +
      '<div class="stat"><b>' + marked + '</b>Marked</div></div>' +
      '<div class="row"><button class="primary big" data-action="confirm-submit">Yes, submit</button>' +
      '<button class="big" data-action="cancel-modal">Keep working</button></div></div></div>';
  }

  /* ---------- rendering: result ---------- */
  function renderResult() {
    var a = findAttempt(view.attemptId);
    if (!a) { view.screen = 'home'; render(); return; }
    var r = a.result;
    var accuracy = r.correct + r.wrong ? Math.round(r.correct * 100 / (r.correct + r.wrong)) : 0;
    var pc = r.max ? r.correct * 100 / r.max : 0;
    var pw = r.max ? r.wrong * 100 / r.max : 0;

    var byChapter = {};
    a.qids.forEach(function (qid) {
      var ch = QUESTIONS[qid].chapter;
      var row = byChapter[ch] || (byChapter[ch] = { c: 0, w: 0, s: 0 });
      var st = qStatus(a, qid);
      if (st === 'correct') row.c++; else if (st === 'wrong') row.w++; else row.s++;
    });
    var rows = Object.keys(byChapter).map(function (ch) {
      var row = byChapter[ch];
      var t = row.c + row.w + row.s;
      return '<tr><td>' + esc(CHAPTERS[ch].title.replace(/^\d+\.\s*/, '')) + '</td>' +
        '<td><div class="bar"><i class="g" style="width:' + row.c * 100 / t + '%"></i><i class="r" style="width:' + row.w * 100 / t + '%"></i><i class="y" style="width:' + row.s * 100 / t + '%"></i></div></td>' +
        '<td class="num">' + row.c + '/' + t + '</td></tr>';
    }).join('');

    var compare = '';
    if (a.config.reattemptOf) {
      var fixed = a.qids.filter(function (qid) { return qStatus(a, qid) === 'correct'; }).length;
      compare = '<p><span class="tag good">Re-attempt</span> You fixed <b>' + fixed + '</b> of the ' + a.qids.length + ' questions you missed last time.</p>';
    }
    var timeNote = a.autoSubmitted ? ' (auto-submitted when the timer ended)' : '';

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="card"><div class="result-top">' +
      '<div class="donut" style="--a:' + pc + '%;--b:' + (pc + pw) + '%"><div><b>' + r.score + '</b><span>out of ' + r.max + '</span></div></div>' +
      '<div><h2 style="font-size:22px">' + esc(a.title) + '</h2>' +
      '<div class="muted small" style="margin:4px 0 8px">' + fmtDate(a.submittedAt) + ' &middot; time taken ' + fmtTime(a.timeSpent) + timeNote + '</div>' + compare +
      '<div class="score-grid"><div class="stat good"><b>' + r.correct + '</b>Correct</div>' +
      '<div class="stat bad"><b>' + r.wrong + '</b>Wrong</div>' +
      '<div class="stat warn"><b>' + r.skipped + '</b>Skipped</div>' +
      '<div class="stat"><b>' + accuracy + '%</b>Accuracy</div></div></div></div>' +
      '<div class="row" style="margin-top:20px">' +
      '<button class="primary big" data-action="open-review" data-arg="' + a.id + '">Review &amp; solutions</button>' +
      (r.wrong + r.skipped > 0 ? '<button class="big soft" data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped (' + (r.wrong + r.skipped) + ')</button>' : '') +
      '<button class="big" data-action="retake" data-arg="' + a.id + '">Retake whole test</button>' +
      '<button class="big" data-action="home">Home</button></div></div>' +
      '<div class="card"><h3>Chapter-wise</h3><table class="tbl"><thead><tr><th>Chapter</th><th></th><th class="num">Correct</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  /* ---------- rendering: review / solutions ---------- */
  function solutionHtml(q) {
    var parts = ['<div class="solution">'];
    if (q.given) parts.push('<div class="sol-block"><h4>Given</h4><div>' + q.given + '</div></div>');
    if (q.concept) parts.push('<div class="sol-block"><h4>Concept</h4><div>' + q.concept + '</div></div>');
    if (q.formula) parts.push('<div class="sol-block"><h4>Formula used</h4><div>' + q.formula + '</div></div>');
    if (q.steps.length) {
      parts.push('<div class="sol-block"><h4>Calculation</h4><ol class="sol-steps">' +
        q.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>');
    }
    parts.push('<div class="hence">Hence, option ' + LETTERS[q.correct] + ' is correct.</div>');
    if (q.info) parts.push('<div class="note info"><b>Good to know</b>' + q.info + '</div>');
    if (q.trick) parts.push('<div class="note trick"><b>Quick trick</b>' + q.trick + '</div>');
    parts.push('</div>');
    return parts.join('');
  }

  function renderReview() {
    var a = findAttempt(view.attemptId);
    if (!a) { view.screen = 'home'; render(); return; }
    var filter = view.reviewFilter;
    var list = a.qids.filter(function (qid) {
      return filter === 'all' || qStatus(a, qid) === filter;
    });
    if (!list.length) { list = a.qids; filter = 'all'; view.reviewFilter = 'all'; }
    if (view.i >= list.length) view.i = 0;
    var qid = list[view.i];
    var q = QUESTIONS[qid];
    var st = qStatus(a, qid);
    var mine = a.answers[qid];
    var shown = !!(view.shown && view.shown[qid]);

    // the correct option stays hidden until the user asks for the solution
    var opts = q.options.map(function (o, idx) {
      var cls = 'option static';
      var note = '';
      if (shown && idx === q.correct) {
        cls += ' correct';
        note = idx === mine ? '<span class="tag good">Correct &middot; your answer</span>' : '<span class="tag good">Correct answer</span>';
      } else if (idx === mine) {
        if (shown) { cls += ' wrong'; note = '<span class="tag bad">Your answer</span>'; }
        else { cls += ' yours'; note = '<span class="tag">Your answer</span>'; }
      }
      return '<div class="' + cls + '"><span class="box">' + LETTERS[idx] + '</span><span class="label">' + o + '</span>' + note + '</div>';
    }).join('');

    var palette = list.map(function (id, i) {
      var s = qStatus(a, id);
      var cls = 'pbtn ' + (s === 'correct' ? 'right' : s === 'wrong' ? 'wrongq' : 'unatt') + (i === view.i ? ' current' : '');
      return '<div class="' + cls + '" data-action="goto" data-arg="' + i + '">' + (a.qids.indexOf(id) + 1) + '</div>';
    }).join('');

    var filters = [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['correct', 'Correct']].map(function (f) {
      return '<label class="chip"><input type="radio" name="rf" value="' + f[0] + '"' + (f[0] === filter ? ' checked' : '') +
        ' data-action="filter" data-arg="' + f[0] + '"><span>' + f[1] + '</span></label>';
    }).join('');
    var stTag = st === 'correct' ? '<span class="tag good">You got it right</span>' : st === 'wrong' ? '<span class="tag bad">You got it wrong</span>' : '<span class="tag warn">Skipped</span>';

    var body = shown
      ? solutionHtml(q) + '<div style="margin-top:14px"><button class="link" data-action="toggle-solution" data-arg="' + qid + '">Hide solution</button></div>'
      : '<div class="reveal"><div class="muted" style="margin-bottom:10px">Try it again in your head first, then check.</div>' +
        '<button class="primary big" data-action="toggle-solution" data-arg="' + qid + '">Show solution</button></div>';

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="row spread" style="margin-bottom:16px"><div><h2 style="font-size:20px">Review: ' + esc(a.title) + '</h2></div>' +
      '<button data-action="open-result" data-arg="' + a.id + '">&larr; Back to result</button></div>' +
      '<div class="test-layout"><div class="card">' +
      '<div class="qhead"><div>' + stTag + '<span class="tag">' + q.subject + '</span><span class="tag plain">' + esc(CHAPTERS[q.chapter].title.replace(/^\d+\.\s*/, '')) + '</span>' +
      (q.source ? '<span class="tag plain">' + esc(q.source) + '</span>' : '') + '</div>' +
      '<div class="qnum">Question <b>' + (a.qids.indexOf(qid) + 1) + '</b></div></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts + body +
      '<div class="actions"><button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>&larr; Previous</button><span class="spacer"></span>' +
      '<button class="primary" data-action="next"' + (view.i === list.length - 1 ? ' disabled' : '') + '>Next &rarr;</button></div></div>' +
      '<div class="side"><div class="card"><h3>Show</h3><div class="chips">' + filters + '</div>' +
      '<div class="field-label" style="margin-top:20px">Questions (' + list.length + ')</div><div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Correct</span><span style="--c:var(--bad)">Wrong</span><span style="--c:var(--warn)">Skipped</span></div>' +
      (a.result.wrong + a.result.skipped > 0
        ? '<div style="margin-top:18px"><button class="soft block" data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped</button></div>' : '') +
      '</div></div></div>';
  }

  /* ---------- main render ---------- */
  function render() {
    window.scrollTo(0, 0);
    if (view.screen !== 'test') stopTimer();
    if (view.screen === 'home') { topExtra.innerHTML = ''; renderHome(); }
    else if (view.screen === 'test') { renderTest(); startTimer(); }
    else if (view.screen === 'result') renderResult();
    else if (view.screen === 'review') renderReview();
  }
  function rerenderKeepScroll() {
    var y = window.scrollY;
    if (view.screen === 'test') renderTest();
    else render();
    window.scrollTo(0, y);
  }

  /* ---------- events ---------- */
  function readSettingsFromForm() {
    var f = document.getElementById('mock-form');
    if (!f) return settings();
    var s = {
      subject: f.subject.value,
      count: parseInt(f.count.value, 10),
      perQuestionMinutes: parseFloat(f.time.value),
      negative: parseFloat(f.neg.value),
      shuffle: settings().shuffle
    };
    var cf = document.getElementById('chapter-form');
    if (cf) s.shuffle = cf.shuffle.checked;
    save(KEY_SETTINGS, s);
    return s;
  }

  function handleAction(action, arg) {
    var a;
    switch (action) {
      case 'choose':
        var qid = current.qids[view.i];
        var idx = parseInt(arg, 10);
        if (current.answers[qid] === idx) delete current.answers[qid];
        else current.answers[qid] = idx;
        rerenderKeepScroll();
        break;
      case 'clear':
        delete current.answers[current.qids[view.i]];
        rerenderKeepScroll();
        break;
      case 'mark':
        var mid = current.qids[view.i];
        if (current.marked[mid]) delete current.marked[mid]; else current.marked[mid] = true;
        rerenderKeepScroll();
        break;
      case 'next':
        view.i++;
        render();
        break;
      case 'prev':
        view.i--;
        render();
        break;
      case 'goto':
        view.i = parseInt(arg, 10);
        render();
        break;
      case 'submit': confirmSubmit(); break;
      case 'confirm-submit': submitCurrent(false); break;
      case 'cancel-modal': modalRoot.innerHTML = ''; break;
      case 'resume':
        view = { screen: 'test', i: 0, reviewFilter: 'all', attemptId: null };
        render();
        break;
      case 'discard':
        if (confirm('Discard the test in progress?')) {
          current = null;
          localStorage.removeItem(KEY_CURRENT);
          render();
        }
        break;
      case 'open-result':
        view = { screen: 'result', i: 0, reviewFilter: 'all', attemptId: arg };
        render();
        break;
      case 'open-review':
        view = { screen: 'review', i: 0, reviewFilter: 'all', attemptId: arg, shown: {} };
        render();
        break;
      case 'toggle-solution':
        view.shown = view.shown || {};
        if (view.shown[arg]) delete view.shown[arg]; else view.shown[arg] = true;
        rerenderKeepScroll();
        break;
      case 'chapters-all':
      case 'chapters-none':
        Array.prototype.forEach.call(document.querySelectorAll('input[name=chapter][data-subject=' + arg + ']'), function (box) {
          box.checked = action === 'chapters-all';
        });
        break;
      case 'filter':
        view.reviewFilter = arg;
        view.i = 0;
        render();
        break;
      case 'reattempt':
        a = findAttempt(arg);
        if (a) startReattempt(a, 'missed');
        break;
      case 'retake':
        a = findAttempt(arg);
        if (a) startReattempt(a, 'all');
        break;
      case 'mistakes': startMistakeBank(); break;
      case 'clear-history':
        if (confirm('Delete all attempt history from this browser?')) {
          localStorage.removeItem(KEY_ATTEMPTS);
          render();
        }
        break;
      case 'home':
        view = { screen: 'home', i: 0, reviewFilter: 'all', attemptId: null };
        render();
        break;
      default: break;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el) handleAction(el.getAttribute('data-action'), el.getAttribute('data-arg'));
  });

  document.getElementById('brand').addEventListener('click', function (e) {
    e.preventDefault();
    if (view.screen === 'test' && !confirm('Leave the test? Your progress is saved and you can resume from Home.')) return;
    handleAction('home');
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'mock-form') {
      var s = readSettingsFromForm();
      startMock(s);
    } else if (e.target.id === 'chapter-form') {
      var st = readSettingsFromForm();
      var chosen = Array.prototype.map.call(e.target.querySelectorAll('input[name=chapter]:checked'), function (c) { return c.value; });
      if (!chosen.length) { alert('Pick at least one chapter.'); return; }
      st.chapters = chosen;
      startChapters(st);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (view.screen !== 'test' || !current) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight' && view.i < current.qids.length - 1) handleAction('next');
    else if (e.key === 'ArrowLeft' && view.i > 0) handleAction('prev');
    else if (/^[1-4]$/.test(e.key) || /^[a-dA-D]$/.test(e.key)) {
      var n = /^[1-4]$/.test(e.key) ? parseInt(e.key, 10) - 1 : e.key.toLowerCase().charCodeAt(0) - 97;
      handleAction('choose', String(n));
    }
  });

  /* ---------- boot ---------- */
  current = load(KEY_CURRENT, null);
  if (current && current.endsAt && current.endsAt < Date.now()) {
    submitCurrent(true); // time ran out while the tab was closed
  } else {
    render();
  }
})();
