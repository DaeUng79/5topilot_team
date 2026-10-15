import { useEffect, useState } from 'react';
import { api, unwrap, type Candidate, type ChairRead, type Draw, type Project } from '../../api/client';
import './committee.css';

function memberName(draw: Draw, id: string) {
  return draw.candidate_snapshot.find(c => c.id === id)?.name ?? id;
}

export function CommitteePage({ project }: { project: Project }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [draw, setDraw] = useState<Draw | null>(null);
  // 평가위원장(사업별). 추첨 결과의 본위원 중 1명을 사업관리자가 지정하며 결과 확정 뒤에는 바꿀 수 없다.
  const [chair, setChair] = useState<ChairRead | null>(null);
  const [chairPick, setChairPick] = useState('');
  const [chairReason, setChairReason] = useState('');
  const [seats, setSeats] = useState(2);
  const [reserves, setReserves] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = { path: { project_id: project.id } };

  async function load() {
    const [candidateResult, drawResult, chairResult] = await Promise.all([
      api.GET('/api/v1/committee/candidates'),
      api.GET('/api/v1/projects/{project_id}/committee/draw', { params }),
      api.GET('/api/v1/projects/{project_id}/committee/chair', { params }),
    ]);
    setCandidates(unwrap(candidateResult)); setDraw(unwrap(drawResult));
    const current = unwrap(chairResult);
    setChair(current); setChairPick(current.chair_id ?? ''); setChairReason('');
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

  async function saveChair() {
    setBusy(true); setError('');
    try {
      const result = unwrap(await api.PUT('/api/v1/projects/{project_id}/committee/chair', {
        params, body: { chair_id: chairPick, reason: chairReason.trim() },
      }));
      setChair(result); setChairPick(result.chair_id ?? ''); setChairReason('');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  // 이미 위원장이 있는 사업에서 다른 본위원을 고르면 '변경'이며 사유가 필요하다.
  const changing = !!chair?.chair_id && chairPick !== '' && chairPick !== chair.chair_id;
  const chairLocked = !chair || chair.locked;
  const canSaveChair = !busy && !chairLocked && chairPick !== '' && chairPick !== chair?.chair_id
    && (!changing || chairReason.trim().length > 0);

  return <>
    <h1>평가위원 등록·추첨</h1><p className="muted">후보를 등록하고, 검토한 모집단에서 본위원과 예비위원을 선정합니다. 추첨 뒤 본위원 중 평가위원장을 지정합니다.</p>
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
      <div className="result-grid">
        <div><h3>본위원</h3><ol>{draw.selected_ids.map(id => {
          const name = memberName(draw, id);
          return <li key={id}><label className="chair-option">
            <input type="radio" name="chair" value={id} aria-label={`${name} 위원장 지정`} checked={chairPick === id}
              disabled={busy || chairLocked} onChange={() => setChairPick(id)} />
            <span>{name}</span>
            {chair?.chair_id === id && <span className="badge success">평가위원장</span>}
          </label></li>;
        })}</ol></div>
        <div><h3>예비위원 (순번순)</h3><ol>{draw.reserve_ids.map(id => <li key={id}>{memberName(draw, id)}</li>)}</ol></div>
      </div>
      <div className="chair-assign">
        <p data-testid="chair-status">{chair?.chair_id
          ? <>현재 평가위원장: <strong>{chair.chair_name}</strong></>
          : '본위원 중 1명을 평가위원장으로 지정하세요. 지정 전에는 결과 확정을 할 수 없습니다.'}
          {chair?.locked && <span className="muted"> · {chair.lock_reason}</span>}</p>
        {changing && <label>변경 사유<input value={chairReason} maxLength={500} disabled={busy} placeholder="예: 기존 위원장 일정 사유로 교체"
          onChange={e => setChairReason(e.target.value)} /></label>}
        <div className="actions">
          <button className="primary" disabled={!canSaveChair} onClick={() => void saveChair()}>위원장 지정 저장</button>
          {changing && <button type="button" disabled={busy} onClick={() => { setChairPick(chair?.chair_id ?? ''); setChairReason(''); }}>선택 취소</button>}
        </div>
        <p className="dev-note">위원장은 사업별 권한입니다. 결과가 확정되기 전까지 사유를 남기고 변경할 수 있으며, 변경해도 위원별 점수·제출 기록은 유지됩니다.</p>
        {chair && chair.history.length > 0 && <details><summary>위원장 지정 이력 ({chair.history.length})</summary>
          <ul className="notices">{chair.history.map(h => <li key={h.changed_at}>
            {h.changed_at} · {memberName(draw, h.chair_id)}{h.previous_chair_id ? ` (이전: ${memberName(draw, h.previous_chair_id)})` : ' (최초 지정)'}
            {h.reason ? ` · 사유: ${h.reason}` : ''} · 실행자 {h.actor_id}</li>)}</ul></details>}
      </div>
      <details><summary>추첨 기록 확인</summary><p>실행 시각: {draw.created_at}</p><p>방법: {draw.method}</p>
        <p className="hash">모집단 SHA-256: {draw.snapshot_sha256}</p></details>
    </section>}
  </>;
}
