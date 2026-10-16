/* 평가위원 화면 공통 스크립트 (EV-00~07 공유). 시안용: 가상 자료만 씁니다.
   EvalShell  : 위 한 줄 틀 (심사임당 · 탭 · 위원 메뉴), 알림(toast), 위원/위원장 상태
   EvalReader : 목차 띠 + 쪽 읽기 (제안요청서·제안서 공용)
   사용:  <header id="hd"></header> ... EvalShell.mount(document.getElementById('hd'), {active:'rfp'});
          EvalReader.mount(el, {title, pages, toc}) */
(function () {
  'use strict';
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ───────── EvalShell ───────── */
  var TABS = [
    { id: 'rfp', label: '제안요청서', href: '../../EV-03-제안요청서-보기/시안/rfp.html' },
    { id: 'proposals', label: '제안서', href: '../../EV-04-제안서-업체별/시안/proposals.html' },
    { id: 'scoring', label: '평가하기', href: '../../EV-06-평가하기/시안/scoring.html' },
    { id: 'chair', label: '평가결과 확인', href: '../../EV-07-평가결과-확인/시안/chair.html', chairOnly: true }
  ];
  var LOGIN_HREF = '../../EV-00-로그인/시안/login.html';

  // ?chair=1 → 위원장 보기를 기억 (?chair=0 으로 해제). ?unlocked=1 → 평가결과 확인 열림 (?unlocked=0 으로 잠금)
  (function readQuery() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('chair')) { q.get('chair') === '1' ? LS.set('ev.chair', '1') : LS.del('ev.chair'); }
      if (q.has('unlocked')) { q.get('unlocked') === '1' ? LS.set('ev.unlocked', '1') : LS.del('ev.unlocked'); }
      if (q.has('reserve')) { q.get('reserve') === '1' ? LS.set('ev.reserve', '1') : LS.del('ev.reserve'); }
    } catch (e) {}
  })();

  var toastEl, toastTimer;
  function toast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'ev-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    // 다시 읽어 주도록 한 번 비웠다가 채움
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2600);
  }

  var shellState = { host: null, opts: null };
  function isChair() { return LS.get('ev.chair') === '1'; }
  function isUnlocked() { return LS.get('ev.unlocked') === '1'; }
  function isReserve() { return LS.get('ev.reserve') === '1'; }

  function renderShell() {
    var host = shellState.host, o = shellState.opts;
    if (!host) return;
    var chair = isChair(), unlocked = isUnlocked();
    var tabs = TABS.filter(function (t) { return !t.chairOnly || chair; }).map(function (t) {
      var cur = o.active === t.id ? ' aria-current="page"' : '';
      if (t.chairOnly && !unlocked) {
        return '<a class="ev-tab is-locked" href="#" data-locked="1" aria-disabled="true" aria-label="' + t.label + ', 잠김. 모든 위원이 제출하면 열려요">' +
          '<span class="ev-lock" aria-hidden="true">🔒</span>' + t.label + '<span class="ev-lock-text" aria-hidden="true">잠김</span></a>';
      }
      return '<a class="ev-tab" href="' + t.href + '"' + cur + '>' + t.label + '</a>';
    }).join('');
    var who = esc(o.user) + ' ' + (chair ? '위원장' : isReserve() ? '예비위원' : '위원');
    host.className = 'ev-hd';
    host.innerHTML =
      '<a class="ev-mark" href="' + TABS[0].href + '" aria-label="심사임당 처음으로"><i aria-hidden="true">심</i>심사임당</a>' +
      '<nav class="ev-tabs" aria-label="평가위원 메뉴">' + tabs + '</nav>' +
      '<div class="ev-user"><button type="button" class="ev-user-btn" aria-haspopup="menu" aria-expanded="false" id="ev-user-btn">' +
      esc(o.project) + ' · <b>' + who + '</b><span aria-hidden="true">▾</span></button>' +
      '<div class="ev-menu" role="menu" hidden><a role="menuitem" href="' + LOGIN_HREF + '">로그아웃</a></div></div>';
  }

  function bindShell() {
    var host = shellState.host;
    host.addEventListener('click', function (e) {
      var lo = e.target.closest('.ev-menu a[href]');
      if (lo) { ['ev.chair', 'ev.unlocked', 'ev.reserve', 'ev.attend'].forEach(function (k) { LS.del(k); }); }  // 로그아웃: 화면 상태 초기화 (서버 세션 폐기는 실제 구현)
      var locked = e.target.closest('[data-locked]');
      if (locked) { e.preventDefault(); toast('모든 위원이 제출하면 열려요'); return; }
      var btn = e.target.closest('.ev-user-btn');
      if (btn) {
        var menu = host.querySelector('.ev-menu'), open = menu.hidden;
        menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
        if (open) { var f = menu.querySelector('a'); if (f) f.focus(); }
      }
    });
    function closeMenu(focus) {
      var menu = host.querySelector('.ev-menu'), btn = host.querySelector('.ev-user-btn');
      if (!menu || menu.hidden) return false;
      menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); return true;
    }
    document.addEventListener('click', function (e) { if (!e.target.closest('.ev-user')) closeMenu(false); });
    host.addEventListener('keydown', function (e) { if (e.key === 'Escape' && closeMenu(true)) { e.stopPropagation(); } });
  }

  var EvalShell = {
    /* 위 한 줄을 el 안에 그린다. opts: {active:'rfp'|'proposals'|'scoring'|'chair'|null, project, user} */
    mount: function (el, opts) {
      shellState.host = el;
      shellState.opts = Object.assign({ active: null, project: '(가상) ○○ 사업', user: '김가상' }, opts || {});
      renderShell(); bindShell();
    },
    refresh: renderShell,
    setChair: function (on) { on ? LS.set('ev.chair', '1') : LS.del('ev.chair'); renderShell(); },
    setUnlocked: function (on) { on ? LS.set('ev.unlocked', '1') : LS.del('ev.unlocked'); renderShell(); },
    setReserve: function (on) { on ? LS.set('ev.reserve', '1') : LS.del('ev.reserve'); renderShell(); },
    isChair: isChair, isUnlocked: isUnlocked, isReserve: isReserve,
    toast: toast, esc: esc, storage: LS,
    tabs: TABS, loginHref: LOGIN_HREF
  };
  window.EvalShell = EvalShell;

  /* ───────── EvalReader ───────── */
  var POOL = [
    '이 사업은 직원이 매일 쓰는 업무 화면을 한곳에 모아 처음 쓰는 사람도 쉽게 찾도록 만드는 것을 목표로 합니다.',
    '제안사는 현재 업무에서 불편한 점을 먼저 조사하고 그 결과를 바탕으로 개선 범위를 정리하여 제출합니다.',
    '모든 화면은 글자를 키워도 깨지지 않아야 하며 키보드만으로도 끝까지 사용할 수 있어야 합니다.',
    '기존 시스템의 자료는 빠짐없이 새 시스템으로 옮기고 옮긴 뒤에는 건수와 내용을 원본과 맞추어 확인합니다.',
    '사업 기간은 계약일로부터 10개월이며 단계가 끝날 때마다 담당자의 확인을 받아야 합니다.',
    '개인정보가 들어 있는 자료는 허가된 사람만 열어 볼 수 있어야 하고 열어 본 기록은 90일간 보관합니다.',
    '제안사는 시범 운영 기간에 직원의 의견을 받아 화면과 사용 순서를 한 차례 고치는 계획을 세워야 합니다.',
    '장애가 생기면 30분 안에 담당자에게 알리고 복구가 끝날 때까지 진행 상황을 한 시간마다 알려야 합니다.',
    '납품 산출물은 쪽 번호가 붙은 문서와 설명 자료로 제출하며 누구나 읽을 수 있는 쉬운 말로 작성합니다.',
    '평가는 제안서의 내용과 발표를 종합하여 진행하며 평가 기준은 별도 쪽에서 확인할 수 있습니다.',
    '사업 완료 뒤 1년간 무상으로 유지·보수를 제공하고 요청이 있으면 이틀 안에 방문하여 조치합니다.',
    '제안사는 투입 인력의 경력과 역할을 표로 정리하고 인력이 바뀔 때에는 사전에 승인을 받아야 합니다.'
  ];
  function rnd(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

  // 가상 쪽 내용 만들기. toc 의 쪽 번호 구간에 맞춰 제목을 붙인다. opts.label 은 쪽 위쪽에 나오는 짧은 이름
  function demoPages(n, toc, opts) {
    opts = opts || {};
    var starts = (toc || []).filter(function (t) { return t.page; }).sort(function (a, b) { return a.page - b.page; });
    var out = [];
    for (var p = 1; p <= n; p++) {
      var sec = null; starts.forEach(function (t) { if (t.page <= p) sec = t; });
      if (p === 1 && opts.cover) {
        out.push({ cover: true, t: opts.cover.title, p: opts.cover.lines });
        continue;
      }
      var first = sec && sec.page === p;
      var title = sec ? sec.t + (first ? '' : ' (이어서)') : '일러두기';
      var paras = [], k = 0, counts = [3, 2, 2], start = Math.floor(rnd(p) * POOL.length);
      counts.forEach(function (c) {
        var arr = [];
        for (var i = 0; i < c; i++) { arr.push(POOL[(start + (k++) * 5) % POOL.length]); }
        paras.push(arr.join(' '));
      });
      out.push({ t: title, p: paras, sec: sec ? sec.t : '' });
    }
    return out;
  }

  function mountReader(el, cfg) {
    var toc = (cfg.toc || []).slice();
    var pages = typeof cfg.pages === 'number' ? demoPages(cfg.pages, toc, cfg.demo) : cfg.pages;
    var TOT = pages.length;
    var st = { p: 1, mode: LS.get('ev.readMode') === 'single' ? 'single' : 'spread', chipK: 0 };
    var title = cfg.title || '';
    var uid = 'evr' + Math.floor(Math.random() * 1e6);

    var ordered = toc.filter(function (t) { return t.page; }).sort(function (a, b) { return a.page - b.page; });
    function secOf(p) { var s = null; ordered.forEach(function (t) { if (t.seen !== false && t.page <= p) s = t; }); return s; }
    function STEP() { return st.mode === 'spread' ? 2 : 1; }
    function norm(p) { p = Math.max(1, Math.min(TOT, p)); if (st.mode === 'spread' && p % 2 === 0) p -= 1; return p; }
    function pct(x) { return (x / TOT * 100).toFixed(2) + '%'; }

    el.classList.add('evr');
    el.innerHTML =
      '<nav class="evr-strip" aria-label="목차 띠"><button type="button" class="evr-strip-label" aria-haspopup="true">목차</button>' +
      '<div class="evr-track" aria-hidden="true"></div><div class="evr-pop" role="region" aria-label="전체 목차"><h3>목 차</h3>' +
      toc.map(function (t, i) {
        var un = t.seen === false || !t.page;
        return '<button type="button" class="evr-toc-item' + (t.lv === 2 ? ' lv2' : '') + (un ? ' is-unseen' : '') + '" data-i="' + i + '"' + (un ? ' aria-disabled="true"' : '') + '>' +
          '<span class="t">' + esc(t.t) + '</span><span class="here" hidden>지금</span><span class="dots"></span>' +
          (un ? '<span class="unseen-tag" title="쪽 연결이 맞지 않아 확인이 필요해요 (NEEDS_REVIEW)">확인 필요</span>' : '<span class="pn">' + t.page + '</span>') + '</button>';
      }).join('') + '</div></nav>' +
      '<div class="evr-main"><div class="evr-top"></div><div class="evr-stage"><div class="evr-bookw"><div class="evr-book"></div>' +
      '<button type="button" class="evr-side l" data-pg="-1" aria-label="앞 쪽"><span aria-hidden="true">‹</span><span class="lb" aria-hidden="true">앞 쪽</span></button>' +
      '<button type="button" class="evr-side r" data-pg="1" aria-label="뒤 쪽"><span aria-hidden="true">›</span><span class="lb" aria-hidden="true">뒤 쪽</span></button>' +
      '</div></div><div class="evr-foot"><span class="note"></span><span class="fr">' +
      '<label class="evr-go"><span>쪽 이동</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="' + Math.min(TOT, 27) + '" aria-label="이동할 쪽 번호 (1부터 ' + TOT + ')"><span>쪽 · Enter</span></label>' +
      '<span class="err" role="alert"></span><span class="evr-keys">옆 버튼이나 ← → 키</span></span></div></div>';

    var $ = function (s) { return el.querySelector(s); };
    var strip = $('.evr-strip'), track = $('.evr-track'), top = $('.evr-top'), book = $('.evr-book'), bookw = $('.evr-bookw');
    var goIn = $('.evr-go input'), goErr = $('.evr-foot .err'), note = $('.evr-foot .note');
    note.textContent = cfg.note || '';
    var items = [].slice.call(el.querySelectorAll('.evr-toc-item'));

    // 쪽 이름표: 목차 띠의 눈금은 한 번만 그린다
    var tr = '<i class="rail"></i><i class="fill"></i>';
    toc.forEach(function (t) { if (t.page) tr += '<i class="tick' + (t.seen === false ? ' unseen' : '') + '" style="top:' + pct(t.page - 1) + '"></i>'; });
    tr += '<i class="cur"></i><span class="now"></span>';
    track.innerHTML = tr;
    var fill = track.querySelector('.fill'), cur = track.querySelector('.cur'), now = track.querySelector('.now');

    function pageHTML(p) {
      if (p > TOT) return '<section class="evr-page is-empty" aria-hidden="true"></section>';
      var d = pages[p - 1];
      var rh = esc(title) + (d.sec ? ' · ' + esc(d.sec) : '');
      var body;
      if (d.cover) body = '<h2>' + esc(d.t) + '</h2>' + d.p.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('');
      else if (d.html) body = '<h2>' + esc(d.t) + '</h2>' + d.html;
      else body = '<h2>' + esc(d.t) + '</h2>' + d.p.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('');
      return '<section class="evr-page' + (d.cover ? ' is-cover' : '') + '" aria-label="' + p + '쪽">' +
        (d.cover ? '' : '<div class="evr-rh">' + rh + '</div>') + '<div class="evr-tx">' + body + '</div><div class="evr-pn">' + p + '</div></section>';
    }
    function topHTML() {
      var last = st.mode === 'spread' ? Math.min(TOT, st.p + 1) : st.p;
      var s = secOf(st.p), loc = last > st.p ? st.p + '–' + last : '' + st.p;
      var acts = (cfg.actions || []).map(function (a, i) { return '<button type="button" class="ev-btn ghost sm" data-act="' + i + '">' + esc(a.label) + '</button>'; }).join('');
      return '<b>' + esc(title) + '</b>' + (s ? '<span class="d">·</span><span>' + esc(s.t) + '</span>' : '') +
        '<span class="d">·</span><span class="mono" aria-live="polite">' + loc + ' / ' + TOT + '쪽</span><span class="sp"></span>' +
        '<span class="evr-seg" role="group" aria-label="보기 방식"><button type="button" data-mode="spread" aria-pressed="' + (st.mode === 'spread') + '">두 쪽</button>' +
        '<button type="button" data-mode="single" aria-pressed="' + (st.mode === 'single') + '">한 쪽</button></span>' + acts;
    }

    function update(anim) {
      st.p = norm(st.p);
      el.classList.toggle('is-single', st.mode === 'single');
      book.innerHTML = st.mode === 'spread' ? pageHTML(st.p) + pageHTML(st.p + 1) : pageHTML(st.p);
      top.innerHTML = topHTML();
      var n = STEP();
      fill.style.height = pct(st.p - 1 + n);
      cur.style.top = pct(st.p - 1); cur.style.height = pct(n);
      now.style.top = pct(st.p - 1 + n / 2); now.textContent = st.p + '쪽';
      var s = secOf(st.p);
      items.forEach(function (b) {
        var t = toc[+b.dataset.i], on = s === t;
        b.classList.toggle('is-current', on);
        b.querySelector('.here').hidden = !on;
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      el.querySelector('.evr-side.l').disabled = st.p <= 1;
      el.querySelector('.evr-side.r').disabled = st.p + STEP() > TOT;
      if (anim) { book.classList.remove('t-fwd', 't-back', 't-jump'); void book.offsetWidth; book.classList.add('t-' + anim); }
      if (cfg.onPage) cfg.onPage(st.p);
    }
    function go(p, o) {
      o = o || {}; var q = norm(p), d = q - st.p; st.p = q; goErr.textContent = '';
      update(d !== 0 ? (o.jump ? 'jump' : d > 0 ? 'fwd' : 'back') : null);
      var old = bookw.querySelector('.evr-chip'); if (old) old.remove();
      if (o.jump && Math.abs(d) > STEP()) {
        var s = secOf(st.p), k = ++st.chipK, chip = document.createElement('div');
        chip.className = 'evr-chip'; chip.setAttribute('role', 'status');
        chip.textContent = (s ? s.t + ' · ' : '') + st.p + '쪽으로 이동';
        bookw.appendChild(chip);
        setTimeout(function () { if (st.chipK === k && chip.parentNode) chip.remove(); }, 2300);
      }
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pg],[data-i],[data-mode],[data-act]');
      if (!t || !el.contains(t)) return;
      if (t.dataset.pg) { go(st.p + (+t.dataset.pg) * STEP()); }
      else if (t.dataset.i != null) {
        var it = toc[+t.dataset.i];
        if (it.seen === false || !it.page) { EvalShell.toast('이 항목은 쪽 번호가 아직 확인되지 않았어요. 담당자가 확인하면 열려요'); return; }
        go(it.page, { jump: true });
        strip.classList.add('hush'); if (document.activeElement && strip.contains(document.activeElement)) document.activeElement.blur();
      }
      else if (t.dataset.mode) {
        st.mode = t.dataset.mode; LS.set('ev.readMode', st.mode); update(null);
        var nb = top.querySelector('[data-mode="' + st.mode + '"]'); if (nb) nb.focus();
      }
      else if (t.dataset.act != null) { var a = cfg.actions[+t.dataset.act]; if (a && a.onClick) a.onClick(t); }
    });
    goIn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var n = parseInt(goIn.value, 10);
      if (!(n >= 1 && n <= TOT)) { goErr.textContent = '1–' + TOT + ' 사이 숫자를 넣어 주세요'; return; }
      go(n, { jump: true });
    });
    goIn.addEventListener('input', function () { goErr.textContent = ''; });
    // 목차 띠를 벗어나면 다시 펼쳐질 수 있게 풀어 준다
    strip.addEventListener('pointerleave', function () { strip.classList.remove('hush'); });
    el.addEventListener('pointerover', function (e) { if (strip.classList.contains('hush') && !e.target.closest('.evr-strip')) strip.classList.remove('hush'); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && strip.matches(':hover, :focus-within')) {
        strip.classList.add('hush'); if (strip.contains(document.activeElement)) document.activeElement.blur(); e.stopPropagation();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.matches && e.target.matches('input,textarea,select')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(st.p + STEP()); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.p - STEP()); }
    });

    go(cfg.startPage || 1);
    return {
      go: function (p) { go(p, { jump: true }); },
      setMode: function (m) { st.mode = m === 'single' ? 'single' : 'spread'; update(null); },
      get page() { return st.p; },
      total: TOT
    };
  }

  window.EvalReader = {
    /* el 안에 읽기 화면을 만든다.
       cfg = {
         title: '(가상) ○○ 사업 제안요청서',            // 위 줄 제목
         pages: 40 | [{t:'제목', p:['문단',...]} | {t, html} | {cover:true, t, p:[...]}],   // 숫자면 가상 쪽을 만든다
         toc:   [{t:'1. 사업 개요', page:3, lv:1|2, seen:false(쪽 미확인이면)}],
         demo:  {cover:{title, lines:[...]}},            // pages 가 숫자일 때만
         actions: [{label:'원본 내려받기', onClick: fn}], // 위 줄 오른쪽 보조 버튼
         note: '왼쪽 아래 작은 안내', startPage: 1, onPage: fn(page)
       }
       반환: {go(p), setMode('spread'|'single'), page, total} */
    mount: mountReader,
    demoPages: demoPages
  };
})();
