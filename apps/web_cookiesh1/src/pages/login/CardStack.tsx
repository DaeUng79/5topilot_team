import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { VendorDot } from '../../ui/ui';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CARDS = [
  { id: 'A', name: 'A사 제안서', page: 'p.12', hi: [1, 3], x: -64, y: 18, r: -9, z: 1 },
  { id: 'B', name: 'B사 제안서', page: 'p.27', hi: [2], x: 0, y: -6, r: -1, z: 2 },
  { id: 'C', name: 'C사 제안서', page: 'p.8', hi: [0, 3], x: 64, y: 22, r: 8, z: 3 },
] as const;

/** 장식용 제안서 카드 더미. 포인터를 따라 살짝 기울어지고, 움직임 줄이기 설정에서는 정지합니다. */
export function CardStack({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current, el = tilt.current;
    if (!hero || !el || reduced()) return;
    let raf = 0, rx = 0, ry = 0;
    const apply = () => { raf = 0; el.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`; };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const move = (e: PointerEvent) => {
      const b = hero.getBoundingClientRect();
      ry = ((e.clientX - b.left) / b.width - 0.5) * 12;
      rx = -((e.clientY - b.top) / b.height - 0.5) * 12;
      queue();
    };
    const leave = () => { rx = 0; ry = 0; queue(); };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => { hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave); if (raf) cancelAnimationFrame(raf); };
  }, [heroRef]);

  return <div className="cs-scene" aria-hidden="true">
    <div className="cs-tilt" ref={tilt}>
      {CARDS.map((c, i) => <div key={c.id} className="cs-card"
        style={{ '--x': `${c.x}px`, '--y': `${c.y}px`, '--r': `${c.r}deg`, '--i': i, zIndex: c.z } as CSSProperties}>
        <div className="cs-head"><VendorDot id={c.id} /><strong>{c.name}</strong></div>
        <div className="cs-lines">
          {[0, 1, 2, 3].map(n => <i key={n} className={(c.hi as readonly number[]).includes(n) ? 'hl' : ''} style={{ width: `${[92, 78, 86, 58][(n + i) % 4]}%` }} />)}
        </div>
        <div className="cs-foot"><span className="cs-tag">근거</span><span className="cs-page">{c.page}</span></div>
      </div>)}
    </div>
  </div>;
}

/** 0에서 목표값까지 한 번만 올라갑니다. 움직임 줄이기에서는 바로 최종값을 보여 줍니다. */
export function CountUp({ to, duration = 800 }: { to: number; duration?: number }) {
  const [v, setV] = useState(() => (reduced() ? to : 0));
  useEffect(() => {
    if (reduced() || to === 0) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v}</>;
}
