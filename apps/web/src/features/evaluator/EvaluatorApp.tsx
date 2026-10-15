import { useEffect, useState } from 'react';
import {
  publicApi, sessionApi, unwrap,
  type AccessContext, type Project, type ResultsSummary, type Sheet,
} from '../../api/client';
import { ScoreEditor, maxTotal, vendorName } from '../evaluations/EvaluationPage';
import { ChairSignatureRecord, SignaturePad } from '../results/ChairSignature';
import './evaluator.css';

type Step = 'loading' | 'invalid' | 'verify' | 'score' | 'done';

// 접근 링크 화면의 세션 토큰은 탭 세션에만 둔다(sessionStorage). 사업·위원별로 분리하며 만료 시각을 함께 저장한다.
// 로그인 화면으로 들어온 세션(features/auth/session.ts)과는 키가 다르다.
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
export function detail(result: { error?: unknown; response: Response }) {
  const err = result.error as { detail?: unknown } | undefined;
  return typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`;
}

// 간사가 보낸 접근 링크(/evaluator?project=&candidate=)로 들어오는 화면. 로그인 화면과 별개로 유지한다.
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
  // 본인확인은 등록된 생년월일 6자리(YYMMDD) 대조다. 문자(SMS) 발송은 쓰지 않는다.
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const params = { path: { project_id: context.project.id } };

  async function verify(form: HTMLFormElement) {
    form.reportValidity();
    setBusy(true); setError('');
    const result = await publicApi.POST('/api/v1/projects/{project_id}/evaluator-access/verify', {
      params, body: { candidate_id: context.candidate.id, birth_date: birthDate },
    });
    setBusy(false);
    if (!result.response.ok || !result.data) { setError(detail(result)); return; }
    onVerified(result.data.token, result.data.expires_at);
  }

  return <section className="panel">
    <h1>평가위원 본인확인</h1>
    <p className="muted">{context.candidate.name} 위원님, 등록된 생년월일 6자리(YYMMDD)를 입력하세요. 예: 1987년 12월 23일생 → 871223</p>
    <p className="dev-note">생년월일은 등록 정보와 서버에서만 대조하며 응답에 포함되지 않습니다. 실제 본인인증 수단이 아닙니다. 입력이 되지 않으면 간사에게 문의하세요.</p>
    {error && <div className="error" role="alert">{error}</div>}
    <form className="form-row" onSubmit={e => { e.preventDefault(); void verify(e.currentTarget); }}>
      <label>생년월일 6자리
        <input className="code-input" inputMode="numeric" autoComplete="off" pattern="\d{6}" required maxLength={6} placeholder="YYMMDD"
          value={birthDate} onChange={e => setBirthDate(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-label="생년월일 6자리" />
      </label>
      <button className="primary" disabled={busy || !agreed || birthDate.length !== 6}>평가 시작하기</button>
    </form>
    <label className="checkbox"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={busy} />
      보안 및 청렴 서약 내용을 확인했으며 동의합니다.</label>
  </section>;
}

// 채점 단계. 접근 링크 화면과 로그인 화면(EvaluatorPages)이 같이 쓴다. standalone=false면 상위 화면이 제목을 그린다.
export function ScoreStep({ token, context, params, onExpired, onDone, standalone = true }: {
  token: string; context: AccessContext; params: { path: { project_id: string } };
  onExpired: (message: string) => void; onDone: () => void; standalone?: boolean;
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

  async function confirm(signature: string) {
    setBusy(true); setError('');
    try {
      unwrap(await client.POST('/api/v1/projects/{project_id}/results/confirm', { params, body: { reviewed: true, signature_image: signature } }));
      await loadSummary();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  const locked = sheet?.status === 'submitted';
  return <>
    {error && <div className="error" role="alert">{error}</div>}
    {project && !locked && <>
      {standalone && <>
        <h1>평가표 작성</h1>
        <p className="muted">항목마다 0점 이상 배점 이하로 입력하고 저장하세요. 모든 칸을 작성한 뒤 본인 확인에 동의하면 제출됩니다. 제출 후에는 수정할 수 없습니다.</p>
      </>}
      <ScoreEditor key={context.candidate.id} memberId={context.candidate.id} project={project} client={client}
        onSubmitted={async () => { await load(); }} />
    </>}
    {project && locked && sheet && <SubmittedSheetPanel project={project} sheet={sheet} />}
    {summary && <ChairSummaryPanel project={project ?? { vendors: [], criteria: [] }} summary={summary} busy={busy} onConfirm={s => void confirm(s)} />}
  </>;
}

// 제출 완료 뒤 본인 평가표 요약·제출 시각·확인 방식·내용 해시(서명 기록). 법적 전자서명이 아니다.
export function SubmittedSheetPanel({ project, sheet }: { project: Project; sheet: Sheet }) {
  return <section className="panel">
    <div className="section-heading"><h2>제출 완료</h2><span className="badge success">제출 완료 · 수정 잠금</span></div>
    <div className="table-scroll"><table>
      <thead><tr><th>제안사</th><th>작성</th><th>기술 점수 합계</th></tr></thead>
      <tbody>{project.vendor_ids.map(v => {
        const entries = sheet.scores.filter(s => s.vendor_id === v);
        return <tr key={v}><td>{vendorName(project, v)}</td><td>{entries.length} / {project.criteria.length}</td>
          <td>{entries.reduce((sum, s) => sum + s.score, 0).toFixed(2)}</td></tr>;
      })}</tbody>
    </table></div>
    <p>제출 시각: {sheet.submitted_at} · 확인 방식: {sheet.sign_method ?? '기록 없음'} · 기준 v{sheet.criteria_version ?? 0}</p>
    <p className="hash">평가표 SHA-256: {sheet.sheet_hash ?? '기록 없음'}</p>
    <p className="dev-note">이 기록은 본인 확인 문구 동의와 내용 해시이며 법적 전자서명이 아닙니다. 수정이 필요하면 간사에게 요청하세요.</p>
  </section>;
}

const MEMBER_LABEL = { none: '미작성', draft: '작성 중', submitted: '제출 · 서명' } as const;

// 위원장 최종 확인·서명(결과 봉인). results/summary가 200으로 오는 위원장(사업관리자가 추첨 결과의 본위원 중 지정)에게만 보인다.
// 전체 위원 제출·서명 현황과 업체별 집계를 확인했다는 동의와 자필 서명이 모두 있어야 확정할 수 있다. 서명 이미지는 서버가
// 확정 기록과 함께 저장하며, 법적 효력이 있는 전자서명이 아니다(로컬 시연용).
export function ChairSummaryPanel({ project, summary, busy, onConfirm }: {
  project: Pick<Project, 'vendors' | 'criteria'>; summary: ResultsSummary; busy: boolean; onConfirm: (signature: string) => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const chairName = summary.members.find(m => m.is_chair)?.name ?? summary.chair_id ?? '';
  return <section className="panel">
    <div className="section-heading"><h2>위원장 최종 확인</h2><span className="badge">{summary.submitted} / {summary.expected} 제출</span></div>
    {summary.confirmation
      ? <ChairSignatureRecord confirmation={summary.confirmation} chairName={chairName} />
      : <>
        <h3>평가위원 제출·서명 현황</h3>
        <div className="table-scroll"><table><thead><tr><th>평가위원</th><th>상태</th><th>제출·서명 시각</th></tr></thead>
          <tbody>{summary.members.map(m => <tr key={m.evaluator_id}><td>{m.name}{m.is_chair ? ' (위원장)' : ''}</td>
            <td>{MEMBER_LABEL[m.status]}</td><td>{m.signed_at ?? '—'}</td></tr>)}</tbody></table></div>
        <h3>업체별 집계 결과</h3>
        {summary.rankings.length
          ? <div className="table-scroll"><table><thead><tr><th>순위</th><th>제안사</th><th>기술 평균 / {maxTotal(project)}</th></tr></thead>
              <tbody>{summary.rankings.map(r => <tr key={r.vendor_id}><td>{r.rank}</td><td>{vendorName(project, r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td></tr>)}</tbody></table></div>
          : <p className="muted">전원 제출 후 결과가 표시됩니다.</p>}
        <ul className="notices">{summary.notices.map(n => <li key={n}>{n}</li>)}</ul>
        <h3>평가위원장 서명</h3>
        <p>서명자: <strong>{chairName}</strong> <span className="muted">(지정된 평가위원장 · 서명 일시는 확정 시 서버가 기록)</span></p>
        <SignaturePad disabled={busy || !summary.confirmable} onChange={setSignature} />
        <label className="checkbox"><input type="checkbox" checked={reviewed} disabled={busy || !summary.confirmable} onChange={e => setReviewed(e.target.checked)} />
          평가결과를 확인하였습니다. 전체 평가위원의 제출·서명 내역과 업체별 집계 결과를 검토했으며, 확정 뒤에는 평가결과를 수정할 수 없음을 이해합니다.</label>
        <button className="primary" disabled={busy || !summary.confirmable || !reviewed || !signature}
          onClick={() => { if (signature) onConfirm(signature); }}>최종 서명 및 평가결과 확정</button>
        {!summary.confirmable && <p className="muted">전원 제출 뒤에 서명할 수 있습니다.</p>}
        <p className="dev-note">서명은 화면에서 작성한 자필 서명 이미지와 확인 동의 기록이며 법적 효력이 있는 전자서명이 아닙니다(로컬 시연용). 서명 이미지·일시·대상 결과 해시는 서버에 함께 저장됩니다.</p>
      </>}
  </section>;
}
