import { useEffect, useState } from 'react';
import { api, unwrap, type Project, type SessionRead } from './api/client';
import { CommitteePage } from './features/committee/CommitteePage';
import { EvaluationPage, maxTotal } from './features/evaluations/EvaluationPage';
import { ResultsPage } from './features/results/ResultsPage';
import { EvaluationSetupPage } from './features/projects/EvaluationSetupPage';
import { LoginPage } from './features/auth/LoginPage';
import { ROLE_LABEL, clearSession, restoreSession, saveSession, type StoredSession } from './features/auth/session';
import { EvaluatorResultsPage, EvaluatorScorePage } from './features/evaluator/EvaluatorPages';

type Page = 'home' | 'committee' | 'evaluations' | 'results';
type DetailTab = 'overview' | 'setup'; // 사업 상세 패널의 탭
// 권한별 메뉴. 메뉴를 숨기는 것은 편의이고 실제 차단은 API(require_admin·require_project_role)가 한다.
const MENUS: Record<'admin' | 'evaluator', readonly (readonly [Page, string])[]> = {
  admin: [['home', '사업 관리'], ['committee', '평가위원 등록·추첨'], ['evaluations', '평가·제출·취합'], ['results', '결과·서명·리포트']],
  evaluator: [['evaluations', '평가·제출·취합'], ['results', '결과·서명·리포트']],
};
const EXPIRED = '세션이 만료되었습니다. 다시 로그인하세요.';

// 로그인 게이트. 저장된 세션이 있으면 서버(/evaluator-access/me)로 권한을 다시 확인한 뒤 화면을 연다.
export function App() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginNotice, setLoginNotice] = useState('');

  useEffect(() => { void (async () => {
    const saved = restoreSession();
    if (!saved) { setChecking(false); return; }
    const me = await api.GET('/api/v1/evaluator-access/me');
    if (me.response.ok && me.data) setSession({ ...saved, actor: me.data });
    else { clearSession(); if (me.response.status === 401) setLoginNotice(EXPIRED); }
    setChecking(false);
  })(); }, []);

  function login(result: SessionRead) { setSession(saveSession(result)); setLoginNotice(''); }
  function logout(message = '') { clearSession(); setSession(null); setLoginNotice(message); }

  if (checking) return <main className="login-main"><section className="panel">로그인 상태를 확인하는 중입니다.</section></main>;
  if (!session) return <LoginPage onLogin={login} notice={loginNotice} />;
  return <Workspace key={`${session.actor.role}:${session.actor.id}`} session={session} onLogout={logout} />;
}

function Workspace({ session, onLogout }: { session: StoredSession; onLogout: (message?: string) => void }) {
  const role = session.actor.role;
  const [page, setPage] = useState<Page>(role === 'admin' ? 'home' : 'evaluations');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const project = projects.find(p => p.id === projectId);

  async function load() {
    setError('');
    try {
      // 관리자는 전체 사업, 평가위원은 본위원으로 선정된 사업만 서버가 돌려준다.
      const result = role === 'admin' ? await api.GET('/api/v1/projects') : await api.GET('/api/v1/evaluator-access/projects');
      if (result.response.status === 401) { onLogout(EXPIRED); return; }
      const data = unwrap(result);
      setProjects(data);
      setProjectId(old => data.some(p => p.id === old) ? old : data[0]?.id ?? '');
    } catch (e) { setError(String(e)); } finally { setLoaded(true); }
  }
  useEffect(() => { void load(); }, []);

  async function createProject(form: HTMLFormElement) {
    setBusy(true); setError('');
    try {
      const data = new FormData(form);
      const created = unwrap(await api.POST('/api/v1/projects', {
        body: {
          name: String(data.get('name')), department: String(data.get('department')),
          technical_total_score: Number(data.get('technical_total_score')),
          criteria_source: data.get('criteria_source') === 'empty' ? 'empty' : 'template',
        },
      }));
      await load(); setProjectId(created.id); form.reset();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return <>
    <header><span className="brand-mark">심</span><strong>심사임당</strong>
      <span className="brand-description">공공 제안평가 지원</span>
      <div className="user-box"><span className="badge">로컬 개발 모드</span>
        <span data-testid="user-box"><strong>{session.actor.name ?? session.actor.id}</strong> · {ROLE_LABEL[role]}</span>
        <button type="button" onClick={() => onLogout()}>로그아웃</button></div>
    </header>
    <aside className="sidebar"><small>업무 메뉴</small>
      {MENUS[role].map(([key, title]) => <button key={key} className={page === key ? 'active' : ''}
        onClick={() => setPage(key)}>{title}</button>)}
      {role === 'admin' && <a href="http://127.0.0.1:4174" target="_blank" rel="noreferrer">원본 디자인 데모 ↗</a>}
      <div className="principle">판단은 사람이 합니다<p>AI는 문서의 근거를 찾고 정리하는 역할을 맡습니다.</p></div>
    </aside>
    <main>
      <div className="toolbar"><label>{role === 'admin' ? '진행 사업' : '배정된 사업'} <select value={projectId} onChange={e => setProjectId(e.target.value)}>
        {!projects.length && <option value="">사업 없음</option>}
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label><button onClick={() => void load()}>새로고침</button></div>
      <p className="dev-note">{role === 'admin'
        ? '테스트 데이터로 연결을 확인하는 개발 화면입니다. 로그인은 로컬 시연용 계정이며 실제 기관 인증이 아닙니다. 제출 확인은 전자서명이 아닙니다.'
        : '본인확인은 등록된 생년월일 대조이며 실제 본인인증 수단이 아닙니다. 제출 확인은 전자서명이 아닙니다.'}</p>
      {error && <div className="error" role="alert">{error}<p>API 실행 및 apps/api/.env 설정을 확인하세요.</p></div>}
      {role === 'admin' && <>
        {page === 'home' && <>
          <h1>사업 관리</h1><p className="muted">평가 준비부터 제출·취합까지, 한 곳에서 진행하세요.</p>
          <div className="steps">01 사업 준비 <span>→</span> 02 위원 추첨 <span>→</span> 03 평가·제출 <span>→</span> 04 기술점수 취합</div>
          <section className="panel"><h2>새 사업 등록</h2><p className="muted">샘플 평가항목(7개, 합계 100점)을 복사하거나 빈 평가표로 시작할 수 있습니다. 제안사 3개가 기본으로 들어가며, 사업 상세의 '평가 설정' 탭에서 평가항목·업체·총배점을 바꾸거나 제안요청서 파싱 결과를 반영합니다.</p>
            <form className="form-row" onSubmit={e => { e.preventDefault(); void createProject(e.currentTarget); }}>
              <label>사업명<input name="name" required maxLength={200} placeholder="예: 정보시스템 구축 사업" /></label>
              <label>담당 부서<input name="department" required maxLength={100} placeholder="예: 정보화사업팀" /></label>
              <label>기술평가 총배점<input name="technical_total_score" type="number" required min={1} max={1000} step={1} defaultValue={100} /></label>
              <label>평가항목 시작<select name="criteria_source" defaultValue="template">
                <option value="template">샘플 평가항목 복사 (7개)</option>
                <option value="empty">빈 평가표 (직접 입력·제안요청서 반영)</option>
              </select></label>
              <button className="primary" disabled={busy}>사업 등록</button>
            </form>
          </section>
          {project && <section className="panel">
            <div className="section-heading"><h2>{project.name}</h2>
              <div className="tabs" role="tablist" aria-label="사업 상세">
                {([['overview', '개요'], ['setup', '평가 설정']] as const).map(([key, title]) =>
                  <button key={key} type="button" role="tab" aria-selected={detailTab === key} className={detailTab === key ? 'active' : ''}
                    onClick={() => setDetailTab(key)}>{title}</button>)}
              </div></div>
            <p>{project.department} · 제안사 {project.vendors.length}개 · 평가항목 {project.criteria.length}개 · 기술평가 {maxTotal(project)}점 / 총배점 {project.technical_total_score}점
              {maxTotal(project) !== project.technical_total_score && <span className="error-text"> (평가 시작 전 배점 합계를 총배점과 맞춰야 합니다)</span>}</p>
            {detailTab === 'overview' && <div className="actions"><button className="primary" onClick={() => setPage('committee')}>위원 등록·추첨으로 이동 →</button>
              <button onClick={() => setPage('evaluations')}>평가 진행 보기</button></div>}
          </section>}
          {project && detailTab === 'setup' && <EvaluationSetupPage key={project.id} project={project} onChanged={load} />}
        </>}
        {page !== 'home' && !project && <section className="panel">사업을 먼저 등록하세요.</section>}
        {page === 'committee' && project && <CommitteePage key={project.id} project={project} />}
        {page === 'evaluations' && project && <EvaluationPage key={project.id} project={project} />}
        {page === 'results' && project && <ResultsPage key={project.id} project={project} />}
      </>}
      {role === 'evaluator' && <>
        {loaded && !projects.length && <section className="panel"><h2>배정된 평가 사업이 없습니다</h2>
          <p className="muted">추첨으로 선정된 사업이 생기면 여기에 표시됩니다. 담당자에게 문의하세요.</p></section>}
        {page === 'evaluations' && project && <EvaluatorScorePage key={project.id} session={session} project={project} onExpired={onLogout} />}
        {page === 'results' && project && <EvaluatorResultsPage key={project.id} session={session} project={project} onExpired={onLogout} />}
      </>}
    </main>
  </>;
}
