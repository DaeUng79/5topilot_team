import { useState } from 'react';
import { publicApi, type SessionRead } from '../../api/client';
import './login.css';

// 공통 로그인 화면. 사업관리자는 아이디·비밀번호(로컬 시연용 계정), 평가위원은 등록된 이름·생년월일 대조로
// 들어온다. 권한(role)은 서버가 세션에 넣어 주며 화면은 그 값으로 메뉴를 나눈다.
type Mode = 'admin' | 'evaluator';

function detail(result: { error?: unknown; response: Response }) {
  const err = result.error as { detail?: unknown } | undefined;
  return typeof err?.detail === 'string' ? err.detail : `요청 실패 (${result.response.status})`;
}

export function LoginPage({ onLogin, notice }: { onLogin: (session: SessionRead) => void; notice?: string }) {
  const [mode, setMode] = useState<Mode>('admin');
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(form: HTMLFormElement) {
    setBusy(true); setError('');
    const data = new FormData(form);
    const result = mode === 'admin'
      ? await publicApi.POST('/api/v1/auth/login', {
        body: { username: String(data.get('username')).trim(), password: String(data.get('password')) },
      })
      : await publicApi.POST('/api/v1/evaluator-access/login', {
        body: { name: String(data.get('name')).trim(), birth_date: birthDate },
      });
    setBusy(false);
    if (!result.response.ok || !result.data) { setError(detail(result)); return; }
    onLogin(result.data);
  }
  function switchMode(next: Mode) { setMode(next); setError(''); }

  return <>
    <header><span className="brand-mark">심</span><strong>심사임당</strong>
      <span className="brand-description">공공 제안평가 지원</span><span className="badge">로컬 개발 모드</span>
    </header>
    <main className="login-main">
      <section className="panel login-card">
        <h1>로그인</h1>
        <p className="muted">로그인한 계정의 권한에 따라 사업관리자 화면 또는 평가위원 화면이 자동으로 열립니다.</p>
        {notice && <p className="dev-note">{notice}</p>}
        <div className="tabs login-tabs" role="tablist" aria-label="로그인 방식">
          {([['admin', '사업관리자'], ['evaluator', '평가위원']] as const).map(([key, title]) =>
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''}
              onClick={() => switchMode(key)}>{title}</button>)}
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {mode === 'admin'
          ? <form className="login-form" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
            <label>아이디<input name="username" required maxLength={100} autoComplete="username" autoFocus disabled={busy} /></label>
            <label>비밀번호<input name="password" type="password" required maxLength={200} autoComplete="current-password" disabled={busy} /></label>
            <button className="primary" disabled={busy}>로그인</button>
            <p className="muted">로컬 시연용 관리자 계정은 apps/api/.env의 LOCAL_ADMIN_ID·LOCAL_ADMIN_PASSWORD입니다. 실제 기관 인증이 아니며 배포 환경에서는 닫힙니다.</p>
          </form>
          : <form className="login-form" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
            <label>이름<input name="name" required maxLength={100} autoComplete="off" autoFocus disabled={busy} placeholder="등록된 위원 이름" /></label>
            <label>생년월일 6자리
              <input className="code-input" name="birth_date" inputMode="numeric" autoComplete="off" pattern="\d{6}" required maxLength={6}
                placeholder="YYMMDD" value={birthDate} disabled={busy} aria-label="생년월일 6자리"
                onChange={e => setBirthDate(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <button className="primary" disabled={busy || birthDate.length !== 6}>본인확인 후 입장</button>
            <p className="muted">등록된 이름과 생년월일을 서버에서 대조해 선정된 평가 사업만 보여 줍니다. 간사가 보낸 접근 링크가 있으면 링크로도 입장할 수 있습니다. 실제 본인인증 수단이 아닙니다.</p>
          </form>}
      </section>
    </main>
  </>;
}
