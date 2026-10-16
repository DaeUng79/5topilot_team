import type { CSSProperties } from 'react';
import type { VendorRead } from '../../api/contract';

/** 관리자에게는 코드와 업체명을 함께 보여 줍니다. (평가위원 화면은 코드만) */
export function VendorTag({ vendor, nameOnly = false }: { vendor: Pick<VendorRead, 'code' | 'name'>; nameOnly?: boolean }) {
  const code = vendor.code.toUpperCase();
  return <span className="vendor-label">
    <span className="vendor-dot" aria-hidden="true" style={{ '--vc': `var(--vendor-${code.toLowerCase()}, var(--gray-50))` } as CSSProperties}>{code}</span>
    {nameOnly ? vendor.name : <>{code}사<span className="vendor-real">{vendor.name}</span></>}
  </span>;
}
