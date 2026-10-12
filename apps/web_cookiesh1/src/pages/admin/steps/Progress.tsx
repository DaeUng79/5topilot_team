import { useEffect, useState } from 'react';
import { describeError, request } from '../../../api/client';
import type { Attendance, ProgressRead, ScheduleRead, ScheduleSet, VendorRead } from '../../../api/contract';
import { formatTime } from '../../../lib/format';
import { Badge, Card, Notice, Progress, useToast, type Tone } from '../../../ui/ui';
import { VendorTag } from '../VendorTag';
import { useProjectData } from '../ProjectContext';
import { NeedFirst, StepFrame } from '../StepFrame';

const sheetInfo: Record<ProgressRead['members'][number]['sheet_status'], { label: string; tone: Tone }> = {
  not_started: { label: '미시작', tone: 'neutral' }, draft: { label: '작성 중', tone: 'warning' }, submitted: { label: '제출 완료', tone: 'success' },
};
const REFRESH_MS = 20_000;

export function ProgressStep() {
  const { summary, vendors, schedule, linked, closed, refresh } = useProjectData();
  const p = summary.progress;
  const members = p.members.filter(m => m.role !== 'reserve');
  const submitted = members.filter(m => m.sheet_status === 'submitted').length;
  const [refreshedAt, setRefreshedAt] = useState(new Date().toISOString());
  useEffect(() => { setRefreshedAt(new Date().toISOString()); }, [p]);
  useEffect(() => {
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);
  const sub = !members.length ? '평가위원을 정하면 일정과 제출 현황을 볼 수 있어요'
    : submitted === members.length ? '전원이 제출했어요. 다음 단계에서 결과를 확인할 수 있어요' : '일정과 참석을 확인하고, 위원의 제출을 기다려요';
  const count = (s: string) => members.filter(m => m.sheet_status === s).length;

  return <StepFrame step="progress" sub={sub}>
    {!members.length && <NeedFirst pid={summary.project.id} step="committee">아직 평가위원이 없어요. 먼저 위원을 뽑아 주세요.</NeedFirst>}
    {!linked.schedule && <Notice tone="warning" title="일정 API가 아직 연결되지 않았어요">평가 일정·참석 확인은 연결 후에 쓸 수 있어요.</Notice>}
    {schedule && <>
      <ScheduleCard key={JSON.stringify([schedule.evaluation_date, schedule.presentation_order, schedule.presentation_minutes, schedule.qa_minutes, vendors.map(v => v.vendor_id)])}
        pid={summary.project.id} schedule={schedule} vendors={vendors} disabled={closed} onSaved={refresh} />
      {members.length > 0 && <AttendanceCard pid={summary.project.id} schedule={schedule} members={p.members} disabled={closed} onSaved={refresh} />}
    </>}
    {members.length > 0 && <>
      <Card title="제출 현황">
        <div className="conclusion">
          <span className="big-num">{submitted}<small> / {members.length}</small></span>
          <div><p className="say-title">{members.length}명 중 {submitted}명이 제출했어요</p>
            <p className="say-sub">{members.length - submitted > 0 ? `${members.length - submitted}명이 아직 제출하지 않았어요.` : '전원이 제출했어요.'}</p></div>
        </div>
        <Progress value={submitted} max={members.length} label="제출 진행률" />
        <div className="row between top-gap">
          <p className="muted" aria-live="polite">서버 기준 {formatTime(refreshedAt)} 갱신 · {REFRESH_MS / 1000}초마다 자동 · 작성 중 {count('draft')}명 · 미시작 {count('not_started')}명</p>
          <button className="btn sm" onClick={() => void refresh()}>새로고침</button>
        </div>
      </Card>
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
      {schedule && schedule.presentation_order.length > 0 && <PresentationTimer key={`${schedule.presentation_order.join()}${schedule.presentation_minutes}${schedule.qa_minutes}`}
        order={schedule.presentation_order.flatMap(id => vendors.filter(v => v.vendor_id === id))} presentMin={schedule.presentation_minutes} qaMin={schedule.qa_minutes} />}
    </>}
  </StepFrame>;
}

function ScheduleCard({ pid, schedule, vendors, disabled, onSaved }: {
  pid: string; schedule: ScheduleRead; vendors: VendorRead[]; disabled: boolean; onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  // 서버 순서에 없는 제안사는 뒤에 붙입니다.
  const initialOrder = [...schedule.presentation_order.filter(id => vendors.some(v => v.vendor_id === id)), ...vendors.map(v => v.vendor_id).filter(id => !schedule.presentation_order.includes(id))];
  const [date, setDate] = useState(schedule.evaluation_date?.slice(0, 10) ?? '');
  const [order, setOrder] = useState(initialOrder);
  const [pm, setPm] = useState(String(schedule.presentation_minutes));
  const [qm, setQm] = useState(String(schedule.qa_minutes));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pmN = Number(pm), qmN = Number(qm);
  const valid = Number.isInteger(pmN) && pmN >= 1 && pmN <= 120 && Number.isInteger(qmN) && qmN >= 0 && qmN <= 120;
  const dirty = date !== (schedule.evaluation_date?.slice(0, 10) ?? '') || order.join() !== initialOrder.join() || pmN !== schedule.presentation_minutes || qmN !== schedule.qa_minutes;
  const move = (i: number, d: -1 | 1) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; setOrder(o); };

  async function save() {
    setBusy(true); setError(null);
    try {
      await request('PUT', `/api/v1/projects/${pid}/schedule`, { evaluation_date: date || null, presentation_order: order, presentation_minutes: pmN, qa_minutes: qmN } satisfies ScheduleSet);
      await onSaved(); toast('평가 일정을 저장했어요.');
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  const reason = disabled ? '완료된 사업은 바꿀 수 없어요.' : !valid ? '발표·질의 시간을 분 단위 숫자로 입력해 주세요.' : '';

  return <Card title="평가 일정">
    <div className="form-row">
      <label className="field">평가일<input type="date" value={date} disabled={disabled} onChange={e => setDate(e.target.value)} /></label>
      <label className="field">발표(분)<input type="number" min={1} max={120} value={pm} disabled={disabled} onChange={e => setPm(e.target.value)} /></label>
      <label className="field">질의(분)<input type="number" min={0} max={120} value={qm} disabled={disabled} onChange={e => setQm(e.target.value)} /></label>
    </div>
    {order.length > 0 ? <>
      <h3 className="mini-title">발표 순서</h3>
      <ol className="order-list">{order.map((id, i) => {
        const v = vendors.find(x => x.vendor_id === id)!;
        return <li key={id}><span className="order-no">{i + 1}</span><VendorTag vendor={v} />
          <span className="order-btns">
            <button type="button" className="btn sm" disabled={disabled || i === 0} aria-label={`${v.code}사를 위로 이동`} onClick={() => move(i, -1)}>▲ 위로</button>
            <button type="button" className="btn sm" disabled={disabled || i === order.length - 1} aria-label={`${v.code}사를 아래로 이동`} onClick={() => move(i, 1)}>▼ 아래로</button>
          </span></li>;
      })}</ol></> : <p className="muted">등록된 제안사가 없어 발표 순서를 정할 수 없어요.</p>}
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
    <div className="row end">{reason && <span className="muted">{reason}</span>}
      <button className="btn primary" disabled={!dirty || !!reason || busy} onClick={() => void save()}>{busy ? '저장 중…' : '일정 저장'}</button></div>
  </Card>;
}

const ATT: { key: Attendance; label: string }[] = [{ key: 'present', label: '참석' }, { key: 'absent', label: '불참' }, { key: 'unknown', label: '미확인' }];

function AttendanceCard({ pid, schedule, members, disabled, onSaved }: {
  pid: string; schedule: ScheduleRead; members: ProgressRead['members']; disabled: boolean; onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<Record<string, Attendance>>({});
  const statusOf = (id: string): Attendance => pending[id] ?? schedule.attendance.find(a => a.evaluator_id === id)?.status ?? 'unknown';
  const list = members.filter(m => m.role !== 'reserve');
  const n = (s: Attendance) => list.filter(m => statusOf(m.evaluator_id) === s).length;

  async function set(id: string, status: Attendance) {
    setError(null); setPending(p => ({ ...p, [id]: status }));
    const attendance = list.map(m => ({ evaluator_id: m.evaluator_id, status: m.evaluator_id === id ? status : statusOf(m.evaluator_id) }));
    try { await request('PUT', `/api/v1/projects/${pid}/schedule`, { attendance } satisfies ScheduleSet); await onSaved(); }
    catch (e) { setError(e); }
    finally { setPending(p => { const { [id]: _x, ...rest } = p; return rest; }); }
  }
  return <Card title="참석 확인" actions={<span className="muted">참석 {n('present')} · 불참 {n('absent')} · 미확인 {n('unknown')}</span>}>
    <ul className="attend-list">{list.map(m => <li key={m.evaluator_id}>
      <span><strong>{m.name}</strong> <span className="muted small">{m.organization}</span>{m.role === 'chair' && <> <Badge tone="primary">위원장</Badge></>}</span>
      <div className="seg" role="group" aria-label={`${m.name} 참석 여부`}>{ATT.map(a => <button key={a.key} type="button" disabled={disabled}
        className={statusOf(m.evaluator_id) === a.key ? 'on' : ''} aria-pressed={statusOf(m.evaluator_id) === a.key}
        onClick={() => void set(m.evaluator_id, a.key)}>{a.label}</button>)}</div>
    </li>)}</ul>
    {error !== null && <Notice tone="danger" role="alert" title={describeError(error).title}>{describeError(error).detail}</Notice>}
  </Card>;
}

/** 발표·질의응답 시간 관리 (화면 내 타이머, 서버 기록 없음). 순서와 분은 평가 일정에서 가져옵니다. */
function PresentationTimer({ order, presentMin, qaMin }: { order: VendorRead[]; presentMin: number; qaMin: number }) {
  const [vendor, setVendor] = useState(order[0]?.vendor_id);
  const [phase, setPhase] = useState<'present' | 'qna'>('present');
  const minutes = { present: presentMin, qna: qaMin };
  const [left, setLeft] = useState(presentMin * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => { if (left === 0) setRunning(false); }, [left]);
  function reset(nextPhase = phase) { setRunning(false); setPhase(nextPhase); setLeft(minutes[nextPhase] * 60); }
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  const current = order.find(v => v.vendor_id === vendor) ?? order[0];

  return <Card title="발표 시간 관리" actions={<span className="muted">발표 {presentMin}분 · 질의응답 {qaMin}분 (일정에서 바꿔요)</span>}>
    <div className="timer">
      <div className="timer-order" role="group" aria-label="발표 순서">{order.map((v, i) => <button key={v.vendor_id} className={`btn sm ${v.vendor_id === vendor ? 'primary' : ''}`}
        onClick={() => { setVendor(v.vendor_id); reset('present'); }} aria-pressed={v.vendor_id === vendor}>{i + 1}. <VendorTag vendor={v} nameOnly /></button>)}</div>
      <div className={`timer-face ${left <= 60 ? 'urgent' : ''}`} aria-live="off">
        <span className="muted timer-who">{current && <VendorTag vendor={current} nameOnly />} {phase === 'present' ? '발표' : '질의응답'}</span>
        <strong className="mono">{mm}:{ss}</strong>
        {left === 0 && <Badge tone="danger">시간 종료</Badge>}
      </div>
      <div className="row center">
        <button className="btn primary" onClick={() => setRunning(r => !r)} disabled={left === 0}>{running ? '일시정지' : '시작'}</button>
        <button className="btn" onClick={() => reset()}>초기화</button>
        <button className="btn" onClick={() => reset(phase === 'present' ? 'qna' : 'present')}>{phase === 'present' ? '질의응답으로' : '발표로'}</button>
      </div>
    </div>
  </Card>;
}
