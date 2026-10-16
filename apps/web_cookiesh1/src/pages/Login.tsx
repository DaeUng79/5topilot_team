import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, describeError, request } from '../api/client';
import type { OtpIssued, Session } from '../api/contract';
import { useSession } from '../lib/session';
import { Notice } from '../ui/ui';
import { CardStack, CountUp } from './login/CardStack';

// mock 전용 가상 위원 목록. 실제 빌드에서는 조건이 거짓으로 접혀 청크째 빠집니다.
const DemoMembers = import.meta.env.VITE_USE_MOCK === '1' ? lazy(() => import('../demo/DemoMembers')) : null;

// 화면 순서(숫자가 클수록 오른쪽). 현재보다 작으면 왼쪽으로 빠지고, 크면 오른쪽에서 들어옵니다.
type View = 'admin' | 'name' | 'phone' | 'otp' | 'done';
const POS: Record<View, number> = { admin: 0, name: 1, phone: 2, otp: 3, done: 4 };
const BACK: Partial<Record<View, View>> = { phone: 'name', otp: 'phone' };
const STEP: Partial<Record<View, number>> = { name: 0, phone: 1, otp: 2, done: 3 };
type InputRef = RefObject<HTMLInputElement | null>;
type Member = { name: string; phone: string };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 자동 진행용 대기. 움직임 줄이기 설정이면 어떤 지연이든 50ms. */
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, reducedMotion() ? 50 : ms));

/** 슬라이드 한 장. 현재 장만 보이고, 나머지는 inert + aria-hidden으로 탭 이동·스크린리더에서 뺍니다. */
function Slide({ id, view, as = 'div', onSubmit, children }: {
  id: View; view: View; as?: 'div' | 'form'; onSubmit?: (e: FormEvent) => void; children: ReactNode;
}) {
  const on = id === view;
  const state = on ? 'is-on' : POS[id] < POS[view] ? 'is-prev' : 'is-next';
  const props = { className: `slide-step login-step ${state}`, 'aria-hidden': !on, inert: !on };
  return as === 'form'
    ? <form {...props} onSubmit={onSubmit} noValidate>{children}</form>
    : <div {...props}>{children}</div>;
}

export function LoginPage({ intro = false }: { intro?: boolean }) {
  const { session, login } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>('name');
  const [error, setError] = useState<unknown>(null);
  const [locked, setLocked] = useState(false); // 자동 진행·완료 중에는 뒤로 가기·탭 전환을 잠급니다.
  const [doneName, setDoneName] = useState('');
  const hero = useRef<HTMLElement>(null);
  const refs = { admin: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null), otp: useRef<HTMLInputElement>(null) };
  const first = useRef(true);
  // 첫 화면(랜딩): intro면 파란 패널이 전체 폭으로 시작하고, [평가 시작]에서 로그인 레이아웃으로 줄어듭니다.
  const [phase, setPhase] = useState<'intro' | 'login'>(intro ? 'intro' : 'login');
  const cta = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    if (intro) cta.current?.focus({ preventScroll: true });
    const t = timers.current;
    return () => t.forEach(window.clearTimeout);
  }, [intro]);
  function start() {
    if (phase !== 'intro') return;
    setPhase('login');
    const rm = reducedMotion();
    // 전환이 끝나면 주소만 /login으로 바꿉니다(컴포넌트를 다시 만들지 않아 애니메이션이 끊기지 않음).
    timers.current.push(window.setTimeout(() => tabs.current?.querySelector('button')?.focus({ preventScroll: true }), rm ? 0 : 450));
    timers.current.push(window.setTimeout(() => window.history.replaceState(window.history.state, '', '/login' + window.location.search), rm ? 0 : 650));
  }

  // 단계 전환이 끝날 즈음 그 단계의 입력칸으로 포커스(움직임 줄이기 설정이면 바로).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const target = view === 'done' ? null : refs[view];
    const id = window.setTimeout(() => target?.current?.focus({ preventScroll: true }), reducedMotion() ? 0 : 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (session) return <Navigate to={session.role === 'admin' ? '/admin' : '/eval'} replace />;

  function go(v: View) { setError(null); setView(v); }
  // 인증에 성공하면 완료 화면을 잠깐 보여 준 뒤 세션을 저장하고 이동합니다.
  function done(s: Session) {
    setDoneName(s.role === 'admin' ? '관리자' : s.name);
    setLocked(true); setError(null); setView('done');
    timers.current.push(window.setTimeout(() => finish(s), reducedMotion() ? 50 : 1100));
  }
  function finish(s: Session) {
    login(s);
    const next = params.get('next');
    navigate(next && next.startsWith(s.role === 'admin' ? '/admin' : '/eval') ? next : s.role === 'admin' ? '/admin' : '/eval', { replace: true });
  }
  const step = STEP[view];
  const back = BACK[view];

  return <div className={`login-page${phase === 'intro' ? ' is-intro' : ''}`}>
    <section className="login-hero" ref={hero} aria-hidden={phase !== 'intro'}>
      <div className="brand fade-up" style={{ '--d': '0ms' } as CSSProperties}><span className="brand-mark">심</span><strong>심사임당</strong></div>
      <div className="hero-body">
        <p className="hero-eyebrow fade-up" style={{ '--d': '100ms' } as CSSProperties}>공공 제안평가 지원 서비스</p>
        <h1 className="fade-up" style={{ '--d': '200ms' } as CSSProperties}>근거를 빠르게 찾고,<br />판단은 위원이 합니다.</h1>
        <CardStack heroRef={hero} />
        <ul className="hero-stats fade-up" style={{ '--d': '450ms' } as CSSProperties}>
          <li><strong><CountUp to={6} delay={intro ? 550 : 0} /></strong><span>업무 단계</span></li>
          <li><strong><CountUp to={3} delay={intro ? 550 : 0} /></strong><span>역할</span></li>
          <li><strong><CountUp to={0} delay={intro ? 550 : 0} /></strong><span>AI 자동 확정</span></li>
        </ul>
        <p className="hero-note fade-up" style={{ '--d': '330ms' } as CSSProperties}>AI가 찾은 근거에는 원문 쪽 번호가 붙고, 점수 입력·제출·확정은 사람만 할 수 있습니다.</p>
        <div className="hero-cta fade-up" style={{ '--d': '600ms' } as CSSProperties} inert={phase !== 'intro'} aria-hidden={phase !== 'intro'}>
          <div><button type="button" ref={cta} className="hero-start" onClick={start}>평가 시작 →</button></div>
        </div>
      </div>
      <small>© 2026 심사임당 · 팀 프로젝트 개발 화면</small>
    </section>
    <section className="login-panel" inert={phase === 'intro'} aria-hidden={phase === 'intro'}>
      <div className="login-wrap">
        <div className="login-card">
          <div className={`step-bars${view === 'admin' ? ' is-off' : ''}`} aria-hidden="true">
            {[0, 1, 2, 3].map(i => <i key={i} className={step === undefined ? '' : i < step ? 'done' : i === step ? 'now' : ''} />)}
          </div>
          <div className="login-top">
            {back ? <>
              <button type="button" className="back" onClick={() => go(back)} disabled={locked} aria-label="이전 단계">←</button>
              <span className="sr-only" aria-live="polite">{step! + 1} / 4 단계</span>
              <span className="muted" aria-hidden="true">{step! + 1} / 4</span>
            </> : view === 'done' ? null : <div className="seg" ref={tabs}>
              <button type="button" aria-pressed={view === 'name'} className={view === 'name' ? 'on' : ''} disabled={locked} onClick={() => go('name')}>평가위원</button>
              <button type="button" aria-pressed={view === 'admin'} className={view === 'admin' ? 'on' : ''} disabled={locked} onClick={() => go('admin')}>관리자</button>
            </div>}
          </div>
          <div className="slide-stage login-stage">
            <AdminLogin view={view} inputRef={refs.admin} error={error} setError={setError} onDone={done} />
            <EvaluatorSteps view={view} go={go} refs={refs} error={error} setError={setError} onDone={done} locked={locked} setLocked={setLocked} />
            <Slide id="done" view={view}>
              <div className="done-wrap" role="status">
                <svg className="done-check" viewBox="0 0 80 80" width="96" height="96" fill="none" aria-hidden="true">
                  <circle cx="40" cy="40" r="36" /><path d="M25 41l10 10 20-22" />
                </svg>
                <h2 className="say-title">{doneName}님,<br />확인됐어요</h2>
                <p className="say-sub">잠시 후 화면으로 이동합니다.</p>
              </div>
            </Slide>
          </div>
        </div>
      </div>
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

function AdminLogin({ view, inputRef, error, setError, onDone }: {
  view: View; inputRef: InputRef; error: unknown; setError: (e: unknown) => void; onDone: (s: Session) => void;
}) {
  // mock 빌드에서만 데모 계정이 미리 채워집니다(실제 빌드에서는 빈 칸).
  const [username, setUsername] = useState(import.meta.env.VITE_USE_MOCK === '1' ? 'admin' : '');
  const [password, setPassword] = useState(import.meta.env.VITE_USE_MOCK === '1' ? 'admin' : '');
  const [busy, setBusy] = useState(false);
  const ready = username.trim() !== '' && password !== '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try { onDone(await request<Session>('POST', '/api/v1/auth/login', { username: username.trim(), password })); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Slide id="admin" view={view} as="form" onSubmit={submit}>
    <h2 className="say-title">관리자 계정으로<br />로그인해 주세요</h2>
    <p className="say-sub">기관에서 받은 계정을 입력하세요.</p>
    <div className="login-fields">
      <label className="uline"><span>아이디</span><input ref={inputRef} name="username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
      <label className="uline"><span>비밀번호</span><input name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
    </div>
    {view === 'admin' && error !== null && errorView(error)}
    <div className="cta-bar">
      <button className="btn primary block lg" disabled={!ready || busy}>{busy ? '확인 중…' : '로그인'}</button>
      {!ready && <p className="muted center cta-hint">아이디와 비밀번호를 모두 입력해 주세요.</p>}
    </div>
  </Slide>;
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

function EvaluatorSteps({ view, go, refs, error, setError, onDone, locked, setLocked }: {
  view: View; go: (v: View) => void; error: unknown; setError: (e: unknown) => void; onDone: (s: Session) => void;
  refs: { name: InputRef; phone: InputRef; otp: InputRef }; locked: boolean; setLocked: (b: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<OtpIssued | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // 인증번호 유효시간: 발급(재발급 포함)할 때마다 처음부터 셉니다. 초 단위 변화는 읽어 주지 않고 만료만 알립니다.
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!issued) return;
    const end = Date.now() + issued.expires_in * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(() => { tick(); if (Date.now() >= end) window.clearInterval(id); }, 1000);
    return () => window.clearInterval(id);
  }, [issued]);
  const expired = view === 'otp' && !!issued && left === 0;

  const phoneDigits = phone.replace(/\D/g, '');
  const nameOk = name.trim().length >= 2;
  const phoneOk = /^01\d{8,9}$/.test(phoneDigits);
  const codeOk = /^\d{6}$/.test(code) && !expired;

  async function requestOtp(n = name.trim(), p = phone): Promise<OtpIssued | null> {
    setError(null); setBusy(true);
    try {
      const o = await request<OtpIssued>('POST', '/api/v1/auth/evaluator/otp', { name: n, phone: p });
      setIssued(o); setCode(''); return o;
    } catch (err) { setError(err); return null; } finally { setBusy(false); }
  }
  /** 인증번호 확인. 성공하면 true(완료 화면으로), 실패하면 false. */
  async function verify(value: string, o = issued): Promise<boolean> {
    if (busy || !o) return false;
    setError(null); setBusy(true);
    try { onDone(await request<Session>('POST', '/api/v1/auth/evaluator/verify', { request_id: o.request_id, code: value })); return true; }
    catch (err) {
      setError(err); setShake(true); setCode('');
      window.setTimeout(() => refs.otp.current?.focus({ preventScroll: true }), 0);
      return false;
    } finally { setBusy(false); }
  }
  function onCode(v: string) {
    if (locked) return;
    const c = v.replace(/\D/g, '').slice(0, 6);
    setCode(c);
    if (c.length === 6 && !expired) void verify(c); // 6자리가 다 차면 바로 확인
  }

  /** 글자를 한 칸씩 채우는 연출(총 total ms). */
  async function typeInto(text: string, set: (s: string) => void, total: number) {
    if (reducedMotion()) { set(text); return; }
    for (let i = 1; i <= text.length && alive.current; i++) { set(text.slice(0, i)); await wait(total / text.length); }
  }
  // mock 전용: 가상 위원을 누르면 이름 → 휴대폰 → 인증번호 → 확인을 실제 로그인 API로 자동 진행합니다.
  async function autoRun(m: Member) {
    if (locked || busy) return;
    setLocked(true); setError(null); setName(''); setPhone(''); setCode('');
    await typeInto(m.name, setName, 400);
    await wait(250); if (!alive.current) return;
    go('phone'); await wait(500);
    await typeInto(m.phone, s => setPhone(formatPhone(s)), 400);
    await wait(250); if (!alive.current) return;
    const o = await requestOtp(m.name, m.phone);
    if (!alive.current) return;
    if (!o) { setLocked(false); return; }
    go('otp'); await wait(550);
    await typeInto(o.demo_code ?? '', setCode, 540); // 칸당 약 90ms
    await wait(200); if (!alive.current) return;
    if (!(await verify(o.demo_code ?? '', o)) && alive.current) setLocked(false);
  }

  return <>
    <Slide id="name" view={view} as="form" onSubmit={e => { e.preventDefault(); if (nameOk && !locked) go('phone'); }}>
      <h2 className="say-title">성함을<br />알려 주세요</h2>
      <p className="say-sub">간사가 등록한 평가위원 정보와 맞춰 볼게요.</p>
      <label className="uline"><span>이름</span><input ref={refs.name} value={name} onChange={e => setName(e.target.value)} placeholder="이름" autoComplete="name" readOnly={locked} /></label>
      {DemoMembers && view === 'name' && <Suspense fallback={null}><DemoMembers disabled={locked} onPick={autoRun} /></Suspense>}
      <div className="cta-bar">
        <button className="btn primary block lg" disabled={!nameOk || locked}>다음</button>
        {!nameOk && !locked && <p className="muted center cta-hint">이름을 두 글자 이상 입력해 주세요.</p>}
      </div>
    </Slide>

    <Slide id="phone" view={view} as="form" onSubmit={async e => { e.preventDefault(); if (phoneOk && !busy && !locked && await requestOtp()) go('otp'); }}>
      <h2 className="say-title">휴대폰 번호를<br />알려 주세요</h2>
      <p className="say-sub">등록된 번호로 인증번호를 보내드려요.</p>
      <label className="uline"><span>휴대폰 번호</span><input ref={refs.phone} value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" autoComplete="tel" readOnly={locked} /></label>
      {view === 'phone' && error !== null && errorView(error)}
      <div className="cta-bar">
        <button className="btn primary block lg" disabled={!phoneOk || busy || locked}>{busy ? '보내는 중…' : '인증번호 받기'}</button>
        {!phoneOk && !locked && <p className="muted center cta-hint">휴대폰 번호 11자리를 입력해 주세요.</p>}
      </div>
    </Slide>

    <Slide id="otp" view={view} as="form" onSubmit={e => { e.preventDefault(); if (codeOk && !locked) void verify(code); }}>
      <h2 className="say-title">인증번호를<br />입력해 주세요</h2>
      <p className="say-sub">{phone}로 보낸 6자리 숫자예요.</p>
      <label className="uline"><span>인증번호 6자리</span>
        <span className={`otp-boxes${shake ? ' shake' : ''}`} onAnimationEnd={() => setShake(false)}>
          <input ref={refs.otp} value={code} onChange={e => onCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            className="otp-input" aria-describedby="otp-timer" readOnly={locked} />
          {[0, 1, 2, 3, 4, 5].map(i => <i key={i} aria-hidden="true" className={`otp-box${code[i] ? ' filled' : ''}${i === Math.min(code.length, 5) ? ' cur' : ''}`}>{code[i] ?? ''}</i>)}
        </span>
      </label>
      <div id="otp-timer" className={`otp-timer${expired ? ' expired' : ''}`}>
        {expired ? <span role="alert">인증번호가 만료됐어요</span>
          : <span>남은 시간 <strong className="mono">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</strong></span>}
      </div>
      {import.meta.env.VITE_USE_MOCK === '1' && issued?.demo_code && <Notice tone="warning" title="데모 · 실제 문자를 보내지 않았어요">
        인증번호 <strong className="mono">{issued.demo_code}</strong>{' '}
        <button type="button" className="link" disabled={locked} onClick={() => onCode(issued.demo_code!)}>자동 입력</button>
      </Notice>}
      <button type="button" className="link otp-resend" disabled={busy || locked} onClick={() => { void requestOtp(); }}>인증번호 다시 받기</button>
      {view === 'otp' && error !== null && errorView(error)}
      <div className="cta-bar">
        <button className="btn primary block lg" disabled={!codeOk || busy || locked}>{busy ? '확인 중…' : '확인'}</button>
        <p className="muted center cta-hint">문자가 오지 않으면 간사에게 연락해 주세요.</p>
      </div>
    </Slide>
  </>;
}
