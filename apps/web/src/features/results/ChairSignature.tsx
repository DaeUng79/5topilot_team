import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Confirmation } from '../../api/client';
import './signature.css';

// 평가위원장 자필 서명 입력(마우스·터치·펜). 그린 결과를 PNG data URL로 상위에 돌려주며 외부 라이브러리를 쓰지 않는다.
// 서명 이미지는 서버(result_confirmations)에 확정 기록과 함께 저장되고, 법적 효력이 있는 전자서명이 아니다(로컬 시연용).
export function SignaturePad({ disabled = false, onChange }: { disabled?: boolean; onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // 화면 픽셀 비율만큼 해상도를 올려 저장 이미지가 흐려지지 않게 한다. 좌표는 CSS 픽셀 기준으로 그린다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e2a44';
  }, []);

  function position(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = position(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); // 점만 찍어도 보이게
    setHasStrokes(true);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = position(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const url = e.currentTarget.toDataURL('image/png');
    setPreview(url); onChange(url);
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    setHasStrokes(false); setPreview(null); onChange(null);
  }

  return <div className="signature-pad">
    <canvas ref={canvasRef} className="signature-canvas" role="img" aria-label="서명 입력 영역" aria-disabled={disabled}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    <div className="actions">
      <button type="button" disabled={disabled || !hasStrokes} onClick={clear}>서명 지우기</button>
      <span className="muted">{hasStrokes ? '다시 쓰려면 지우기를 누른 뒤 서명하세요.' : '위 영역에 마우스나 손가락으로 서명하세요.'}</span>
    </div>
    {preview && <figure className="signature-preview"><img src={preview} alt="서명 미리보기" /><figcaption className="muted">서명 미리보기</figcaption></figure>}
  </div>;
}

// 저장된 위원장 서명·확정 기록 표시. 위원장 화면, 관리자 결과 화면, 결과표(인쇄)에서 같이 쓴다.
export function ChairSignatureRecord({ confirmation, chairName }: { confirmation: Confirmation; chairName?: string }) {
  const name = confirmation.signer_name ?? chairName ?? confirmation.confirmed_by;
  return <div className="signature-record">
    <p>{confirmation.signature_image ? '서명 완료' : '확정 완료(서명 이미지 없음)'} · 평가위원장 <strong>{name}</strong> ({confirmation.confirmed_by}) · 서명 일시 {confirmation.confirmed_at}</p>
    {confirmation.signature_image && <img className="signature-image" src={confirmation.signature_image} alt="평가위원장 서명" />}
    <p className="hash">결과 SHA-256: {confirmation.result_sha256} · 기준 v{confirmation.criteria_version} · {confirmation.policy_version}
      {confirmation.signature_sha256 && <> · 서명 SHA-256: {confirmation.signature_sha256}</>} · {confirmation.sign_method ?? '서명 이미지 없음(서명 기능 추가 전 기록)'}</p>
  </div>;
}
