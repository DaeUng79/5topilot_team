import { useEffect, useState } from 'react';
import { api, evaluatorApi, unwrap, type Draw, type Project, type Results, type Score, type Sheet } from '../../api/client';

export function EvaluationPage({ project }: { project: Project }) {
  const [draw, setDraw] = useState<Draw | null>(null);
  const [memberId, setMemberId] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const params = { path: { project_id: project.id } };
  async function refreshResults() {
    setResults(unwrap(await api.GET('/api/v1/projects/{project_id}/results', { params })));
  }
  useEffect(() => { void (async () => {
    try {
      const current = unwrap(await api.GET('/api/v1/projects/{project_id}/committee/draw', { params }));
      setDraw(current); setMemberId(current?.selected_ids[0] ?? ''); await refreshResults();
    } catch (e) { setError(String(e)); }
  })(); }, [project.id]);

  return <>
    <h1>평가·제출·취합</h1><p className="muted">선정된 위원이 채점하고 제출하면 기술점수를 취합합니다.</p>
    {error && <div className="error" role="alert">{error}</div>}
    {!draw && <section className="panel">평가위원 추첨을 먼저 완료하세요.</section>}
    {draw && <>
      <section className="panel"><label>개발용 평가위원 전환<select value={memberId} onChange={e => setMemberId(e.target.value)}>
        {draw.selected_ids.map(id => <option key={id} value={id}>{draw.candidate_snapshot.find(c => c.id === id)?.name ?? id}</option>)}
      </select></label><p className="muted">전환 전 입력 내용을 저장하세요. 실제 인증·사업별 역할은 후속 구현 대상입니다.</p></section>
      {memberId && <ScoreEditor key={memberId} memberId={memberId} project={project} onSubmitted={refreshResults} />}
    </>}
    <section className="panel"><div className="section-heading"><h2>기술점수 취합</h2>
      <button onClick={() => void refreshResults().catch(e => setError(String(e)))}>취합 새로고침</button></div>
      <p>제출 현황: <strong data-testid="submission-count">{results?.submitted ?? 0} / {results?.expected ?? 0}</strong></p>
      {results?.status === 'technical_complete' ? <table><thead><tr><th>제안사</th><th>기술점수 평균 / 80</th></tr></thead>
        <tbody>{results.averages.map(r => <tr key={r.vendor_id}><td>{vendorName(r.vendor_id)}</td><td>{r.technical_average.toFixed(2)}</td></tr>)}</tbody></table>
        : <p className="muted">선정위원 전원 제출 후 평균을 표시합니다.</p>}
      <p className="muted">{results?.calculation}</p>
    </section>
  </>;
}

function vendorName(id: string) { return id.replace('vendor-', '').toUpperCase() + '사'; }

function ScoreEditor({ memberId, project, onSubmitted }: {
  memberId: string; project: Project; onSubmitted: () => Promise<void>;
}) {
  const client = evaluatorApi(memberId);
  const params = { path: { project_id: project.id } };
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [opinion, setOpinion] = useState('');
  const [attested, setAttested] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = sheet?.status === 'submitted';
  const complete = scores.length === project.vendor_ids.length * project.criteria.length;

  async function reload() {
    setBusy(true); setError('');
    try {
      const loaded = unwrap(await client.GET('/api/v1/projects/{project_id}/evaluations/me', { params }));
      setSheet(loaded); setScores(loaded?.scores ?? []); setOpinion(loaded?.opinion ?? '');
      setDirty(false); setAttested(false);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  useEffect(() => { void reload(); }, [memberId, project.id]);

  function changeScore(vendor_id: string, criterion_id: string, value: string) {
    setScores(old => [...old.filter(s => s.vendor_id !== vendor_id || s.criterion_id !== criterion_id),
      ...(value === '' ? [] : [{ vendor_id, criterion_id, score: Number(value) }])]);
    setDirty(true); setNotice(''); setAttested(false);
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = unwrap(await client.PUT('/api/v1/projects/{project_id}/evaluations/me', {
        params, body: { scores, opinion, expected_version: sheet?.version ?? 0 },
      }));
      setSheet(saved); setDirty(false); setNotice('저장되었습니다.');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function submit() {
    if (!sheet) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const submitted = unwrap(await client.POST('/api/v1/projects/{project_id}/evaluations/me/submit', {
        params, body: { expected_version: sheet.version, attested: true },
      }));
      setSheet(submitted); setNotice('제출 완료. 점수가 잠겼습니다.'); await onSubmitted();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return <section className="panel"><div className="section-heading"><h2>기술평가표</h2>
    <span className={`badge ${locked ? 'success' : ''}`}>{locked ? '제출 완료 · 수정 잠금' : dirty ? '저장하지 않은 변경' : '임시 평가표'}</span></div>
    {error && <div className="error" role="alert">{error}<button disabled={busy} onClick={() => void reload()}>서버 내용 다시 불러오기</button></div>}
    {notice && <p role="status" className="success-text">{notice}</p>}
    <div className="table-scroll"><table><thead><tr><th>평가항목</th><th>배점</th>
      {project.vendor_ids.map(id => <th key={id}>{vendorName(id)}</th>)}</tr></thead>
      <tbody>{project.criteria.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.max_score}</td>
        {project.vendor_ids.map(v => <td key={v}><input className="score" type="number" min={0} max={c.max_score} step="0.01"
          aria-label={`${vendorName(v)} ${c.name}`} disabled={busy || locked}
          value={scores.find(s => s.vendor_id === v && s.criterion_id === c.id)?.score ?? ''}
          onChange={e => changeScore(v, c.id, e.target.value)} /></td>)}</tr>)}</tbody></table></div>
    <label>평가 의견<textarea value={opinion} maxLength={4000} disabled={busy || locked} onChange={e => {
      setOpinion(e.target.value); setDirty(true); setNotice(''); setAttested(false);
    }} /></label>
    {!locked && <><div className="actions"><button className="primary" disabled={busy || !dirty} onClick={() => void save()}>평가표 저장</button>
      <span className="muted">작성 {scores.length} / {project.criteria.length * project.vendor_ids.length} · 명시적 저장 방식</span></div>
      <label className="checkbox"><input type="checkbox" checked={attested} disabled={busy || dirty || !complete || !sheet}
        onChange={e => setAttested(e.target.checked)} />본인의 판단으로 작성했으며 제출 후 수정할 수 없음을 확인합니다.</label>
      <button className="primary" disabled={busy || dirty || !complete || !attested || !sheet} onClick={() => void submit()}>최종 제출</button></>}
  </section>;
}
