import { beforeEach, describe, expect, it } from 'vitest';
import { clearUserDrafts, DRAFT_TTL_MS, purgeExpiredDrafts, readDraft, writeDraft } from './draft';

const base = { base_version: 1, scores: [{ vendor_id: 'vendor-a', criterion_id: 'c1', score: 0 }], opinion: '' };

describe('평가 임시보관', () => {
  beforeEach(() => localStorage.clear());

  it('저장한 점수(0점 포함)를 그대로 복원한다', () => {
    writeDraft('p1', 'cand-1', base);
    expect(readDraft('p1', 'cand-1')?.scores[0].score).toBe(0);
  });

  it('24시간이 지나면 읽을 때 폐기한다', () => {
    const t = Date.now();
    writeDraft('p1', 'cand-1', base, t);
    expect(readDraft('p1', 'cand-1', t + DRAFT_TTL_MS + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('앱 시작 시 만료 항목만 일괄 삭제한다', () => {
    const t = Date.now();
    writeDraft('p1', 'old', base, t - DRAFT_TTL_MS - 1);
    writeDraft('p1', 'new', base, t);
    localStorage.setItem('other-key', 'keep');
    purgeExpiredDrafts(t);
    expect(readDraft('p1', 'old', t)).toBeNull();
    expect(readDraft('p1', 'new', t)).not.toBeNull();
    expect(localStorage.getItem('other-key')).toBe('keep');
  });

  it('로그아웃하면 해당 사용자의 임시보관만 지운다', () => {
    writeDraft('p1', 'cand-1', base); writeDraft('p2', 'cand-1', base); writeDraft('p1', 'cand-2', base);
    clearUserDrafts('cand-1');
    expect(readDraft('p1', 'cand-1')).toBeNull();
    expect(readDraft('p2', 'cand-1')).toBeNull();
    expect(readDraft('p1', 'cand-2')).not.toBeNull();
  });

  it('이름·연락처를 저장하지 않는다', () => {
    writeDraft('p1', 'cand-1', base);
    const raw = localStorage.getItem('simsa-draft:p1:cand-1')!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['base_version', 'opinion', 'saved_at', 'scores']);
  });
});
