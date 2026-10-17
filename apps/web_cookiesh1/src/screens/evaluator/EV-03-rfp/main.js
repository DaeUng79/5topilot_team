// EV-03 · DOC-06 · DOC-02
// 제안요청서 읽기: 목차 띠 · 두 쪽/한 쪽 · 쪽 넘김/쪽 이동 · 원본 내려받기. 자료는 API(/rfp-api)로만 받는다.
const API = '/rfp-api';
const READ_MODE_KEY = 'ev.readMode';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 읽기는 가능 */ } },
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || '자료를 불러오지 못했어요');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* ───────── 알림 ───────── */
let toastEl, toastTimer;
function toast(msg, ms = 2600) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ev-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  void toastEl.offsetWidth;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
}

/* ───────── 위 한 줄 ───────── */
const TABS = [
  { id: 'rfp', label: '제안요청서', href: '../EV-03-rfp/' },
  { id: 'proposals', label: '제안서', href: '../EV-04-proposals/' },
  { id: 'scoring', label: '평가하기', href: '../EV-06-scoring/' },
];

function renderHeader(projectName, projects, currentId) {
  const host = document.getElementById('hd');
  const tabs = TABS.map((t) => `<a class="ev-tab" href="${t.href}"${t.id === 'rfp' ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
  const others = projects.length > 1
    ? '<span class="ev-menu-h">사업 바꾸기</span>' + projects.map((p) =>
      `<a role="menuitem" href="?project=${encodeURIComponent(p.project_id)}"${p.project_id === currentId ? ' aria-current="true"' : ''}>${esc(p.name)}</a>`).join('')
    : '';
  host.innerHTML =
    '<a class="ev-mark" href="./" aria-label="심사임당 처음으로"><i aria-hidden="true">심</i>심사임당</a>' +
    `<nav class="ev-tabs" aria-label="평가위원 메뉴">${tabs}</nav>` +
    '<div class="ev-user"><button type="button" class="ev-user-btn" aria-haspopup="menu" aria-expanded="false">' +
    `${esc(projectName)} · <b>위원</b><span aria-hidden="true">▾</span></button>` +
    `<div class="ev-menu" role="menu" hidden>${others || '<span class="ev-menu-h">선택할 다른 사업이 없어요</span>'}</div></div>`;
  const btn = host.querySelector('.ev-user-btn');
  const menu = host.querySelector('.ev-menu');
  const close = (focus) => {
    if (menu.hidden) return false;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focus) btn.focus();
    return true;
  };
  btn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('a')?.focus();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.ev-user')) close(false); });
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape' && close(true)) e.stopPropagation(); });
}

/* ───────── 쪽 내용 ───────── */
function paragraphClass(text) {
  const t = text.trim();
  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s/.test(t)) return 'h1';
  if (/^(\d+\.|[가-힣]\.)\s/.test(t) && t.length <= 40) return 'h2';
  if (/^□/.test(t)) return 'b1';
  if (/^[○◦ㅇ]/.test(t)) return 'b2';
  if (/^-/.test(t)) return 'b3';
  if (/^[※*]/.test(t)) return 'note';
  return '';
}

function tableHtml(rows) {
  const body = rows.map((r) => '<tr>' + r.map((c) =>
    `<td${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}${c.cs > 1 ? ` colspan="${c.cs}"` : ''}>${esc(c.text)}</td>`).join('') + '</tr>').join('');
  return `<div class="evr-tbl-w"><table class="evr-tbl"><tbody>${body}</tbody></table></div>`;
}

function blocksHtml(page) {
  if (!page.blocks.length) return '<p class="evr-blank">이 쪽에는 글이 없어요 (그림이나 빈 쪽일 수 있어요)</p>';
  let more = false;
  const html = page.blocks.map((b) => {
    if (b.continues) more = true;
    if (b.type === 'paragraph') {
      const cls = page.n === 1 && !b.continues && b.text.length <= 40 ? 'cover' : paragraphClass(b.text);
      return `<p${cls ? ` class="${cls}"` : ''}>${esc(b.text)}</p>`;
    }
    if (b.type === 'table') return tableHtml(b.rows);
    if (b.type === 'image') return `<img class="evr-img" src="${esc(b.src)}" alt="제안요청서 그림" loading="lazy">`;
    return '';
  }).join('');
  return html + (more ? '<p class="evr-more">다음 쪽에 이어져요</p>' : '');
}

async function showParsedFallback(container, pageNumber, token, message, loadPage, isCurrent) {
  container.classList.remove('is-rendered');
  try {
    const page = await loadPage(pageNumber);
    if (isCurrent(token, container)) {
      container.innerHTML = `<p class="evr-render-fallback" role="status">${esc(message)}</p>${blocksHtml(page)}`;
      container.scrollTop = 0;
    }
  } catch {
    if (isCurrent(token, container)) {
      container.innerHTML = '<p class="evr-blank">원본 쪽과 파싱된 내용을 모두 불러오지 못했어요.</p>';
    }
  }
}

/* ───────── 읽기 화면 ───────── */
function mountReader(el, data, projectId) {
  const toc = data.toc;
  const TOT = data.pages.length;
  const labels = new Map(data.pages.map((p) => [p.n, p.label]));
  const title = data.document.title;
  const st = { p: 1, mode: store.get(READ_MODE_KEY) === 'single' ? 'single' : 'spread', chipK: 0 };
  const cache = new Map();
  const ordered = toc.filter((t) => t.seen && t.page).sort((a, b) => a.page - b.page);
  const secOf = (p) => ordered.reduce((s, t) => (t.page <= p ? t : s), null);
  const STEP = () => (st.mode === 'spread' ? 2 : 1);
  const norm = (p) => {
    p = Math.max(1, Math.min(TOT, p));
    return st.mode === 'spread' && p % 2 === 0 ? p - 1 : p;
  };
  const pct = (x) => `${(x / TOT * 100).toFixed(2)}%`;

  el.classList.add('evr');
  el.innerHTML =
    '<nav class="evr-strip" aria-label="목차 띠"><button type="button" class="evr-strip-label" aria-haspopup="true">목차</button>' +
    '<div class="evr-track" aria-hidden="true"></div><div class="evr-pop" role="region" aria-label="전체 목차"><h3>목 차</h3>' +
    (toc.length ? toc.map((t, i) => {
      const un = !t.seen;
      const tip = un ? '쪽 연결이 맞지 않아 확인이 필요해요 (NEEDS_REVIEW)'
        : t.adjusted ? `목차의 쪽 번호(${t.printed})와 본문이 달라 제목으로 찾은 쪽이에요` : '';
      return `<button type="button" class="evr-toc-item${t.lv === 2 ? ' lv2' : ''}${un ? ' is-unseen' : ''}" data-i="${i}"${un ? ' aria-disabled="true"' : ''}${tip ? ` title="${esc(tip)}"` : ''}>` +
        `<span class="t">${esc(t.t)}</span><span class="here" hidden>지금</span><span class="dots"></span>` +
        (un ? '<span class="unseen-tag">확인 필요</span>' : `<span class="pn">${t.page}</span>`) + '</button>';
    }).join('') : '<p class="evr-blank">이 문서에는 목차가 없어요</p>') +
    '</div></nav>' +
    '<div class="evr-main"><div class="evr-top"></div><div class="evr-stage"><div class="evr-bookw"><div class="evr-book"></div>' +
    '<button type="button" class="evr-side l" data-pg="-1" aria-label="앞 쪽"><span aria-hidden="true">‹</span><span class="lb" aria-hidden="true">앞 쪽</span></button>' +
    '<button type="button" class="evr-side r" data-pg="1" aria-label="뒤 쪽"><span aria-hidden="true">›</span><span class="lb" aria-hidden="true">뒤 쪽</span></button>' +
    '</div></div><div class="evr-foot"><span class="note"></span><span class="fr">' +
    `<label class="evr-go"><span>쪽 이동</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="3" placeholder="${Math.min(TOT, 27)}" aria-label="이동할 쪽 번호 (1부터 ${TOT})"><span>쪽 · Enter</span></label>` +
    '<span class="err" role="alert"></span><span class="evr-keys">옆 버튼이나 ← → 키</span></span></div></div>';

  const $ = (s) => el.querySelector(s);
  const strip = $('.evr-strip'), track = $('.evr-track'), top = $('.evr-top'), book = $('.evr-book'), bookw = $('.evr-bookw');
  const goIn = $('.evr-go input'), goErr = $('.evr-foot .err'), note = $('.evr-foot .note');
  const items = [...el.querySelectorAll('.evr-toc-item')];
  const review = toc.filter((t) => !t.seen).length;
  note.textContent = '평가 시작 때 고정된 버전이에요' + (review ? ` · "확인 필요" 목차 ${review}개는 쪽 연결을 확인하는 중이에요` : '');

  track.innerHTML = '<i class="rail"></i><i class="fill"></i>' +
    toc.filter((t) => t.page).map((t) => `<i class="tick" style="top:${pct(t.page - 1)}"></i>`).join('') +
    '<i class="cur"></i><span class="now"></span>';
  const fill = track.querySelector('.fill'), cur = track.querySelector('.cur'), now = track.querySelector('.now');

  async function loadPage(n) {
    if (n < 1 || n > TOT) return null;
    if (!cache.has(n)) {
      const req = getJson(`${API}/projects/${encodeURIComponent(projectId)}/rfp/pages/${n}`)
        .catch((e) => { cache.delete(n); throw e; });
      cache.set(n, req);
    }
    return cache.get(n);
  }

  function pageShell(p) {
    if (p > TOT) return '<section class="evr-page is-empty" aria-hidden="true"></section>';
    const label = labels.get(p);
    const foot = `${p}${label != null && label !== p ? `<small>문서 쪽번호 ${label}</small>` : ''}`;
    return `<section class="evr-page" aria-label="${p}쪽" data-p="${p}">` +
      '<div class="evr-tx"><p class="evr-wait">원본 쪽을 렌더링하는 중…</p></div>' +
      `<div class="evr-pn">${foot}</div></section>`;
  }

  async function fillPage(p, token) {
    const sec = book.querySelector(`.evr-page[data-p="${p}"] .evr-tx`);
    if (!sec) return;
    const isCurrent = (candidate, container) => candidate === st.token && container.isConnected;
    if (!data.document.has_source) {
      await showParsedFallback(sec, p, token, '원본 파일이 없어 파싱된 내용으로 표시합니다.', loadPage, isCurrent);
      return;
    }
    const image = document.createElement('img');
    image.className = 'evr-page-svg';
    image.alt = `${p}쪽 원본 문서`;
    image.decoding = 'async';
    image.onload = () => {
      if (isCurrent(token, sec)) sec.classList.add('is-rendered');
    };
    image.onerror = () => {
      if (isCurrent(token, sec)) {
        showParsedFallback(sec, p, token, '원본 쪽 렌더링에 실패해 파싱된 내용으로 표시합니다.', loadPage, isCurrent);
      }
    };
    const version = encodeURIComponent(data.document.source_version || '');
    image.src = `${API}/projects/${encodeURIComponent(projectId)}/rfp/pages/${p}/svg?v=${version}`;
    sec.replaceChildren(image);
  }

  function topHtml() {
    const last = st.mode === 'spread' ? Math.min(TOT, st.p + 1) : st.p;
    const s = secOf(st.p);
    const loc = last > st.p ? `${st.p}–${last}` : `${st.p}`;
    return `<b>${esc(title)}</b>${s ? `<span class="d">·</span><span>${esc(s.t)}</span>` : ''}` +
      `<span class="d">·</span><span class="mono" aria-live="polite">${loc} / ${TOT}쪽</span><span class="sp"></span>` +
      `<span class="evr-seg" role="group" aria-label="보기 방식"><button type="button" data-mode="spread" aria-pressed="${st.mode === 'spread'}">두 쪽</button>` +
      `<button type="button" data-mode="single" aria-pressed="${st.mode === 'single'}">한 쪽</button></span>` +
      '<button type="button" class="ev-btn ghost sm" data-download>원본 내려받기</button>';
  }

  function update(anim) {
    st.p = norm(st.p);
    st.token = (st.token || 0) + 1;
    el.classList.toggle('is-single', st.mode === 'single');
    book.innerHTML = st.mode === 'spread' ? pageShell(st.p) + pageShell(st.p + 1) : pageShell(st.p);
    top.innerHTML = topHtml();
    const n = STEP();
    fill.style.height = pct(st.p - 1 + n);
    cur.style.top = pct(st.p - 1);
    cur.style.height = pct(n);
    now.style.top = pct(st.p - 1 + n / 2);
    now.textContent = `${st.p}쪽`;
    const s = secOf(st.p);
    items.forEach((b) => {
      const on = s === toc[+b.dataset.i];
      b.classList.toggle('is-current', on);
      b.querySelector('.here').hidden = !on;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    el.querySelector('.evr-side.l').disabled = st.p <= 1;
    el.querySelector('.evr-side.r').disabled = st.p + STEP() > TOT;
    if (anim) { book.classList.remove('t-fwd', 't-back', 't-jump'); void book.offsetWidth; book.classList.add(`t-${anim}`); }
    const token = st.token;
    for (let i = 0; i < n; i += 1) fillPage(st.p + i, token);
  }

  function go(p, opts = {}) {
    const q = norm(p), d = q - st.p;
    st.p = q;
    goErr.textContent = '';
    update(d !== 0 ? (opts.jump ? 'jump' : d > 0 ? 'fwd' : 'back') : null);
    bookw.querySelector('.evr-chip')?.remove();
    if (opts.jump && Math.abs(d) > STEP()) {
      const s = secOf(st.p), k = ++st.chipK, chip = document.createElement('div');
      chip.className = 'evr-chip';
      chip.setAttribute('role', 'status');
      chip.textContent = `${s ? `${s.t} · ` : ''}${st.p}쪽으로 이동`;
      bookw.appendChild(chip);
      setTimeout(() => { if (st.chipK === k && chip.parentNode) chip.remove(); }, 2300);
    }
  }

  async function download(btn) {
    if (!data.document.has_source) { toast('원본 파일이 없어요. 담당자에게 알려 주세요'); return; }
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/projects/${encodeURIComponent(projectId)}/rfp/source`);
      if (res.status === 401 || res.status === 403) { toast('내려받을 권한이 없어요. 담당자에게 문의해 주세요'); return; }
      if (!res.ok) throw new Error('download');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = data.document.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast('원본을 내려받지 못했어요. 잠시 뒤 다시 눌러 주세요');
    } finally {
      btn.disabled = false;
    }
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pg],[data-i],[data-mode],[data-download]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.pg) go(st.p + (+t.dataset.pg) * STEP());
    else if (t.dataset.i != null) {
      const it = toc[+t.dataset.i];
      if (!it.seen || !it.page) { toast('이 항목은 쪽 번호가 아직 확인되지 않았어요. 담당자가 확인하면 열려요'); return; }
      go(it.page, { jump: true });
      strip.classList.add('hush');
      if (strip.contains(document.activeElement)) document.activeElement.blur();
    } else if (t.dataset.mode) {
      st.mode = t.dataset.mode;
      store.set(READ_MODE_KEY, st.mode);
      update(null);
      top.querySelector(`[data-mode="${st.mode}"]`)?.focus();
    } else if ('download' in t.dataset) download(t);
  });
  goIn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const n = parseInt(goIn.value, 10);
    if (!(n >= 1 && n <= TOT)) { goErr.textContent = `1–${TOT} 사이 숫자를 넣어 주세요`; return; }
    go(n, { jump: true });
  });
  goIn.addEventListener('input', () => { goErr.textContent = ''; });
  strip.addEventListener('pointerleave', () => strip.classList.remove('hush'));
  el.addEventListener('pointerover', (e) => { if (strip.classList.contains('hush') && !e.target.closest('.evr-strip')) strip.classList.remove('hush'); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && strip.matches(':hover, :focus-within')) {
      strip.classList.add('hush');
      if (strip.contains(document.activeElement)) document.activeElement.blur();
      e.stopPropagation();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input,textarea,select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(st.p + STEP()); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.p - STEP()); }
  });

  go(1);
}

/* ───────── 상태 화면 ───────── */
function showState(el, kind, headline, text) {
  el.innerHTML = `<div class="evr-state" role="${kind === 'loading' ? 'status' : 'alert'}">` +
    `${kind === 'loading' ? '<div class="spin" aria-hidden="true"></div>' : ''}<h2>${esc(headline)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
}

async function main() {
  const reader = document.getElementById('reader');
  renderHeader('사업 확인 중', [], '');
  showState(reader, 'loading', '제안요청서를 불러오고 있어요');
  try {
    const projects = await getJson(`${API}/projects`);
    if (!projects.length) {
      renderHeader('사업 없음', [], '');
      showState(reader, 'empty', '볼 수 있는 제안요청서가 없어요', '담당자가 제안요청서를 올리면 여기에서 읽을 수 있어요.');
      return;
    }
    const wanted = new URLSearchParams(location.search).get('project');
    const project = projects.find((p) => p.project_id === wanted) || projects[0];
    renderHeader(project.name, projects, project.project_id);
    const data = await getJson(`${API}/projects/${encodeURIComponent(project.project_id)}/rfp`);
    document.title = `${data.document.title} · 심사임당`;
    if (!data.pages.length) {
      showState(reader, 'empty', '제안요청서 쪽이 아직 없어요', '문서 변환이 끝나면 읽을 수 있어요.');
      return;
    }
    reader.innerHTML = '';
    mountReader(reader, data, project.project_id);
  } catch (e) {
    const missing = e.status === 404;
    showState(reader, 'error', missing ? '제안요청서 파일이 없어요' : '제안요청서를 불러오지 못했어요',
      missing ? e.message : '잠시 뒤 새로고침해 주세요. 계속되면 담당자에게 알려 주세요.');
  }
}

main();
