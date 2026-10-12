import { api, request, unwrap, type Project } from '../../api/client';
import type { CriteriaRead, DocumentRead, ProgressRead, Stage, VendorRead } from '../../api/contract';
import { vendorLetter, vendorName } from '../../lib/format';
import type { Tone } from '../../ui/ui';

/** 사업 안의 7단계. 사이드바·칩·개요·다음 버튼이 모두 이 표 하나를 씁니다. */
export const STEPS = [
  { key: 'rfp', label: '제안요청서 등록' },
  { key: 'criteria', label: '평가기준 확정' },
  { key: 'proposals', label: '제안서 등록' },
  { key: 'committee', label: '평가위원 선정' },
  { key: 'progress', label: '평가 진행' },
  { key: 'results', label: '결과·위원장 확인' },
  { key: 'close', label: '보고·완료' },
] as const;
export type StepKey = typeof STEPS[number]['key'];
export const stepLabel = (k: StepKey) => STEPS.find(s => s.key === k)!.label;
export const stepNo = (k: StepKey) => STEPS.findIndex(s => s.key === k) + 1;
export const nextStep = (k: StepKey): StepKey | null => STEPS[STEPS.findIndex(s => s.key === k) + 1]?.key ?? null;
export const projectPath = (pid: string, step?: StepKey) => `/admin/projects/${pid}${step ? `/${step}` : ''}`;

export const stageInfo: Record<Stage, { label: string; tone: Tone }> = {
  preparing: { label: '평가기준 준비', tone: 'warning' },
  committee: { label: '위원 선정', tone: 'info' },
  evaluating: { label: '평가 진행', tone: 'primary' },
  collecting_done: { label: '위원장 확인 대기', tone: 'warning' },
  confirmed: { label: '결과 확인 완료', tone: 'success' },
  closed: { label: '완료', tone: 'success' },
};

export async function loadProjects() { return unwrap(await api.GET('/api/v1/projects')); }

export async function loadProject(projectId: string): Promise<Project> {
  const project = (await loadProjects()).find(p => p.id === projectId);
  if (!project) throw new Error('사업을 찾을 수 없습니다.');
  return project;
}

export interface ProjectSummary { project: Project; progress: ProgressRead; criteria: CriteriaRead }
export async function loadSummary(project: Project): Promise<ProjectSummary> {
  const [progress, criteria] = await Promise.all([
    request<ProgressRead>('GET', `/api/v1/projects/${project.id}/progress`),
    request<CriteriaRead>('GET', `/api/v1/projects/${project.id}/criteria`),
  ]);
  return { project, progress, criteria };
}

/** vendors API가 아직 없을 때(404) 사업의 기존 vendor_ids로 대신 보여 줍니다. */
export function fallbackVendors(project: Project): VendorRead[] {
  return project.vendor_ids.map(id => ({ vendor_id: id, code: vendorLetter(id), name: vendorName(id), registered_at: '' }));
}

export interface StepState { done: boolean }
/** 문서·제안사·위원·제출·완료 현황으로 7단계의 완료 여부와 "지금 할 단계"를 계산합니다. */
export function stepStates(summary: ProjectSummary, docs: DocumentRead[], vendors: VendorRead[]) {
  const { progress, criteria } = summary;
  const isDone = (d: DocumentRead) => d.job.status === 'done';
  const rfpDone = docs.some(d => d.kind === 'rfp' && isDone(d));
  const proposalsDone = vendors.filter(v => docs.some(d => d.kind === 'proposal' && d.vendor_id === v.vendor_id && isDone(d)));
  const members = progress.members.filter(m => m.role !== 'reserve');
  const stage = progress.stage;
  const done: Record<StepKey, boolean> = {
    rfp: rfpDone,
    criteria: criteria.status === 'confirmed',
    proposals: vendors.length > 0 && proposalsDone.length === vendors.length,
    committee: progress.members.length > 0 && !!progress.chair_id,
    progress: members.length > 0 && (stage === 'collecting_done' || stage === 'confirmed' || stage === 'closed'),
    results: stage === 'confirmed' || stage === 'closed',
    close: stage === 'closed',
  };
  const current = STEPS.find(s => !done[s.key])?.key ?? null;
  return { done, current, proposalsDone, rfpDone };
}

/** 지금 할 일 한 줄. 단계별 문구는 개요·대시보드가 함께 씁니다. */
export function nowText(step: StepKey | null, ctx: { vendors: VendorRead[]; proposalsDone: number; submittedLeft: number }) {
  switch (step) {
    case 'rfp': return '제안요청서를 올려 주세요';
    case 'criteria': return '평가기준 초안을 검토하고 확정해 주세요';
    case 'proposals': return ctx.vendors.length ? `제안서를 올려 주세요 (${ctx.proposalsDone}/${ctx.vendors.length}곳 완료)` : '제안사를 등록해 주세요';
    case 'committee': return '평가위원을 추첨하고 위원장을 지정해 주세요';
    case 'progress': return ctx.submittedLeft > 0 ? `평가 일정을 정하고, 아직 제출하지 않은 ${ctx.submittedLeft}명을 확인해 주세요` : '평가 일정을 확인해 주세요';
    case 'results': return '위원장이 결과를 확인할 차례예요';
    case 'close': return '보고서를 확인하고 사업을 완료해 주세요';
    default: return '모든 단계를 마쳤어요';
  }
}

/** 대시보드용(문서·제안사를 따로 불러오지 않는) 처리할 일. */
export function todoOf({ progress, criteria }: ProjectSummary): { text: string; step: StepKey } | null {
  const members = progress.members.filter(m => m.role !== 'reserve');
  switch (progress.stage) {
    case 'preparing': return criteria.status === 'draft'
      ? { text: 'AI가 만든 평가기준 초안을 검토하고 확정해 주세요.', step: 'criteria' }
      : { text: '제안요청서를 올려 평가기준 초안을 만드세요.', step: 'rfp' };
    case 'committee': return { text: '평가위원을 추첨하고 위원장을 지정해 주세요.', step: 'committee' };
    case 'evaluating': {
      const left = members.filter(m => m.sheet_status !== 'submitted').length;
      return { text: `평가위원 ${left}명이 아직 제출하지 않았습니다.`, step: 'progress' };
    }
    case 'collecting_done': return { text: '전원 제출 완료. 위원장의 결과 확인을 기다리고 있습니다.', step: 'results' };
    case 'confirmed': return { text: '위원장이 결과를 확인했어요. 보고서를 확인하고 사업을 완료해 주세요.', step: 'close' };
    default: return null;
  }
}
