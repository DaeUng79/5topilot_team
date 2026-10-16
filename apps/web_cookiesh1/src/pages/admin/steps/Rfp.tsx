import { Card, Notice } from '../../../ui/ui';
import { useRfpApi } from '../../../api/client';
import { useProjectData } from '../ProjectContext';
import { StepFrame } from '../StepFrame';
import { DocRow } from './docParts';
import { RfpRequirements } from './RfpRequirements';

export function RfpStep() {
  const { summary, docs, steps, closed, refresh } = useProjectData();
  const doc = docs.find(d => d.kind === 'rfp');
  return <StepFrame step="rfp" sub={steps.rfpDone ? '제안요청서를 읽었어요' : useRfpApi ? 'HWPX 파일을 올리면 내용을 파싱해 SQLite에 저장합니다' : '제안요청서를 올리면 AI가 평가기준 초안을 만들어요'}>
    <Card title="제안요청서" actions={<span className="muted">HWPX만 처리 · 50MB 이하</span>}>
      <ul className="doc-list"><DocRow pid={summary.project.id} slot={{ kind: 'rfp', vendor: null, label: '제안요청서' }} doc={doc}
        locked={closed || summary.criteria.locked} highlight focused={false} projectName={summary.project.name} onUploaded={() => void refresh()} /></ul>
    </Card>
    {useRfpApi && <RfpRequirements pid={summary.project.id} doc={doc} />}
    {steps.rfpDone && summary.criteria.status !== 'none' && <Notice tone="success" title="평가기준 초안이 준비됐어요">아래 버튼으로 이어서 항목과 배점을 확인하고 확정하세요.</Notice>}
  </StepFrame>;
}
