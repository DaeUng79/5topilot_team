import { useEffect, useState } from 'react';
import { api, unwrap, useMock, type Project } from './api/client';
import { CommitteePage } from './features/committee/CommitteePage';
import { EvaluationPage } from './features/evaluations/EvaluationPage';

type Page = 'home' | 'committee' | 'evaluations';

export function App() {
  const [page, setPage] = useState<Page>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const project = projects.find(p => p.id === projectId);

  async function load() {
    setError('');
    try {
      const data = unwrap(await api.GET('/api/v1/projects'));
      setProjects(data);
      setProjectId(old => data.some(p => p.id === old) ? old : data[0]?.id ?? '');
    } catch (e) { setError(String(e)); }
  }
  useEffect(() => { void load(); }, []);

  async function createProject(form: HTMLFormElement) {
    setBusy(true); setError('');
    try {
      const data = new FormData(form);
      const created = unwrap(await api.POST('/api/v1/projects', {
        body: { name: String(data.get('name')), department: String(data.get('department')) },
      }));
      await load(); setProjectId(created.id); form.reset();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return <>
    <header><span className="brand-mark">심</span><strong>심사임당</strong>
      <span className="brand-description">공공 제안평가 지원</span><span className="badge">{useMock ? 'mock 데이터 모드' : '로컬 개발 모드'}</span>
    </header>
    <aside className="sidebar"><small>업무 메뉴</small>
      {([['home', '사업 관리'], ['committee', '평가위원 등록·추첨'], ['evaluations', '평가·제출·취합']] as const)
        .map(([key, title]) => <button key={key} className={page === key ? 'active' : ''}
          onClick={() => setPage(key)}>{title}</button>)}
      <a href="http://127.0.0.1:4174" target="_blank" rel="noreferrer">원본 디자인 데모 ↗</a>
      <div className="principle">판단은 사람이 합니다<p>AI는 문서의 근거를 찾고 정리하는 역할을 맡습니다.</p></div>
    </aside>
    <main>
      <div className="toolbar"><label>진행 사업 <select value={projectId} onChange={e => setProjectId(e.target.value)}>
        {!projects.length && <option value="">사업 없음</option>}
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label><button onClick={() => void load()}>새로고침</button></div>
      <p className="dev-note">테스트 데이터로 연결을 확인하는 개발 화면입니다. 계정 전환은 실제 인증이 아니며, 제출 확인은 전자서명이 아닙니다.</p>
      {error && <div className="error" role="alert">{error}<p>API 서버(127.0.0.1:8000) 실행을 확인하거나, 서버 없이 확인하려면 VITE_USE_MOCK=1로 실행하세요.</p></div>}
      {page === 'home' && <>
        <h1>사업 관리</h1><p className="muted">평가 준비부터 제출·취합까지, 한 곳에서 진행하세요.</p>
        <div className="steps">01 사업 준비 <span>→</span> 02 위원 추첨 <span>→</span> 03 평가·제출 <span>→</span> 04 기술점수 취합</div>
        <section className="panel"><h2>새 사업 등록</h2><p className="muted">초기 통합 예제는 기술항목 7개, 제안사 3개를 사용합니다.</p>
          <form className="form-row" onSubmit={e => { e.preventDefault(); void createProject(e.currentTarget); }}>
            <label>사업명<input name="name" required maxLength={200} placeholder="예: 정보시스템 구축 사업" /></label>
            <label>담당 부서<input name="department" required maxLength={100} placeholder="예: 정보화사업팀" /></label>
            <button className="primary" disabled={busy}>사업 등록</button>
          </form>
        </section>
        {project && <section className="panel"><h2>{project.name}</h2><p>{project.department} · 제안사 {project.vendor_ids.length}개 · 기술평가 80점</p>
          <div className="actions"><button className="primary" onClick={() => setPage('committee')}>위원 등록·추첨으로 이동 →</button>
            <button onClick={() => setPage('evaluations')}>평가 진행 보기</button></div>
        </section>}
      </>}
      {page !== 'home' && !project && <section className="panel">사업을 먼저 등록하세요.</section>}
      {page === 'committee' && project && <CommitteePage key={project.id} project={project} />}
      {page === 'evaluations' && project && <EvaluationPage key={project.id} project={project} />}
    </main>
  </>;
}
