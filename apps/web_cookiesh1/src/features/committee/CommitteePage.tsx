import { useEffect, useState } from 'react';
import { api, unwrap, type Candidate, type Draw, type Project } from '../../api/client';

export function CommitteePage({ project }: { project: Project }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [seats, setSeats] = useState(2);
  const [reserves, setReserves] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = { path: { project_id: project.id } };

  async function load() {
    const [candidateResult, drawResult] = await Promise.all([
      api.GET('/api/v1/committee/candidates'),
      api.GET('/api/v1/projects/{project_id}/committee/draw', { params }),
    ]);
    setCandidates(unwrap(candidateResult)); setDraw(unwrap(drawResult));
  }
  useEffect(() => { void load().catch(e => setError(String(e))); }, [project.id]);

  async function register(form: HTMLFormElement) {
    setBusy(true); setError('');
    try {
      const data = new FormData(form);
      unwrap(await api.POST('/api/v1/committee/candidates', { body: {
        name: String(data.get('name')), organization: String(data.get('organization')),
        specialty: String(data.get('specialty')),
      } }));
      form.reset(); await load();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function conductDraw() {
    setBusy(true); setError('');
    try {
      const result = unwrap(await api.POST('/api/v1/projects/{project_id}/committee/draw', {
        params, body: { candidate_ids: pool, seats, reserves },
      }));
      setDraw(result);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return <>
    <h1>평가위원 등록·추첨</h1><p className="muted">후보를 등록하고, 검토한 모집단에서 본위원과 예비위원을 선정합니다.</p>
    {error && <div role="alert" className="error">{error}</div>}
    <section className="panel"><h2>평가위원 후보 등록</h2>
      <form className="form-row" onSubmit={e => { e.preventDefault(); void register(e.currentTarget); }}>
        <label>이름<input name="name" required maxLength={100} /></label>
        <label>소속<input name="organization" required maxLength={200} /></label>
        <label>전문분야<input name="specialty" required maxLength={100} /></label>
        <button className="primary" disabled={busy}>후보 등록</button>
      </form>
    </section>
    <section className="panel"><div className="section-heading"><h2>후보 목록 <span className="count">{candidates.length}</span></h2>
      <button disabled={!!draw || busy} onClick={() => { setPool(candidates.filter(c => c.active).map(c => c.id)); setReviewed(false); }}>활성 후보 모두 선택</button></div>
      <div className="table-scroll"><table><thead><tr><th>포함</th><th>이름</th><th>소속</th><th>전문분야</th></tr></thead>
        <tbody>{candidates.map(c => <tr key={c.id}><td><input type="checkbox" aria-label={`${c.name} 포함`}
          disabled={!!draw || busy || !c.active} checked={pool.includes(c.id)} onChange={e => {
            setPool(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id)); setReviewed(false);
          }} /></td><td>{c.name}</td><td>{c.organization}</td><td>{c.specialty}</td></tr>)}</tbody>
      </table></div>
      {!candidates.length && <p className="muted">등록된 후보가 없습니다.</p>}
    </section>
    {!draw ? <section className="panel"><h2>추첨 설정</h2>
      <div className="form-row"><label>본위원 수<input type="number" min={1} max={30} value={seats}
        disabled={busy} onChange={e => { setSeats(Number(e.target.value)); setReviewed(false); }} /></label>
        <label>예비위원 수<input type="number" min={0} max={30} value={reserves}
          disabled={busy} onChange={e => { setReserves(Number(e.target.value)); setReviewed(false); }} /></label>
        <p>선택된 후보 <strong>{pool.length}명</strong></p></div>
      <label className="checkbox"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />
        후보 자격·이해관계를 검토했습니다. 이 예제에서는 사업당 한 번만 추첨할 수 있습니다.</label>
      <button className="primary" disabled={busy || !reviewed || seats < 1 || reserves < 0 || pool.length < seats + reserves}
        onClick={() => void conductDraw()}>위원 추첨 확정</button>
    </section> : <section className="panel"><h2>추첨 결과 <span className="badge success">확정</span></h2>
      <div className="result-grid">{[['본위원', draw.selected_ids], ['예비위원 (순번순)', draw.reserve_ids]].map(([label, ids]) =>
        <div key={String(label)}><h3>{String(label)}</h3><ol>{(ids as string[]).map(id => <li key={id}>
          {draw.candidate_snapshot.find(c => c.id === id)?.name ?? id}</li>)}</ol></div>)}</div>
      <details><summary>추첨 기록 확인</summary><p>실행 시각: {draw.created_at}</p><p>방법: {draw.method}</p>
        <p className="hash">모집단 SHA-256: {draw.snapshot_sha256}</p></details>
    </section>}
  </>;
}
