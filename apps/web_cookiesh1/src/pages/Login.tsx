import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, describeError, request } from '../api/client';
import type { OtpIssued, Session } from '../api/contract';
import { useSession } from '../lib/session';
import { Notice } from '../ui/ui';
import { CardStack, CountUp } from './login/CardStack';

const DemoAccounts = import.meta.env.VITE_USE_MOCK === '1' ? lazy(() => import('../demo/DemoAccounts')) : null;

type Mode = 'choose' | 'admin' | 'evaluator';

export function LoginPage() {
  const { session, login } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('choose');
  const hero = useRef<HTMLElement>(null);
  if (session) return <Navigate to={session.role === 'admin' ? '/admin' : '/eval'} replace />;

  function done(s: Session) {
    login(s);
    const next = params.get('next');
    navigate(next && next.startsWith(s.role === 'admin' ? '/admin' : '/eval') ? next : s.role === 'admin' ? '/admin' : '/eval', { replace: true });
  }

  return <div className="login-page">
    <section className="login-hero" ref={hero} aria-hidden={mode !== 'choose'}>
      <div className="brand"><span className="brand-mark">심</span><strong>심사임당</strong></div>
      <div className="hero-body">
        <p className="hero-eyebrow">공공 제안평가 지원 서비스</p>
        <h1>근거를 빠르게 찾고,<br />판단은 위원이 합니다.</h1>
        <CardStack heroRef={hero} />
        <ul className="hero-stats">
          <li><strong><CountUp to={6} /></strong><span>업무 단계</span></li>
          <li><strong><CountUp to={3} /></strong><span>역할</span></li>
          <li><strong><CountUp to={0} /></strong><span>AI 자동 확정</span></li>
        </ul>
        <p className="hero-note">AI가 찾은 근거에는 원문 쪽 번호가 붙고, 점수 입력·제출·확정은 사람만 할 수 있습니다.</p>
      </div>
      <small>© 2026 심사임당 · 팀 프로젝트 개발 화면</small>
    </section>
    <section className="login-panel">
      {mode === 'choose' && <div className="login-card">
        <h2>어떤 역할로 시작할까요?</h2>
        <p className="muted">역할에 따라 볼 수 있는 화면이 다릅니다.</p>
        <div className="role-choices">
          <button className="role-choice" onClick={() => setMode('evaluator')}>
            <span className="role-icon-wrap"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 9h6M9 13h6M9 17h3" /></svg></span>
            <strong>평가위원</strong><span>배정된 사업을 평가하고 제출합니다</span><span aria-hidden="true" className="chev">›</span></button>
          <button className="role-choice" onClick={() => setMode('admin')}>
            <span className="role-icon-wrap"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5l7 2.8v5.2c0 4.3-2.8 7.4-7 9-4.2-1.6-7-4.7-7-9V6.3l7-2.8z" /><path d="M9 12l2.2 2.2L15.2 10" /></svg></span>
            <strong>관리자 (간사)</strong><span>사업·문서·위원·결과를 관리합니다</span><span aria-hidden="true" className="chev">›</span></button>
        </div>
      </div>}
      {mode === 'admin' && <AdminLogin onBack={() => setMode('choose')} onDone={done} />}
      {mode === 'evaluator' && <EvaluatorLogin onBack={() => setMode('choose')} onDone={done} />}
    </section>
  </div>;
}

function AuthUnavailable() {
  return <Notice tone="warning" role="alert" title="인증 API 미연결">
    실제 서버에 로그인 기능이 아직 없습니다. 화면만 확인하려면 <code>VITE_USE_MOCK=1</code>로 실행해 주세요.
  </Notice>;
}

function errorView(e: unknown) {
  // 실제 모드에서 인증 경로가 없으면(404) 우회하지 않고 차단 안내만 보여 줍니다.
  if (e instanceof ApiError && e.status === 404 && import.meta.env.VITE_USE_MOCK !== '1') return <AuthUnavailable />;
  const d = describeError(e);
  return <Notice tone="danger" role="alert" title={e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status === 422) ? e.message : d.title}>
    {e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status === 422) ? null : d.detail}
  </Notice>;
}

function AdminLogin({ onBack, onDone }: { onBack: () => void; onDone: (s: Session) => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try { onDone(await request<Session>('POST', '/api/v1/auth/login', { username: data.get('username'), password: data.get('password') })); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <form className="login-card" onSubmit={submit}>
    <button type="button" className="back" onClick={onBack} aria-label="역할 선택으로 돌아가기">←</button>
    <h2>관리자 로그인</h2>
    <p className="muted">기관에서 받은 계정으로 로그인하세요.</p>
    <label className="field">아이디<input name="username" required autoComplete="username" autoFocus /></label>
    <label className="field">비밀번호<input name="password" type="password" required autoComplete="current-password" /></label>
    {error !== null && errorView(error)}
    <button className="btn primary block lg" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
    {DemoAccounts && <Suspense fallback={null}><DemoAccounts kind="admin" /></Suspense>}
  </form>;
}

function EvaluatorLogin({ onBack, onDone }: { onBack: () => void; onDone: (s: Session) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<OtpIssued | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState(false);
  useEffect(() => { input.current?.focus(); }, [step]);
  // 인증번호 유효시간: 발급(재발급 포함)할 때마다 처음부터 센다. 초 단위 변화는 읽어 주지 않고 만료만 알린다.
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!issued) return;
    const end = Date.now() + issued.expires_in * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(() => { tick(); if (Date.now() >= end) window.clearInterval(id); }, 1000);
    return () => window.clearInterval(id);
  }, [issued]);
  const expired = step === 2 && !!issued && left === 0;

  const phoneDigits = phone.replace(/\D/g, '');
  const titles = ['성함을\n알려주세요', '휴대폰 번호를\n알려주세요', '인증번호를\n입력해 주세요'];
  const subs = ['간사가 등록한 평가위원 정보와 맞춰 볼게요.', '등록된 번호로 인증번호를 보내드려요.', `${phone}로 보낸 6자리 숫자예요.`];
  const valid = [name.trim().length >= 2, /^01\d{8,9}$/.test(phoneDigits), /^\d{6}$/.test(code) && !expired][step];

  async function next(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    if (step === 0) { setStep(1); return; }
    setBusy(true);
    try {
      if (step === 1) {
        setIssued(await request<OtpIssued>('POST', '/api/v1/auth/evaluator/otp', { name: name.trim(), phone }));
        setCode(''); setStep(2);
      } else {
        onDone(await request<Session>('POST', '/api/v1/auth/evaluator/verify', { request_id: issued?.request_id, code }));
      }
    } catch (err) { setError(err); if (step === 2) setShake(true); } finally { setBusy(false); }
  }
  function formatPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
  }

  return <form className="login-card stepper" onSubmit={next} noValidate>
    <div className="stepper-top">
      <button type="button" className="back" onClick={() => { setError(null); step === 0 ? onBack() : setStep(step - 1); }} aria-label="이전 단계">←</button>
      <span className="sr-only" aria-live="polite">{step + 1} / 3 단계</span>
      <span className="muted" aria-hidden="true">{step + 1} / 3</span>
    </div>
    <div className="step-bars" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}</div>
    <h2 className="stepper-title">{titles[step].split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
    <p className="muted">{subs[step]}</p>
    {step === 0 && <label className="field big"><span className="sr-only">이름</span>
      <input ref={input} value={name} onChange={e => setName(e.target.value)} placeholder="이름" autoComplete="name" /></label>}
    {step === 1 && <label className="field big"><span className="sr-only">휴대폰 번호</span>
      <input ref={input} value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" autoComplete="tel" /></label>}
    {step === 2 && <>
      <label className="field big"><span className="sr-only">인증번호 6자리</span>
        <input ref={input} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
          inputMode="numeric" autoComplete="one-time-code" className={`otp-input${shake ? ' shake' : ''}`} aria-describedby="otp-timer"
          onAnimationEnd={() => setShake(false)} /></label>
      <div id="otp-timer" className={`otp-timer${expired ? ' expired' : ''}`}>
        {expired ? <span role="alert">인증번호가 만료됐어요</span>
          : <span>남은 시간 <strong className="mono">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</strong></span>}
      </div>
      {import.meta.env.VITE_USE_MOCK === '1' && issued?.demo_code && <Notice tone="warning" title="데모 · 실제 문자를 보내지 않았어요">
        인증번호 <strong className="mono">{issued.demo_code}</strong>{' '}
        <button type="button" className="link" onClick={() => setCode(issued.demo_code!)}>자동 입력</button>
      </Notice>}
      <button type="button" className="link" disabled={busy} onClick={async () => {
        setError(null); setBusy(true);
        try { setIssued(await request<OtpIssued>('POST', '/api/v1/auth/evaluator/otp', { name: name.trim(), phone })); setCode(''); }
        catch (err) { setError(err); } finally { setBusy(false); }
      }}>인증번호 다시 받기</button>
    </>}
    {error !== null && errorView(error)}
    <div className="stepper-bottom">
      <button className="btn primary block lg" disabled={!valid || busy}>{busy ? '확인 중…' : ['다음', '인증번호 받기', '확인'][step]}</button>
      <p className="muted center">문자가 오지 않으면 간사에게 연락해 주세요.</p>
      {step === 0 && DemoAccounts && <Suspense fallback={null}><DemoAccounts kind="evaluator" /></Suspense>}
    </div>
  </form>;
}
