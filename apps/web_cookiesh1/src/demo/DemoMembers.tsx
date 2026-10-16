// mock 전용 "가상 위원으로 체험하기". 실제 빌드에는 포함되지 않습니다(Login.tsx에서 VITE_USE_MOCK 조건 + 동적 import).
// 값은 모두 합성 데이터이며 src/api/mockSeed.ts의 위원과 같습니다. 누르면 이름·번호를 채워 실제 로그인 API 경로로 진행합니다.
export type DemoMember = { name: string; phone: string; role: '위원장' | '본위원' | '예비위원' };

export const DEMO_MEMBERS: DemoMember[] = [
  { name: '김가상', phone: '010-0000-0001', role: '위원장' },
  { name: '정모의', phone: '010-0000-0005', role: '본위원' },
  { name: '최테스트', phone: '010-0000-0004', role: '본위원' },
  { name: '이예시', phone: '010-0000-0002', role: '본위원' },
  { name: '한가정', phone: '010-0000-0006', role: '예비위원' },
];

export default function DemoMembers({ onPick, disabled }: { onPick: (m: DemoMember) => void; disabled: boolean }) {
  return <div className="demo-members">
    <p className="demo-members-label">가상 위원으로 체험하기</p>
    <ul>
      {DEMO_MEMBERS.map(m => <li key={m.phone}>
        <button type="button" disabled={disabled} onClick={() => onPick(m)}>
          <span>{m.name}</span><em className={`role-badge r-${m.role}`}>{m.role}</em>
        </button>
      </li>)}
    </ul>
  </div>;
}
