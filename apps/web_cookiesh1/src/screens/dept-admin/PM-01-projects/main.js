// PM-01 · PRJ-01 · PRJ-03 · PRJ-05
import './styles.css';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base = '/document-api/projects';
const fields = ['name', 'org', 'dept', 'pos', 'owner', 'tel', 'mail', 'date'];
const jobNames = {none:'추출 전', queued:'추출 대기 중', running:'요구사항 추출 중', done:'추출 완료', failed:'추출 실패'};
let projects = [], project = null, rfp = null, job = null, health = null;
let deletedProjects = [], deletedProject = null;
let query = '', filter = '', page = 1, generation = 0, timer, toastTimer;
let selectedFile = null, source = null, editingId = null, deletingId = null;
let busy = false, dialogBusy = false, errorMessage = '';
const currentId = () => new URLSearchParams(location.search).get('id');
const currentDeletedId = () => new URLSearchParams(location.search).get('deleted');
const docsView = () => location.hash === '#documents';
const activeJob = () => ['queued', 'running'].includes(job?.status);
const projectUrl = (id, documents = false) => `?id=${encodeURIComponent(id)}${documents ? '#documents' : ''}`;
const deletedProjectUrl = (id) => `?deleted=${encodeURIComponent(id)}`;
const badge = (status) => `<span class="badge ${status === '완료' ? 'success' : status === '평가 중' ? 'primary' : ''}">${status === '완료' ? '✓' : status === '평가 중' ? '●' : '○'} ${escape(status)}</span>`;

async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, {cache:'no-store', ...options}); }
  catch { throw new Error('서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  if (data === null && !url.endsWith('/rfp')) throw new Error('서버 응답을 확인하지 못했어요. 다시 시도해 주세요.');
  return data;
}
const jsonRequest = (method, body) => ({method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('on'), 4500);
}
function errorBar() {
  return errorMessage ? `<div class="note bad error-bar" role="alert"><span>${escape(errorMessage)}</span><button class="btn sm" data-action="refresh">다시 시도</button></div>` : '';
}
function navigate(id = null, documents = false) {
  history.pushState({}, '', id ? projectUrl(id, documents) : location.pathname);
  load();
}
function render() {
  if (currentDeletedId() && deletedProject) renderDeletedDetail();
  else if (currentId() && project) renderDetail();
  else if (!currentId()) renderList();
}
function renderList() {
  document.title = '사업 목록 · 심사임당';
  $('#main').innerHTML = `<header class="head"><div><h1>사업 목록</h1><p class="sub">사업을 등록하고 제안요청서와 요구사항을 확인하세요.</p></div><button class="btn primary" data-action="new">사업 등록</button></header>${errorBar()}
    <div class="body"><section class="card" aria-label="사업 목록"><div class="toolbar">
    <input type="search" id="search" aria-label="사업명·성명 검색" placeholder="검색어 (사업명·성명)" value="${escape(query)}">
    <select id="filter" aria-label="사업 상태"><option value="">상태 전체</option>${['준비','평가 중','완료','삭제'].map(s => `<option ${s === filter ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <button class="btn" data-action="reset">초기화</button><button class="btn" data-action="refresh">새로 고침</button><span class="count" id="count" aria-live="polite"></span></div>
    <div class="tbl-wrap" id="list-content"></div><nav class="pager" id="pager" aria-label="쪽 이동"></nav></section></div>`;
  renderRows();
}
function renderRows() {
  if (filter === '삭제') {
    renderDeletedRows();
    return;
  }
  const items = projects.filter(p => (!filter || p.status === filter) && `${p.name} ${p.owner}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(items.length / 8));
  page = Math.min(page, pages);
  $('#count').textContent = `${items.length}개 사업`;
  $('#list-content').innerHTML = items.length ? `<table><thead><tr><th scope="col">사업명</th><th scope="col">담당자</th><th scope="col">평가일</th><th scope="col">문서 준비</th><th scope="col">상태</th><th scope="col">자료</th></tr></thead><tbody>${items.slice((page-1)*8, page*8).map(p => `<tr><td><a class="project-link" data-nav="${escape(p.id)}" href="${projectUrl(p.id)}">${escape(p.name)}</a></td><td>${escape(p.owner || '미등록')}</td><td class="tnum">${escape(p.date || '아직 안 정함')}</td><td>${p.rfp_revisions ? `<span class="badge ${p.requirements_status === 'done' ? 'success' : 'primary'}">${p.requirements_status === 'done' ? '✓ 요구사항 추출됨' : '제안요청서 등록됨'}</span>` : '<span class="muted">문서 없음</span>'}</td><td>${badge(p.status)}</td><td><a class="btn sm" data-nav="${escape(p.id)}" data-documents href="${projectUrl(p.id,true)}" aria-label="${escape(p.name)} 자료 열기">자료 열기</a></td></tr>`).join('')}</tbody></table>` : `<div class="state"><div class="ico" aria-hidden="true">${projects.length ? '?' : '+'}</div><strong>${projects.length ? '검색 결과가 없어요' : '아직 등록한 사업이 없어요'}</strong><p>${projects.length ? '검색어나 상태를 바꿔 보세요.' : '사업 등록을 눌러 첫 사업을 만들어 보세요.'}</p></div>`;
  $('#pager').hidden = items.length === 0;
  $('#pager').innerHTML = `<button class="btn sm" data-action="prev" ${page <= 1 ? 'disabled' : ''}>이전</button><span>${page} / ${pages}쪽</span><button class="btn sm" data-action="next" ${page >= pages ? 'disabled' : ''}>다음</button>`;
}
function renderDeletedRows() {
  const items = deletedProjects.filter(p => `${p.name} ${p.org} ${p.dept} ${p.deletion_reason}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(items.length / 8));
  page = Math.min(page, pages);
  $('#count').textContent = `${items.length}개 삭제 사업`;
  $('#list-content').innerHTML = items.length ? `<table><thead><tr><th scope="col">사업명</th><th scope="col">소속 / 부서</th><th scope="col">삭제일</th><th scope="col">삭제 사유</th><th scope="col">상태</th></tr></thead><tbody>${items.slice((page-1)*8, page*8).map(p => `<tr><td><a class="project-link" data-deleted-nav="${escape(p.id)}" href="${deletedProjectUrl(p.id)}">${escape(p.name)}</a></td><td>${escape([p.org, p.dept].filter(Boolean).join(' / ') || '미등록')}</td><td class="tnum">${escape(p.deleted_at?.slice(0,10) || '미등록')}</td><td>${escape(p.deletion_reason)}</td><td><span class="badge">삭제 · ${escape(p.status)}</span></td></tr>`).join('')}</tbody></table>` : `<div class="state"><div class="ico" aria-hidden="true">⌫</div><strong>${deletedProjects.length ? '검색 결과가 없어요' : '삭제된 사업이 없어요'}</strong><p>${deletedProjects.length ? '검색어나 상태를 바꿔 보세요.' : '삭제된 사업은 이 목록에 보관되지 않았어요.'}</p></div>`;
  $('#pager').hidden = items.length === 0;
  $('#pager').innerHTML = `<button class="btn sm" data-action="prev" ${page <= 1 ? 'disabled' : ''}>이전</button><span>${page} / ${pages}쪽</span><button class="btn sm" data-action="next" ${page >= pages ? 'disabled' : ''}>다음</button>`;
}
function renderDeletedDetail() {
  const categories = [
    ['business_related_status', '사업 관련 현황'],
    ['background_and_need', '추진 배경과 필요성'],
    ['scope_main_tasks', '사업 범위·주요 과업'],
  ];
  document.title = `${deletedProject.name} · 삭제 사업 · 심사임당`;
  $('#main').innerHTML = `<header class="pj-head"><a class="pj-back" href="./" data-action="list">← 사업 목록</a><div class="pj-row"><div class="pj-title"><h1>${escape(deletedProject.name)}</h1><span class="badge">삭제됨</span></div></div></header>
    <div class="body deleted-detail">
      <section class="deleted-record" aria-label="삭제 기록">
        <div class="deleted-record-head"><div><span class="deleted-kicker">삭제된 사업 기록</span><p>사업 원본과 문서는 삭제되었으며, 아래 정보와 요약만 보관되어 있습니다.</p></div><span class="deleted-date">${escape(deletedProject.deleted_at?.slice(0,10) || '날짜 미상')} 삭제</span></div>
        <dl class="deleted-meta">
          <div><dt>소속 / 부서</dt><dd>${escape([deletedProject.org, deletedProject.dept].filter(Boolean).join(' / ') || '미등록')}</dd></div>
          <div><dt>삭제 전 상태</dt><dd>${escape(deletedProject.status)}</dd></div>
          <div class="deleted-reason"><dt>삭제 사유</dt><dd>${escape(deletedProject.deletion_reason)}</dd></div>
        </dl>
      </section>
      <section class="deleted-summaries" aria-label="보관된 사업 요약">
        <header class="deleted-section-head"><div><h2>사업 요약</h2><p>삭제 시점에 보관한 제안요청서 분석 요약입니다.</p></div></header>
        <div class="deleted-category-list">${categories.map(([key,label]) => `<section class="deleted-category"><h3>${label}</h3>${deletedProject[key]?.length ? `<ul class="deleted-points">${deletedProject[key].map(item => `<li><p>${escape(item.text)}</p>${item.pages?.length ? `<span class="page-ref">원문 ${item.pages.join(', ')}쪽</span>` : ''}</li>`).join('')}</ul>` : '<p class="deleted-empty">보관된 요약이 없습니다.</p>'}</section>`).join('')}</div>
      </section>
    </div>`;
}
function renderDetail() {
  document.title = `${project.name} · 심사임당`;
  const documents = docsView();
  $('#main').innerHTML = `<header class="pj-head"><a class="pj-back" href="./" data-action="list">← 사업 목록</a><div class="pj-row"><div class="pj-title"><h1>${escape(project.name)}</h1>${badge(project.status)}</div><div class="pj-act"><span class="hint">${rfp ? '등록한 문서와 추출 결과를 확인하세요' : '다음 일: 제안요청서 올리기'}</span><button class="btn primary" data-action="${documents ? 'overview' : 'documents'}">${documents ? '사업 정보' : '다음: 문서'}</button></div></div></header>
    <nav class="steps" aria-label="진행 단계">${['사업 정보','문서','평가항목','평가위원','참석·위원장','결과'].map((s,i) => `<button class="step ${i === (documents ? 1 : 0) ? 'is-current' : i > 1 ? 'is-locked' : ''}" ${i > 1 ? 'disabled title="해당 단계는 연결 예정입니다"' : `data-action="${i ? 'documents' : 'overview'}"`} ${i === (documents ? 1 : 0) ? 'aria-current="step"' : ''}><span class="n">${i+1}</span>${s}</button>`).join('')}</nav>${errorBar()}
    <div class="body">${documents ? documentsMarkup() : overviewMarkup()}</div>`;
}
function overviewMarkup() {
  const locked = project.status !== '준비';
  const info = [['사업명',project.name],['담당자',[project.owner,project.pos].filter(Boolean).join(' · ') || '미등록'],['소속',project.org || '미등록'],['부서',project.dept || '미등록'],['전화',project.tel || '미등록'],['이메일',project.mail || '없음'],['평가일',project.date || '아직 안 정함']];
  return `<div class="cols"><section class="card panel" aria-label="사업 정보"><div class="top"><h2>사업 정보</h2><div class="acts"><button class="btn text-danger" data-action="delete" ${locked ? 'disabled title="평가가 시작돼 삭제할 수 없어요"' : ''}>삭제</button><button class="btn" data-action="edit">수정</button></div></div>${locked ? '<div class="note warn">평가가 시작돼 사업 식별 정보와 평가일은 바꿀 수 없어요. 담당자 정보는 수정할 수 있어요.</div>' : ''}<dl class="kv">${info.map(([k,v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl></section>
    <section class="card panel" aria-label="한눈에 보기"><div class="top"><h2>한눈에 보기</h2><button class="btn sm" data-action="refresh">새로 고침</button></div><ul class="sum">
    <li><span class="k">제안요청서 준비</span><span class="v tnum">${rfp ? 1 : 0} / 1</span><span class="st badge ${rfp ? 'success' : ''}">${rfp ? '✓ 등록 완료' : '○ 대기'}</span><div class="bar" aria-hidden="true"><i style="width:${rfp ? 100 : 0}%"></i></div></li>
    <li><span class="k">제안 요구사항</span><span class="v">${escape(jobNames[job?.status] || '추출 전')}</span><span class="st badge ${job?.status === 'done' ? 'success' : job?.status === 'failed' ? 'danger' : 'warning'}">${job?.status === 'done' ? '✓ 완료' : activeJob() ? '⟳ 처리 중' : job?.status === 'failed' ? '! 확인 필요' : '○ 대기'}</span></li>
    <li><span class="k">평가위원 확정</span><span class="v">아직 안 했어요</span><span class="st badge">○ 대기</span></li><li><span class="k">결과</span><span class="v">아직 없어요</span><span class="st badge">○ 대기</span></li></ul>
    ${job?.error ? `<p class="note bad">${escape(job.error)}</p>` : ''}<button class="btn" data-action="documents">${rfp ? '문서와 추출 결과 열기' : '제안요청서 올리기'}</button></section></div>`;
}
function documentsMarkup() {
  const locked = project.status !== '준비';
  return `<div class="document-page"><div class="document-registration"><section class="card panel registration-card" aria-label="제안요청서 등록"><div class="registration-heading"><div class="top"><h2><span class="registration-number">1</span>제안요청서 등록</h2><span class="muted">HWPX · 50MB 이하</span></div><span class="badge ${rfp ? 'success' : ''}">${rfp ? '✓ 저장됨' : '○ 미등록'}</span></div>
    ${rfp ? `<div class="file-meta"><strong>${escape(rfp.filename)}</strong><span class="muted">${(rfp.size/1024/1024).toFixed(2)} MB · ${rfp.revision}차 등록 · ${new Date(rfp.uploaded_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</span></div><p class="muted">${rfp.parse.pages ? `${rfp.parse.pages}쪽 · ` : ''}${rfp.parse.blocks}개 원문 블록 저장${rfp.parse.warnings ? ` · 파싱 경고 ${rfp.parse.warnings}건 (원문 내용 확인 필요)` : ''}</p><div class="doc-actions"><a class="btn" href="${base}/${encodeURIComponent(project.id)}/download">원본 다운로드</a><button class="btn" data-action="source" ${busy ? 'disabled' : ''}>${source ? '파싱 원문 닫기' : '파싱 원문 보기'}</button></div>${source ? `<div class="note">문단과 표의 파싱 내용이에요. 그림과 정확한 문서 서식은 원본 다운로드로 확인하세요.</div><div class="source-view" tabindex="0" aria-label="파싱된 문서 원문">${blocksMarkup(source.blocks)}</div>` : ''}` : '<p class="muted">사업의 제안요청서를 올려 주세요. 문단·표를 저장하고 필요한 요구사항을 추출해요.</p>'}
    ${locked ? '<p class="note warn">평가가 시작된 사업은 문서를 교체할 수 없어요.</p>' : `<div class="upload-zone" id="drop-zone"><strong>${rfp ? '새 제안요청서로 교체' : 'HWPX 파일을 선택하거나 여기에 놓으세요'}</strong><p class="muted">HWPX · 최대 50 MB${rfp ? ' · 이전 등록 기록은 보존돼요' : ''}</p><input id="hwpx-file" type="file" accept=".hwpx" aria-label="제안요청서 HWPX 선택" ${busy ? 'disabled' : ''}><p id="selected-file" class="muted" role="status">${escape(selectedFile?.name || '선택한 파일 없음')}</p><button class="btn primary" data-action="upload" ${!selectedFile || busy || activeJob() ? 'disabled' : ''}>${busy ? '문서를 처리하고 있어요…' : activeJob() ? '추출 완료 후 교체할 수 있어요' : '업로드 및 요구사항 추출'}</button></div>`}
    </section><section class="card panel registration-card proposal-card" aria-label="업체별 제안서 등록"><div class="registration-heading"><div class="top"><h2><span class="registration-number">2</span>제안서 등록</h2><span class="muted">업체마다 1개 · HWPX · PDF</span></div><span class="badge">○ 업체 등록 전</span></div>
    <p class="proposal-intro">업체를 등록하면 업체별로 제안서를 올릴 수 있어요.</p>
    <div class="proposal-empty"><span class="proposal-empty-icon" aria-hidden="true">＋</span><strong>등록된 업체가 없어요</strong><span class="muted">업체 추가와 제안서 업로드 기능은 준비 중이에요.</span><button class="btn" type="button" disabled>+ 업체 추가</button></div>
    <div class="proposal-sample" aria-label="업체별 제안서 행 미리보기">
      <div class="proposal-row"><span class="vendor-code">A사</span><div class="proposal-file"><strong>업체 등록 후 제안서를 올릴 수 있어요</strong><span>HWPX 또는 PDF · 최대 50MB</span></div><span class="badge">○ 제안서 대기</span><button class="btn" type="button" disabled>파일 선택</button></div>
      <div class="proposal-row"><span class="vendor-code">B사</span><div class="proposal-file"><strong>업체별로 제안서를 관리해요</strong><span>파일명과 등록 경로가 여기에 표시돼요</span></div><span class="badge">○ 제안서 대기</span><button class="btn" type="button" disabled>파일 선택</button></div>
    </div>
    <p class="proposal-footnote">화면 구성 예시 · 제안서 등록 및 업체 관리는 아직 연결되지 않았어요.</p>
    </section></div></div>`;
}
function blocksMarkup(blocks = []) {
  return blocks.map(b => `<div class="source-block">${b.pages?.length ? `<div class="page-ref">원문 ${b.pages.join(', ')}쪽</div>` : ''}${b.type === 'table' ? `<div class="table-scroll"><table aria-label="원문 표"><tbody>${(b.rows || []).map(row => `<tr>${row.map(cell => `<td rowspan="${Math.max(1,Math.min(1000,Number(cell.row_span)||1))}" colspan="${Math.max(1,Math.min(1000,Number(cell.col_span)||1))}">${escape(cell.text)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p>${escape(b.text)}</p>`}</div>`).join('') || '<p class="muted">확인된 원문이 없어요.</p>';
}
async function load() {
  const version = ++generation;
  clearTimeout(timer);
  project = null; deletedProject = null; source = null; selectedFile = null; errorMessage = ''; busy = false;
  $('#main').innerHTML = '<div class="loading" role="status">사업 정보를 불러오는 중이에요.</div>';
  const id = currentId();
  const deletedId = currentDeletedId();
  try {
    if (deletedId) {
      deletedProject = await api(`/document-api/deleted-projects/${encodeURIComponent(deletedId)}`);
    } else if (id) {
      const data = await Promise.all([api(`${base}/${encodeURIComponent(id)}`), api(`${base}/${encodeURIComponent(id)}/rfp`), api(`${base}/${encodeURIComponent(id)}/requirements`), api('/document-api/health')]);
      if (version !== generation) return;
      [project, rfp, job, health] = data;
    } else {
      const data = await api(filter === '삭제' ? '/document-api/deleted-projects' : base);
      if (version !== generation) return;
      if (filter === '삭제') deletedProjects = data.items;
      else projects = data.items;
    }
    render();
    schedulePoll();
  } catch (error) {
    if (version !== generation) return;
    errorMessage = error.message;
    if (!id && !deletedId) { projects = []; deletedProjects = []; renderList(); }
    else $('#main').innerHTML = `<header class="head"><h1>사업을 불러오지 못했어요</h1><a class="btn" href="./" data-action="list">사업 목록</a></header>${errorBar()}`;
  }
}
function schedulePoll() {
  clearTimeout(timer);
  if (!project || !activeJob()) return;
  const version = generation, id = project.id;
  timer = setTimeout(async () => {
    try {
      const next = await api(`${base}/${encodeURIComponent(id)}/requirements`);
      if (version !== generation) return;
      job = next; errorMessage = '';
      if (!busy) render();
      schedulePoll();
    } catch (error) {
      if (version !== generation) return;
      errorMessage = error.message;
      render();
      // 연결 실패 후에도 다음 조회에서 회복할 수 있다.
      schedulePoll();
    }
  }, 3000);
}
function showEditor(edit) {
  editingId = edit ? project.id : null;
  const form = $('#project-form');
  form.reset();
  for (const key of fields) {
    form.elements[key].value = edit ? project[key] || '' : '';
    form.elements[key].disabled = !!(edit && project.status !== '준비' && ['name','org','dept','date'].includes(key));
  }
  $('#editor-title').textContent = edit ? '사업 정보 수정' : '사업 등록';
  $('#save-project').textContent = edit ? '저장' : '등록';
  $('#edit-lock').hidden = !(edit && project.status !== '준비');
  $('#form-error').hidden = true;
  $('#editor').showModal();
  form.querySelector('input:not(:disabled)').focus();
}
function setDialogBusy(value) {
  dialogBusy = value;
  document.querySelectorAll('dialog button').forEach(button => { button.disabled = value; });
}
$('#project-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (dialogBusy) return;
  const form = event.currentTarget;
  const payload = Object.fromEntries(fields.filter(key => !form.elements[key].disabled).map(key => [key, form.elements[key].value.trim()]));
  setDialogBusy(true); $('#form-error').hidden = true;
  let saved;
  try {
    saved = await api(editingId ? `${base}/${encodeURIComponent(editingId)}` : base, jsonRequest(editingId ? 'PATCH' : 'POST', payload));
    $('#editor').close();
    toast(editingId ? '사업 정보를 저장했어요.' : '사업을 등록했어요. 다음은 제안요청서 업로드예요.');
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { setDialogBusy(false); }
  if (saved) navigate(saved.id);
});
$('#delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (dialogBusy) return;
  setDialogBusy(true); $('#delete-error').hidden = true;
  let deleted = false;
  try {
    await api(`${base}/${encodeURIComponent(deletingId)}`, jsonRequest('DELETE', {reason:event.currentTarget.elements.reason.value.trim()}));
    $('#delete-dialog').close(); deleted = true; toast('삭제 요약은 별도 보관했고 원본 문서와 분석 자료는 삭제했어요.');
  } catch (error) { $('#delete-error').textContent = error.message; $('#delete-error').hidden = false; }
  finally { setDialogBusy(false); }
  if (deleted) navigate();
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('cancel', event => { if (dialogBusy) event.preventDefault(); });
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
}
function selectFile(file) {
  if (!file) return;
  if (!/\.hwpx$/i.test(file.name) || !file.size || file.size > 50 * 1024 * 1024) {
    selectedFile = null; render(); toast('50 MB 이하의 비어 있지 않은 HWPX 파일을 선택해 주세요.'); return;
  }
  selectedFile = file;
  $('#selected-file').textContent = `${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
  $('[data-action="upload"]').disabled = busy || activeJob();
}
async function documentAction(action) {
  if (busy || !project) return;
  const id = project.id, version = generation;
  const file = selectedFile;
  if (action === 'upload' && (!file || activeJob())) return;
  busy = true; errorMessage = ''; render();
  try {
    if (action === 'upload') {
      const body = new FormData(); body.append('file', file);
      const uploaded = await api(`${base}/${encodeURIComponent(id)}/rfp`, {method:'POST', body});
      if (version !== generation) return;
      rfp = uploaded; selectedFile = null; source = null;
      toast(uploaded.extraction_warning || '제안요청서를 저장했어요. 요구사항 추출 상태를 확인하세요.');
    } else if (action === 'extract') {
      await api(`${base}/${encodeURIComponent(id)}/requirements`, {method:'POST'});
    } else if (action === 'source') {
      const next = source ? null : await api(`${base}/${encodeURIComponent(id)}/source`);
      if (version !== generation) return;
      source = next;
    }
    if (action !== 'source') {
      const next = await api(`${base}/${encodeURIComponent(id)}/requirements`);
      if (version !== generation) return;
      job = next;
    }
  } catch (error) {
    if (version === generation) errorMessage = error.message;
  } finally {
    if (version === generation) { busy = false; render(); schedulePoll(); }
  }
}
$('#main').addEventListener('click', event => {
  const deletedLink = event.target.closest('[data-deleted-nav]');
  if (deletedLink && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    history.pushState({}, '', deletedProjectUrl(deletedLink.dataset.deletedNav));
    load();
    return;
  }
  const link = event.target.closest('[data-nav]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); navigate(link.dataset.nav, link.hasAttribute('data-documents')); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  switch (button.dataset.action) {
    case 'new': showEditor(false); break;
    case 'edit': showEditor(true); break;
    case 'delete': deletingId = project.id; $('#delete-form').reset(); $('#delete-error').hidden = true; $('#delete-dialog').showModal(); break;
    case 'list': navigate(); break;
    case 'documents': case 'overview':
      history.pushState({}, '', projectUrl(project.id, button.dataset.action === 'documents')); render(); break;
    case 'refresh': if (!busy) load(); break;
    case 'reset': query = ''; filter = ''; page = 1; renderList(); load(); break;
    case 'prev': page--; renderRows(); break;
    case 'next': page++; renderRows(); break;
    case 'upload': case 'extract': case 'source': documentAction(button.dataset.action); break;
  }
});
$('#main').addEventListener('input', event => {
  if (event.target.id === 'search') { query = event.target.value; page = 1; renderRows(); }
});
$('#main').addEventListener('change', event => {
  if (event.target.id === 'filter') { filter = event.target.value; page = 1; load(); }
  if (event.target.id === 'hwpx-file') selectFile(event.target.files[0]);
});
for (const type of ['dragover', 'dragleave', 'drop']) $('#main').addEventListener(type, event => {
  const zone = event.target.closest('#drop-zone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.toggle('drag', type === 'dragover');
  if (type === 'drop' && !busy && !activeJob()) selectFile(event.dataTransfer.files[0]);
});
window.addEventListener('popstate', load);
window.addEventListener('beforeunload', event => { if (busy || dialogBusy) { event.preventDefault(); event.returnValue = ''; } });
load();
