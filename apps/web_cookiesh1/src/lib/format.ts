export function vendorName(id: string) { return id.replace('vendor-', '').toUpperCase() + '사'; }

export function formatTime(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '미정';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function pageLabel(physical: number | null, printed: string | null) {
  if (physical === null) return '쪽 미확인';
  return printed ? `p.${physical} (인쇄 ${printed}쪽)` : `p.${physical}`;
}

export function formatScore(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }
