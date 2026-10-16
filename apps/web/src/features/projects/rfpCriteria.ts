import type { CriterionDraft, ProjectSetup, RfpCriteria } from '../../api/client';

// 제안요청서 파싱 결과(GET /projects/{id}/rfp-criteria)와 현재 평가항목을 비교해 미리보기 행을 만들고,
// 담당자가 검토한 결과를 PUT /projects/{id}/setup/criteria 본문으로 합친다. 서버 쪽 계산 규칙은 바꾸지 않는다.
// 짝 맞추기 규칙: ① source_ref(문서ID:행ID)가 같으면 같은 항목 ② 아니면 이름이 공백 정리 뒤 완전히 같을 때만.
// 이름이 비슷하다는 이유만으로는 같은 항목으로 보지 않는다. 같은 결과를 다시 반영해도 ①로 짝이 맞아 중복이 생기지 않는다.

export type RfpItem = RfpCriteria['items'][number];
export type RfpSupplemental = RfpCriteria['supplemental'][number];
export type Criterion = ProjectSetup['criteria'][number];
export type RowStatus = 'new' | 'changed' | 'same';
export type RowKind = 'official' | 'ai';

export type PreviewRow = {
  key: string;
  kind: RowKind; // official: 제안요청서 원문 평가표, ai: AI 초안·보완 제안(자동 반영 안 함)
  status: RowStatus;
  include: boolean;
  name: string;
  max_score: number;
  current: Criterion | null; // 짝이 맞은 현재 항목
  division: string | null;
  description: string | null;
  elements: string[];
  source_ref: string;
  source_label: string;
  source_quote: string | null;
};
export type UnmatchedRow = { criterion: Criterion; remove: boolean };
export type Preview = { rows: PreviewRow[]; unmatched: UnmatchedRow[] };

export const STATUS_LABEL: Record<RowStatus, string> = { new: '신규', changed: '배점 변경', same: '동일' };

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

function matchCurrent(current: Criterion[], target: { source_ref: string | null; name: string }, used: Set<string>): Criterion | null {
  const byRef = target.source_ref ? current.find(c => c.source_ref === target.source_ref && !used.has(c.id)) : undefined;
  const found = byRef ?? current.find(c => normalize(c.name) === normalize(target.name) && !used.has(c.id));
  if (found) used.add(found.id);
  return found ?? null;
}

export function buildPreview(current: Criterion[], parsed: RfpCriteria): Preview {
  const used = new Set<string>();
  const rows: PreviewRow[] = parsed.items.map(item => {
    const match = matchCurrent(current, item, used);
    const official = item.origin === 'rfp';
    return {
      key: item.source_ref,
      kind: official ? 'official' : 'ai',
      status: !match ? 'new' : match.max_score !== item.score ? 'changed' : 'same',
      include: official, // 공식 기준만 기본 선택. AI 초안은 담당자가 직접 고른다.
      name: item.name,
      max_score: item.score,
      current: match,
      division: item.division ?? null,
      description: item.description ?? null,
      elements: item.elements,
      source_ref: item.source_ref,
      source_label: item.source_label,
      source_quote: null,
    };
  });
  const documentId = parsed.source?.document_id ?? 'rfp';
  parsed.supplemental.forEach((item, index) => {
    const ref = `${documentId}:supplemental:${item.source_id ?? index + 1}`;
    const match = matchCurrent(current, { source_ref: ref, name: item.name }, used);
    rows.push({
      key: ref,
      kind: 'ai',
      status: match ? 'same' : 'new',
      include: false,
      name: item.name,
      max_score: match?.max_score ?? 0,
      current: match,
      division: null,
      description: item.description ?? null,
      elements: item.elements,
      source_ref: ref,
      source_label: `AI 보완 제안 · 원문 ${item.source_id ?? '출처 미상'}`,
      source_quote: item.source_quote ?? null,
    });
  });
  const unmatched = current.filter(c => !used.has(c.id)).map(criterion => ({ criterion, remove: false }));
  return { rows, unmatched };
}

// 반영 목록: 포함한 행(짝이 있으면 ID 유지) → 포함하지 않았지만 짝이 있던 현재 항목(그대로) → 삭제하지 않은 나머지 현재 항목.
export function mergeCriteria(current: Criterion[], preview: Preview): CriterionDraft[] {
  const included = preview.rows.filter(row => row.include);
  const includedIds = new Set(included.map(row => row.current?.id).filter((id): id is string => !!id));
  const removed = new Set(preview.unmatched.filter(row => row.remove).map(row => row.criterion.id));
  const fromRows: CriterionDraft[] = included.map(row => ({
    id: row.current?.id ?? null,
    name: row.name.trim(),
    max_score: row.max_score,
    division: row.division ?? row.current?.division ?? null,
    description: row.description ?? row.current?.description ?? null,
    elements: row.elements.length ? row.elements : row.current?.elements ?? null,
    origin: row.kind === 'official' ? 'rfp' : 'ai',
    source_ref: row.source_ref,
    source_label: row.source_label,
  }));
  const kept: CriterionDraft[] = current.filter(c => !includedIds.has(c.id) && !removed.has(c.id));
  return [...fromRows, ...kept];
}

export function mergedTotal(current: Criterion[], preview: Preview): number {
  return mergeCriteria(current, preview).reduce((sum, c) => sum + c.max_score, 0);
}
