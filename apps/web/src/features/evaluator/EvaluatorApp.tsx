import { useEffect, useState } from 'react';
import {
  publicApi, sessionApi, unwrap,
  type AccessContext, type Project, type ResultsSummary, type Sheet,
} from '../../api/client';
import { ScoreEditor, vendorName } from '../evaluations/EvaluationPage';
import './evaluator.css';

type Step = 'loading' | 'invalid' | 'verify' | 'score' | 'done';

// 세션 토큰은 탭 세션에만 둔다(sessionStorage). 사업·위원별로 분리하며 만료 시각을 함께 저장한다.
const storageKey = (projectId: string, candidateId: string) => `simsa.evaluator.${projectId}.${candidateId}`;
function readToken(projectId: string, candidateId: string): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey(projectId, candidateId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token: string; expires_at: string };
    return new Date(saved.expires_at) > new Date() ? saved.token : null;
  } catch { return null; }
}
function writeToken(projectId: string, candidateId: string, token: string, expires_at: string) {
  try { sessionStorage.setItem(storageKey(projectId, candidateId), JSON.stringify({ token, expires_at })); } catch { /* 저장 불가 환경 */ }
}
function clearToken(projectId: string, candidateId: string) {
  try { sessionStorage.removeItem(storageKey(projectId, candidateId)); } catch { /* 무시 */ }
}
function detail(result: { error?: unknown; response: Response }) {
  const err = result.error as { detail?: unknown } | undefined;
  return typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`;
}

export function EvaluatorApp() {
  const search = new URLSearchParams(window.location.search);
  const projectId = search.get('project') ?? '';
  const candidateId = search.get('candidate') ?? '';
  const [step, setStep] = useState<Step>('loading');
  const [context, setContext] = useState<AccessContext | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const params = { path: { project_id: projectId } };

  useEffect(() => { void (async () => {
    if (!projectId || !candidateId) { setStep('invalid'); setError('접근 링크에 사업과 위원 정보가 없습니다.'); return; }
    const result = await publicApi.GET('/api/v1/projects/{project_id}/evaluator-access/context', {
      params: { path: { project_id: projectId }, query: { candidate_id: candidateId } },
    });
    if (!result.response.ok || !result.data) { setStep('invalid'); setError(detail(result)); return; }
    setContext(result.data);
    const saved = readToken(projectId, candidateId);
    if (saved) {
      const me = await sessionApi(saved).GET('/api/v1/evaluator-access/me');
      if (me.response.ok) { setToken(saved); setStep('score'); return; }
      clearToken(projectId, candidateId);
    }
    setStep('verify');
  })(); }, [projectId, candidateId]);

  function expire(message: string) {
    clearToken(projectId, candidateId); setToken(''); setStep('verify'); setError(message);
  }

  return <>
    <header><span className="brand-mark">심</span><strong>제안서 평가 지원</strong>
      <span className="brand-description">{context ? `평가위원 ${context.candidate.name}` : '평가위원'}</span>
      <span className="badge">개발용 본인확인 · 실제 인증 아님</span>
    </header>
    <main className="evaluator-main">
      {context && <p className="muted">{context.project.name} · {context.project.department} · 평가기준 v{context.criteria_version}</p>}
      <div className="steps-inline" aria-label="진행 단계">
        <span className={step === 'verify' ? 'on' : ''}>① 본인확인</span><span>→</span>
        <span className={step === 'score' ? 'on' : ''}>② 평가표 작성·저장</span><span>→</span>
        <span className={step === 'done' ? 'on' : ''}>③ 확인·제출</span>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {step === 'loading' && <section className="panel">접근 정보를 확인하는 중입니다.</section>}
      {step === 'invalid' && <section className="panel"><h2>접근할 수 없습니다</h2>
        <p className="muted">간사가 보낸 접근 링크를 다시 확인하세요. 선정된 평가위원만 들어올 수 있습니다.</p></section>}
      {step === 'verify' && context && <VerifyPanel context={context} onVerified={(t, exp) => {
        writeToken(projectId, candidateId, t, exp); setToken(t); setError(''); setStep('score');
      }} />}
      {(step === 'score' || step === 'done') && token && context && <ScoreStep token={token} context={context} params={params}
        onExpired={expire} onDone={() => setStep('done')} />}
    </main>
  </>;
}

function VerifyPanel({ context, onVerified }: { context: AccessContext; onVerified: (token: string, expiresAt: string) => void }) {
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('');
  const params = { path: { project_id: context.project.id } };

  async function requestCode() {
    setBusy(true); setError('');
    const result = await publicApi.POST('/api/v1/projects/{project_id}/evaluator-access/request-code', {
      params, body: { candidate_id: context.candidate.id },
    });
    setBusy(false);
    if (!result.response.ok || !result.data) { setError(detail(result)); return; }
    setChannel(result.data.channel);
  }
  async function verify(form: HTMLFormElement) {
    form.reportValidity();
    setBusy(true); setError('');
    const result = await publicApi.POST('/api/v1/projects/{project_id}/evaluator-access/verify', {
      params, body: { candidate_id: context.candidate.id, code },
    });
    setBusy(false);
    if (!result.response.ok || !result.data) { setError(detail(result)); return; }
    onVerified(result.data.token, result.data.expires_at);
  }

  return <section className="panel">
    <h1>평가위원 본인확인</h1>
    <p className="muted">{context.candidate.name} 위원님, 간사가 안내한 6자리 인증번호를 입력하세요.</p>
    <p className="dev-note">개발용 본인확인입니다. 문자 발송 채널이 연결되기 전까지 번호는 간사가 직접 안내하며, 서버 응답에 번호가 포함되지 않습니다.</p>
    {error && <div className="error" role="alert">{error}</div>}
    <form className="form-row" onSubmit={e => { e.preventDefault(); void verify(e.currentTarget); }}>
      <label>인증번호 6자리
        <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required maxLength={6}
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy} aria-label="인증번호 6자리" />
      </label>
      <button type="button" disabled={busy} onClick={() => void requestCode()}>{channel ? '다시 요청' : '인증번호 요청'}</button>
      <button className="primary" disabled={busy || !agreed || code.length !== 6}>평가 시작하기</button>
    </form>
    {channel && <p className="muted" role="status">채널: {channel}. 안내받은 번호를 입력하세요.</p>}
    <label className="checkbox"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={busy} />
      보안 및 청렴 서약 내용을 확인했으며 동의합니다.</label>
  </section>;
}

function ScoreStep({ token, context, params, onExpired, onDone }: {
  token: string; context: AccessContext; params: { path: { project_id: string } };
  onExpired: (message: string) => void; onDone: () => void;
}) {
  const client = sessionApi(token);
  const [project, setProject] = useState<Project | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const brief = await client.GET('/api/v1/projects/{project_id}/evaluator-access/brief', { params });
    if (brief.response.status === 401) { onExpired('세션이 끝났습니다. 다시 본인확인하세요.'); return; }
    if (!brief.response.ok || !brief.data) { setError(detail(brief)); return; }
    setProject(brief.data);
    const mine = await client.GET('/api/v1/projects/{project_id}/evaluations/me', { params });
    if (mine.response.ok) { setSheet(mine.data ?? null); if (mine.data?.status === 'submitted') { onDone(); await loadSummary(); } }
  }
  async function loadSummary() {
    const result = await client.GET('/api/v1/projects/{project_id}/results/summary', { params });
    setSummary(result.response.ok && result.data ? result.data : null); // 위원장만 200, 그 외 403
  }
  useEffect(() => { void load(); }, [token]);

  async function confirm() {
    setBusy(true); setError('');
    try {
      unwrap(await client.POST('/api/v1/projects/{project_id}/results/confirm', { params }));
      await loadSummary();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  const locked = sheet?.status === 'submitted';
  return <>
    {error && <div className="error" role="alert">{error}</div>}
    {project && !locked && <>
      <h1>평가표 작성</h1>
      <p className="muted">항목마다 0점 이상 배점 이하로 입력하고 저장하세요. 모든 칸을 작성한 뒤 본인 확인에 동의하면 제출됩니다. 제출 후에는 수정할 수 없습니다.</p>
      <ScoreEditor key={context.candidate.id} memberId={context.candidate.id} project={project} client={client}
        onSubmitted={async () => { await load(); }} />
    </>}
    {project && locked && sheet && <section className="panel">
      <div className="section-heading"><h2>제출 완료</h2><span className="badge success">제출 완료 · 수정 잠금</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>제안사</th><th>작성</th><th>기술 점수 합계</th></tr></thead>
        <tbody>{project.vendor_ids.map(v => {
          const entries = sheet.scores.filter(s => s.vendor_id === v);
          return <tr key={v}><td>{vendorName(v)}</td><td>{entries.length} / {project.criteria.length}</td>
            <td>{entries.reduce((sum, s) => sum + s.score, 0).toFixed(2)}</td></tr>;
        })}</tbody>
      </table></div>
      <p>제출 시각: {sheet.submitted_at} · 확인 방식: {sheet.sign_method ?? '기록 없음'} · 기준 v{sheet.criteria_version ?? 0}</p>
      <p className="hash">평가표 SHA-256: {sheet.sheet_hash ?? '기록 없음'}</p>
      <p className="dev-note">이 기록은 본인 확인 문구 동의와 내용 해시이며 법적 전자서명이 아닙니다. 수정이 필요하면 간사에게 요청하세요.</p>
    </section>}
    {summary && <section className="panel">
      <div className="section-heading"><h2>위원장 최종 확인</h2><span className="badge">{summary.submitted} / {summary.expected} 제출</span></div>
      {summary.confirmation
        ? <p>확정 완료 · {summary.confirmation.confirmed_at}<br /><span className="hash">결과 SHA-256: {summary.confirmation.result_sha256}</span></p>
        : <>
          {summary.rankings.length
            ? <div className="table-scroll"><table><thead><tr><th>순위</th><th>제안사</th><th>기술 평균 / 80</th></tr></thead>
                <tbody>{summary.rankings.map(r => <tr key={r.vendor_id}><td>{r.rank}</td><td>{vendorName(r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td></tr>)}</tbody></table></div>
            : <p className="muted">전원 제출 후 결과가 표시됩니다.</p>}
          <ul className="notices">{summary.notices.map(n => <li key={n}>{n}</li>)}</ul>
          <button className="primary" disabled={busy || !summary.confirmable} onClick={() => void confirm()}>결과 확인·봉인</button>
        </>}
    </section>}
  </>;
}
