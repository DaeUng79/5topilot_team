import { useEffect, useState } from 'react';
import { request, type Project } from '../../../api/client';
import type { ProgressRead } from '../../../api/contract';
import { useLoad } from '../../../lib/useLoad';
import { formatTime } from '../../../lib/format';
import { Async, Empty } from '../../../ui/states';
import { Badge, Card, StatCard, VendorLabel, type Tone } from '../../../ui/ui';

const sheetInfo: Record<ProgressRead['members'][number]['sheet_status'], { label: string; tone: Tone }> = {
  not_started: { label: '미시작', tone: 'neutral' }, draft: { label: '작성 중', tone: 'warning' }, submitted: { label: '제출 완료', tone: 'success' },
};
const REFRESH_MS = 20_000;

export function ProgressTab({ project }: { project: Project }) {
  const load = useLoad(() => request<ProgressRead>('GET', `/api/v1/projects/${project.id}/progress`), [project.id]);
  const [refreshedAt, setRefreshedAt] = useState(new Date().toISOString());
  useEffect(() => { if (load.state === 'ok') setRefreshedAt(new Date().toISOString()); }, [load.state, load.data]);
  useEffect(() => {
    const t = setInterval(() => void load.reload(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load.reload]);

  return <Async load={load} loadingLabel="진행 현황을 불러오는 중"
    empty={p => !p.members.length && <Card><Empty title="아직 평가위원이 없어요">평가위원 탭에서 추첨을 마치면 위원별 진행 상황이 보입니다.</Empty></Card>}>
    {p => {
      const members = p.members.filter(m => m.role !== 'reserve');
      const count = (s: string) => members.filter(m => m.sheet_status === s).length;
      const all = members.length > 0 && count('submitted') === members.length;
      return <>
        <div className="conclusion">
          <span className="big-num">{count('submitted')}<small> / {members.length}</small></span>
          <div><p className="say-title">{members.length}명 중 {count('submitted')}명이 제출했어요</p>
            <p className="say-sub">{all ? '전원이 제출했어요. 결과 탭에서 확인할 수 있어요.' : `${members.length - count('submitted')}명이 아직 제출하지 않았어요.`}</p></div>
        </div>
        <div className="row between">
          <p className="muted" aria-live="polite">서버 기준 {formatTime(refreshedAt)} 갱신 · {REFRESH_MS / 1000}초마다 자동 갱신</p>
          <button className="btn sm" onClick={() => void load.reload()} disabled={load.state === 'loading'}>{load.state === 'loading' ? '갱신 중…' : '새로고침'}</button>
        </div>
        <div className="stats">
          <StatCard label="작성 중" value={`${count('draft')}명`} tone="warning" />
          <StatCard label="미시작" value={`${count('not_started')}명`} />
          <StatCard label="제출 완료" value={`${count('submitted')}명`} tone="success" />
        </div>
        <Card title="평가위원별 상태">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>이름</th><th>소속 · 분야</th><th>역할</th><th>상태</th><th>마지막 저장</th><th>제출 시각</th></tr></thead>
            <tbody>{p.members.map(m => <tr key={m.evaluator_id} className={m.role === 'reserve' ? 'row-muted' : ''}>
              <td><strong>{m.name}</strong></td><td>{m.organization} · {m.specialty}</td>
              <td>{m.role === 'chair' ? <Badge tone="primary">위원장</Badge> : m.role === 'reserve' ? <Badge>예비위원</Badge> : '본위원'}</td>
              <td>{m.role === 'reserve' ? <span className="muted">해당 없음</span> : <Badge tone={sheetInfo[m.sheet_status].tone}>{sheetInfo[m.sheet_status].label}</Badge>}</td>
              <td>{formatTime(m.last_saved_at)}</td><td>{formatTime(m.submitted_at)}</td>
            </tr>)}</tbody>
          </table></div>
        </Card>
        <PresentationTimer order={p.presentation_order} />
      </>;
    }}
  </Async>;
}

/** 발표·질의응답 시간 관리 (화면 내 타이머, 서버 기록 없음) */
function PresentationTimer({ order }: { order: string[] }) {
  const [vendor, setVendor] = useState(order[0]);
  const [phase, setPhase] = useState<'present' | 'qna'>('present');
  const [minutes, setMinutes] = useState({ present: 15, qna: 10 });
  const [left, setLeft] = useState(minutes.present * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => { if (left === 0) setRunning(false); }, [left]);
  function reset(nextPhase = phase) { setRunning(false); setPhase(nextPhase); setLeft(minutes[nextPhase] * 60); }
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');

  return <Card title="발표 시간 관리" actions={<span className="muted">발표 10~20분 · 질의응답 5~10분</span>}>
    <div className="timer">
      <div className="timer-order" role="group" aria-label="발표 순서">{order.map((v, i) => <button key={v} className={`btn sm ${v === vendor ? 'primary' : ''}`}
        onClick={() => { setVendor(v); reset('present'); }} aria-pressed={v === vendor}>{i + 1}. <VendorLabel id={v} /></button>)}</div>
      <div className={`timer-face ${left <= 60 ? 'urgent' : ''}`} aria-live="off">
        <span className="muted timer-who"><VendorLabel id={vendor} /> {phase === 'present' ? '발표' : '질의응답'}</span>
        <strong className="mono">{mm}:{ss}</strong>
        {left === 0 && <Badge tone="danger">시간 종료</Badge>}
      </div>
      <div className="row center">
        <button className="btn primary" onClick={() => setRunning(r => !r)} disabled={left === 0}>{running ? '일시정지' : '시작'}</button>
        <button className="btn" onClick={() => reset()}>초기화</button>
        <button className="btn" onClick={() => reset(phase === 'present' ? 'qna' : 'present')}>{phase === 'present' ? '질의응답으로' : '발표로'}</button>
      </div>
      <div className="form-row center">
        <label className="field inline">발표(분)<input type="number" min={10} max={20} value={minutes.present}
          onChange={e => { const v = Number(e.target.value); setMinutes(m => ({ ...m, present: v })); if (phase === 'present' && !running) setLeft(v * 60); }} /></label>
        <label className="field inline">질의응답(분)<input type="number" min={5} max={10} value={minutes.qna}
          onChange={e => { const v = Number(e.target.value); setMinutes(m => ({ ...m, qna: v })); if (phase === 'qna' && !running) setLeft(v * 60); }} /></label>
      </div>
    </div>
  </Card>;
}
