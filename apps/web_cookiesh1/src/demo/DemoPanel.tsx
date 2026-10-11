// mock 전용 시연 도구. VITE_USE_MOCK=1 빌드에서만 lazy import 됩니다.
import { useState } from 'react';
import { getFlags, setFlags, type DemoFlags } from '../api/demo';
import { resetDb } from '../api/mock';

const labels: [keyof DemoFlags, string, string][] = [
  ['slow', '느린 응답', '모든 요청이 2초 걸립니다 (로딩 상태)'],
  ['serverError', '서버 오류', '모든 요청이 500을 돌려줍니다'],
  ['saveFail', '저장 실패', '평가표 저장·제출이 네트워크 오류로 실패합니다'],
  ['empty', '빈 데이터', '목록 조회가 빈 결과를 돌려줍니다'],
];

export default function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [flags, setLocal] = useState(getFlags);
  const active = Object.values(flags).some(Boolean);
  function toggle(key: keyof DemoFlags) {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next); setLocal(next);
  }
  const [pending, setPending] = useState<null | boolean>(null);
  function reset(allSubmitted: boolean) {
    resetDb(allSubmitted);
    Object.keys(localStorage).filter(k => k.startsWith('simsa-draft:')).forEach(k => localStorage.removeItem(k));
    location.reload();
  }
  return <div className="demo-panel">
    {open && <div className="demo-body" role="region" aria-label="시연 도구">
      <strong>시연 도구 <small>mock 전용 · 실제 서버 아님</small></strong>
      {labels.map(([key, label, hint]) => <label key={key} className="demo-toggle">
        <input type="checkbox" checked={flags[key]} onChange={() => toggle(key)} />
        <span>{label}<small>{hint}</small></span>
      </label>)}
      {pending === null ? <div className="demo-actions">
        <button className="btn sm" onClick={() => setPending(false)}>데이터 초기화</button>
        <button className="btn sm" onClick={() => setPending(true)}>전원 제출 시드로 전환</button>
      </div> : <div className="demo-confirm" role="alert">
        <p>{pending ? '"전원 제출 완료" 시드로 바꿀까요?' : '처음 상태로 되돌릴까요?'} 지금까지의 mock 입력과 임시보관이 사라집니다.</p>
        <div className="demo-actions">
          <button className="btn sm danger" onClick={() => reset(pending)}>진행</button>
          <button className="btn sm" onClick={() => setPending(null)}>취소</button>
        </div>
      </div>}
    </div>}
    <button className={`btn demo-fab ${active ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      🛠 시연 도구{active ? ' · 켜짐' : ''}
    </button>
  </div>;
}
