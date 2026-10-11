// mock 전용 데모 계정 안내. 실제 빌드에는 포함되지 않습니다. 모든 값은 합성 데이터입니다.
export default function DemoAccounts({ kind }: { kind: 'admin' | 'evaluator' }) {
  if (kind === 'admin') return <details className="demo-accounts">
    <summary>데모 계정 (mock)</summary>
    <p>아이디 <code>gansa</code> · 비밀번호 <code>demo</code></p>
  </details>;
  const rows = [
    ['김가상', '010-0000-0001', 'p1 위원장 · 미제출'], ['정모의', '010-0000-0005', 'p1 본위원 · 미시작'],
    ['최테스트', '010-0000-0004', 'p1 본위원 · 작성 중'], ['이예시', '010-0000-0002', 'p1 본위원 · 제출 완료'],
    ['한가정', '010-0000-0006', 'p1 예비위원 (평가표 접근 불가)'],
  ];
  return <details className="demo-accounts">
    <summary>데모 평가위원 (mock)</summary>
    <table><tbody>{rows.map(([name, phone, note]) => <tr key={phone}><td>{name}</td><td><code>{phone}</code></td><td>{note}</td></tr>)}</tbody></table>
  </details>;
}
