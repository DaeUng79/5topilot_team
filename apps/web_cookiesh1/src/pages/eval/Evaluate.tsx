import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router';
import { api, ApiError, describeError, request, unwrap, type Score, type Sheet } from '../../api/client';
import type { Evidence, Match } from '../../api/contract';
import { clearDraft, readDraft, writeDraft, type Draft } from '../../lib/draft';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';
import { formatDateTime, formatScore, formatTime, pageLabel, vendorName } from '../../lib/format';
import { Async } from '../../ui/states';
import { Badge, Card, Dialog, Notice, VendorDot, VendorLabel, useToast } from '../../ui/ui';
import { EvidenceDrawer } from './EvidenceDrawer';
import { useEval } from './EvalProject';

type Cells = Record<string, string>;
const cellKey = (v: string, c: string) => `${v}:${c}`;
const toCells = (scores: Score[]): Cells => Object.fromEntries(scores.map(s => [cellKey(s.vendor_id, s.criterion_id), String(s.score)]));

// 근거 열람 기록: 이 브라우저(세션)에만 남고 서버로 보내지 않습니다.
export const seenKey = (e: Evidence) => `${e.document_id}#${e.block_id}`;
const seenStore = (pid: string, uid: string) => `simsa-seen:${pid}:${uid}`;
export function readSeen(pid: string, uid: string): Set<string> {
  try { return new Set<string>(JSON.parse(sessionStorage.getItem(seenStore(pid, uid)) ?? '[]')); } catch { return new Set(); }
}
const GRADES = [['탁월', 1], ['우수', 0.9], ['보통', 0.8], ['미흡', 0.7], ['불량', 0.6]] as const;

type SaveState = { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'failed'; error: unknown } | { kind: 'invalid'; message: string };

export function EvaluatePage() {
  const { project } = useEval();
  const load = useLoad(async () => {
    const [sheet, matches] = await Promise.all([
      api.GET('/api/v1/projects/{project_id}/evaluations/me', { params: { path: { project_id: project.id } } }).then(unwrap),
      request<Match[]>('GET', `/api/v1/projects/${project.id}/matches`),
    ]);
    return { sheet, matches };
  }, [project.id]);
  return <Async load={load} loadingLabel="평가표를 불러오는 중">
    {({ sheet, matches }) => <Editor key={sheet?.version ?? 0} initial={sheet} matches={matches} />}
  </Async>;
}

function Editor({ initial, matches }: { initial: Sheet | null; matches: Match[] }) {
  const { project, criteria } = useEval();
  const { session } = useSession();
  const userId = session!.user_id;
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'table' ? 'table' : 'criterion';
  const [sheet, setSheet] = useState(initial);
  const [cells, setCells] = useState<Cells>(() => toCells(initial?.scores ?? []));
  const [opinion, setOpinion] = useState(initial?.opinion ?? '');
  const [state, setState] = useState<SaveState>({ kind: 'clean' });
  const [savedAt, setSavedAt] = useState<string | null>((initial as (Sheet & { updated_at?: string }) | null)?.updated_at ?? null);
  const [restore, setRestore] = useState<Draft | null>(() => {
    const d = readDraft(project.id, userId);
    if (!d || initial?.status === 'submitted') return null;
    const same = JSON.stringify(toCells(d.scores)) === JSON.stringify(toCells(initial?.scores ?? [])) && d.opinion === (initial?.opinion ?? '');
    if (same) { clearDraft(project.id, userId); return null; }
    return d;
  });
  const [conflict, setConflict] = useState<Sheet | null>(null);
  const toast = useToast();
  const [seen, setSeen] = useState(() => readSeen(project.id, userId));
  const [drawer, setDrawer] = useState<Evidence | null>(null);
  const [nonce, setNonce] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  function openEvidence(e: Evidence, from: HTMLElement) {
    if (!drawer) opener.current = from;
    setDrawer(e); setNonce(n => n + 1);
    setSeen(old => {
      const next = new Set(old).add(seenKey(e));
      try { sessionStorage.setItem(seenStore(project.id, userId), JSON.stringify([...next])); } catch { /* 저장소를 못 써도 화면은 동작 */ }
      return next;
    });
  }
  function closeEvidence() { setDrawer(null); const el = opener.current; opener.current = null; setTimeout(() => el?.focus(), 0); }
  const chip = (e: Evidence, text: string) => <button key={e.block_id} type="button" aria-haspopup="dialog"
    className={`chip ${e.physical_page === null ? 'warn' : ''} ${seen.has(seenKey(e)) ? 'seen' : ''}`}
    onClick={ev => openEvidence(e, ev.currentTarget)}>{text}</button>;
  const locked = sheet?.status === 'submitted';
  const dirty = state.kind !== 'clean' && state.kind !== 'saving';
  const crit = project.criteria;
  const idx = Math.min(Math.max(Number(params.get('c') ?? 0), 0), crit.length - 1);
  // 기준 항목이나 보기가 바뀌면 근거 서랍을 닫아요.
  useEffect(() => { if (drawer) closeEvidence(); }, [idx, view]);

  // 칸별 검증 (서버도 같은 규칙으로 검증합니다: EVAL-01)
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of crit) for (const v of project.vendor_ids) {
      const raw = cells[cellKey(v, c.id)];
      if (raw === undefined || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) out[cellKey(v, c.id)] = '숫자를 입력하세요';
      else if (n < 0 || n > c.max_score) out[cellKey(v, c.id)] = `0~${c.max_score}점`;
      else if (Math.round(n * 100) !== n * 100) out[cellKey(v, c.id)] = '소수점 둘째 자리까지';
    }
    return out;
  }, [cells, crit, project.vendor_ids]);
  const scores: Score[] = useMemo(() => Object.entries(cells).filter(([k, raw]) => raw !== '' && !errors[k])
    .map(([k, raw]) => { const [vendor_id, criterion_id] = k.split(':'); return { vendor_id, criterion_id, score: Number(raw) }; }), [cells, errors]);
  const totalCells = crit.length * project.vendor_ids.length;
  const filled = (v: string, c: string) => { const raw = cells[cellKey(v, c)]; return raw !== undefined && raw !== '' && !errors[cellKey(v, c)]; };

  // 입력할 때마다 임시보관(EVAL-04)
  useEffect(() => {
    if (!dirty || locked) return;
    writeDraft(project.id, userId, { base_version: sheet?.version ?? 0, scores, opinion });
  }, [scores, opinion, dirty]);

  // 저장하지 않고 떠나기 경고
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  function edit(v: string, c: string, raw: string) {
    setCells(old => ({ ...old, [cellKey(v, c)]: raw })); setState({ kind: 'dirty' });
  }

  async function save(expected = sheet?.version ?? 0) {
    if (Object.keys(errors).length) { setState({ kind: 'invalid', message: `범위를 벗어난 점수가 ${Object.keys(errors).length}칸 있어요. 고친 뒤 저장해 주세요.` }); return; }
    setState({ kind: 'saving' });
    try {
      const saved = unwrap(await api.PUT('/api/v1/projects/{project_id}/evaluations/me', {
        params: { path: { project_id: project.id } }, body: { scores, opinion, expected_version: expected } }));
      setSheet(saved); setSavedAt(new Date().toISOString()); clearDraft(project.id, userId); setState({ kind: 'clean' }); toast('저장했어요');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const server = unwrap(await api.GET('/api/v1/projects/{project_id}/evaluations/me', { params: { path: { project_id: project.id } } }));
          if (server?.status === 'submitted') { applyServer(server); return; }
          // 버전이 달라졌을 때만 충돌 비교를 엽니다. 그 밖의 409(기준 미확정 등)는 메시지로 보여 줍니다.
          if (server && server.version !== expected) { setConflict(server); setState({ kind: 'dirty' }); return; }
        } catch { /* 재조회 실패 시 원래 오류를 표시 */ }
      }
      setState({ kind: 'failed', error: e });
    }
  }

  function applyServer(server: Sheet) {
    setSheet(server); setCells(toCells(server.scores)); setOpinion(server.opinion); clearDraft(project.id, userId);
    setConflict(null); setState({ kind: 'clean' });
  }

  const c = crit[idx];
  const detail = criteria.items.find(x => x.id === c?.id);
  const done = Object.keys(cells).filter(k => filled(...(k.split(':') as [string, string]))).length;

  return <div className={`evaluate${drawer ? ' has-drawer' : ''}`}>
    {restore && <Notice tone="warning" role="alert" title={`저장하지 않은 입력이 있어요 (${formatDateTime(restore.saved_at)} 임시보관)`}>
      {restore.base_version !== (sheet?.version ?? 0) && <p>그 사이 서버 내용이 바뀌었어요. 복원한 뒤 저장하면 충돌 확인 화면이 열립니다.</p>}
      <div className="row">
        <button className="btn primary sm" onClick={() => { setCells(toCells(restore.scores)); setOpinion(restore.opinion); setRestore(null); setState({ kind: 'dirty' }); }}>복원</button>
        <button className="btn sm" onClick={() => { clearDraft(project.id, userId); setRestore(null); }}>버리기</button>
      </div>
    </Notice>}
    {locked && <Notice tone="success" title={`${formatDateTime(sheet?.submitted_at)}에 제출한 평가표입니다.`}>제출 후에는 수정할 수 없어요. 수정이 필요하면 간사에게 요청해 주세요.</Notice>}

    <div className="row between">
      <div className="segmented" role="group" aria-label="보기 방식">
        <button className={view === 'criterion' ? 'active' : ''} aria-pressed={view === 'criterion'} onClick={() => setParams({ c: String(idx) }, { replace: true })}>평가기준별</button>
        <button className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} onClick={() => setParams({ view: 'table' }, { replace: true })}>전체 점수표</button>
      </div>
      <span className="muted">입력 {done} / {totalCells} · 0점도 유효한 점수입니다</span>
    </div>

    {view === 'criterion' && c ? <div className="eval-grid">
      <div className="crit-side">
        <div className="mini-matrix" role="group" aria-label="입력 현황 (제안사별 · 평가항목별)" style={{ '--cols': project.vendor_ids.length } as CSSProperties}>
          <span aria-hidden="true" />{project.vendor_ids.map(v => <span key={v} className="mm-head"><VendorDot id={v} /></span>)}
          {crit.map((x, i) => <Fragment key={x.id}>
            <span className={`mm-row ${i === idx ? 'cur' : ''}`} aria-hidden="true">{i + 1}</span>
            {project.vendor_ids.map(v => {
              const k = cellKey(v, x.id);
              const st = errors[k] ? 'error' : filled(v, x.id) ? 'ok' : 'empty';
              return <button key={v} type="button" className={`mm-cell ${st} ${i === idx ? 'cur' : ''}`} aria-current={i === idx ? 'step' : undefined}
                aria-label={`${vendorName(v)} · ${x.name}: ${st === 'ok' ? '입력됨' : st === 'error' ? '값 오류' : '비어 있음'}`}
                onClick={() => setParams({ c: String(i) }, { replace: true })}><span aria-hidden="true">{st === 'ok' ? '✓' : st === 'error' ? '!' : ''}</span></button>;
            })}
          </Fragment>)}
        </div>
        <p className="mm-legend" aria-hidden="true">✓ 입력됨 · ! 값 오류 · 빈칸 미입력</p>
      <nav className="crit-nav" aria-label="평가항목">{crit.map((x, i) => {
        const n = project.vendor_ids.filter(v => filled(v, x.id)).length;
        return <button key={x.id} className={i === idx ? 'active' : ''} aria-current={i === idx ? 'step' : undefined}
          onClick={() => setParams({ c: String(i) }, { replace: true })}>
          <span className={`crit-check ${n === project.vendor_ids.length ? 'done' : ''}`} aria-hidden="true">{n === project.vendor_ids.length ? '✓' : i + 1}</span>
          <span className="crit-name">{x.name}<small>{x.max_score}점 · {n}/{project.vendor_ids.length}</small></span>
        </button>;
      })}</nav>
      </div>
      <section className="crit-panel" aria-labelledby="crit-title">
        <Card>
          <div className="eyebrow">{detail?.area} · 평가항목 {idx + 1}/{crit.length}</div>
          <h2 id="crit-title">{c.name} <span className="muted">배점 {c.max_score}점</span></h2>
          {detail && <div className="rfp-criterion"><strong>평가 기준 (제안요청서)</strong><p>{detail.description}</p>
            <div className="chips">{detail.evidence.map(e => chip(e, `제안요청서 ${pageLabel(e.physical_page, e.printed_page)}`))}</div></div>}
        </Card>
        <div className="vendor-cols">{project.vendor_ids.map(v => {
          const m = matches.find(x => x.vendor_id === v && x.criterion_id === c.id);
          const k = cellKey(v, c.id);
          const unseen = filled(v, c.id) && !!m?.evidence.length && !m.evidence.some(e => seen.has(seenKey(e)));
          return <Card key={v} className="vendor-col">
            <div className="score-block">
              <label className="field score-field"><span className="vendor-name"><VendorLabel id={v} /></span>
                <span className="score-wrap"><input type="number" inputMode="decimal" min={0} max={c.max_score} step="0.5" value={cells[k] ?? ''}
                  disabled={locked} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-err` : undefined}
                  onChange={e => edit(v, c.id, e.target.value)} /><span>/ {c.max_score}</span></span>
                {errors[k] && <span id={`${k}-err`} className="field-error">✕ {errors[k]}</span>}
              </label>
              {unseen && <span className="unseen-hint" title="근거를 열어 보지 않고 점수를 입력했어요. 이 표시는 이 브라우저에만 있고 서버에 저장되지 않아요.">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.2 3.7M6.5 7.5C4 9.2 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.8-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                근거 미열람</span>}
              {import.meta.env.VITE_USE_MOCK === '1' && <div className="grade-quick" role="group" aria-label={`${vendorName(v)} 빠른 입력`}>
                <div className="grade-btns">{GRADES.map(([label, p]) => {
                  const pts = Math.round(c.max_score * p * 100) / 100;
                  return <button key={label} type="button" disabled={locked} aria-pressed={cells[k] !== undefined && cells[k] !== '' && Number(cells[k]) === pts}
                    onClick={() => edit(v, c.id, String(pts))}>{label}<small>{pts}</small></button>;
                })}</div>
                <span className="grade-caption">빠른 입력 · 정책 미확정(mock 가정)</span>
              </div>}
            </div>
            <div className="match">
              <strong className="small">제안서에서 찾은 내용</strong>
              {m?.summary ? <><p>{m.summary}</p><div className="chips">{m.evidence.map(e => chip(e, pageLabel(e.physical_page, e.printed_page)))}</div></>
                : <Badge tone="warning">근거 확인 필요 — 관련 내용을 찾지 못했어요. 원문을 직접 확인해 주세요.</Badge>}
            </div>
          </Card>;
        })}</div>
        <div className="row between">
          <button className="btn" disabled={idx === 0} onClick={() => setParams({ c: String(idx - 1) }, { replace: true })}>‹ 이전 항목</button>
          <button className="btn" disabled={idx === crit.length - 1} onClick={() => setParams({ c: String(idx + 1) }, { replace: true })}>다음 항목 ›</button>
        </div>
      </section>
    </div> : <Card title="전체 점수표">
      <div className="table-wrap"><table className="table score-table">
        <thead><tr><th>평가항목</th><th className="num">배점</th>{project.vendor_ids.map(v => <th key={v} className="num"><VendorLabel id={v} /></th>)}</tr></thead>
        <tbody>{crit.map(x => <tr key={x.id}><td>{x.name}</td><td className="num">{x.max_score}</td>
          {project.vendor_ids.map(v => { const k = cellKey(v, x.id); return <td key={v} className="num">
            <input className="score-input" type="number" min={0} max={x.max_score} step="0.5" value={cells[k] ?? ''} disabled={locked}
              aria-label={`${vendorName(v)} ${x.name}`} aria-invalid={!!errors[k]} title={errors[k]} onChange={e => edit(v, x.id, e.target.value)} />
          </td>; })}</tr>)}</tbody>
        <tfoot><tr><td>기술 점수 소계</td><td className="num">{crit.reduce((a, x) => a + x.max_score, 0)}</td>
          {project.vendor_ids.map(v => <td key={v} className="num"><strong>{formatScore(scores.filter(s => s.vendor_id === v).reduce((a, s) => a + s.score, 0))}</strong></td>)}</tr></tfoot>
      </table></div>
    </Card>}

    <Card title="평가 의견 (선택)">
      <label className="field"><span className="sr-only">평가 의견</span>
        <textarea value={opinion} maxLength={4000} disabled={locked} placeholder="평가 근거나 보완이 필요한 사항을 적어 주세요"
          onChange={e => { setOpinion(e.target.value); setState({ kind: 'dirty' }); }} /></label>
    </Card>

    <SaveBar state={state} locked={locked} savedAt={savedAt}
      changed={dirty} onSave={() => void save()} />

    {drawer && <EvidenceDrawer projectId={project.id} evidence={drawer} nonce={nonce} onClose={closeEvidence} />}

    <Dialog open={!!conflict} onClose={() => setConflict(null)} title="다른 곳에서 먼저 저장된 내용이 있어요" actions={conflict && <>
      <button className="btn" onClick={() => applyServer(conflict)}>서버 값 사용 (내 입력 버림)</button>
      <button className="btn primary" onClick={() => { setSheet(conflict); setConflict(null); void save(conflict.version); }}>내 입력으로 다시 저장</button></>}>
      {conflict && <ConflictDiff mine={{ cells, opinion }} server={conflict} />}
    </Dialog>
    <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="저장하지 않은 변경이 있어요" actions={<>
      <button className="btn" onClick={() => blocker.proceed?.()}>그냥 이동</button>
      <button className="btn primary" onClick={() => blocker.reset?.()}>머무르기</button></>}>
      <p>입력한 내용은 이 브라우저에 임시보관되어, 다시 돌아오면 복원할 수 있어요. 서버에는 저장되지 않았습니다.</p>
    </Dialog>
  </div>;
}

function SaveBar({ state, locked, savedAt, changed, onSave }: { state: SaveState; locked: boolean; savedAt: string | null; changed: boolean; onSave: () => void }) {
  const text = locked ? { tone: 'success', msg: '제출 완료 · 수정 잠금' }
    : state.kind === 'saving' ? { tone: 'info', msg: '서버에 저장하는 중…' }
      : state.kind === 'failed' ? { tone: 'danger', msg: state.error instanceof ApiError && [403, 409, 422].includes(state.error.status)
        ? `저장 안 됨 — ${state.error.message}`
        : `저장 안 됨 — ${describeError(state.error).title}. 입력은 이 브라우저에 임시보관되어 있어요.` }
        : state.kind === 'invalid' ? { tone: 'danger', msg: state.message }
          : changed ? { tone: 'warning', msg: '저장하지 않은 변경이 있어요 (임시보관 중)' }
            : { tone: 'success', msg: savedAt ? `서버에 저장됨 · ${formatTime(savedAt)}` : '아직 저장한 내용이 없어요' };
  const off = state.kind === 'saving' || (!changed && state.kind !== 'failed');
  return <div className={`save-bar tone-${text.tone}`}>
    <span role="status" aria-live="polite" className="save-msg">{text.msg}</span>
    {!locked && <div className="row">
      <button className="btn primary" aria-disabled={off} onClick={() => { if (!off) onSave(); }}>
        {state.kind === 'failed' ? '다시 시도' : '저장'}</button>
      <Link className="btn" to="../submit">제출 전 확인 ›</Link>
    </div>}
  </div>;
}

function ConflictDiff({ mine, server }: { mine: { cells: Cells; opinion: string }; server: Sheet }) {
  const { project } = useEval();
  const theirs = toCells(server.scores);
  const rows = project.criteria.flatMap(c => project.vendor_ids.map(v => ({ c, v, k: cellKey(v, c.id) })))
    .filter(r => (mine.cells[r.k] ?? '') !== (theirs[r.k] ?? ''));
  return <>
    <p>서버에 저장된 평가표(v{server.version})와 지금 입력이 다른 칸입니다. 어느 쪽을 쓸지 고르세요.</p>
    {rows.length ? <div className="table-wrap small-table"><table className="table">
      <thead><tr><th>항목</th><th>제안사</th><th className="num">내 입력</th><th className="num">서버 값</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.k}><td>{r.c.name}</td><td><VendorLabel id={r.v} /></td>
        <td className="num"><strong>{mine.cells[r.k] || '-'}</strong></td><td className="num">{theirs[r.k] ?? '-'}</td></tr>)}</tbody>
    </table></div> : <p className="muted">점수는 같습니다.</p>}
    {mine.opinion !== server.opinion && <p className="muted">평가 의견도 서로 다릅니다.</p>}
  </>;
}
