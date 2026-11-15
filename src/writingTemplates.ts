import type { JSONContent } from '@tiptap/react';
import type { TrpgBlockKind } from './TrpgBlock';

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const paragraph = (value = ''): JSONContent => ({ type: 'paragraph', ...(value ? { content: [text(value)] } : {}) });
const heading = (title: string): JSONContent => ({ type: 'heading', attrs: { level: 2 }, content: [text(title)] });
const block = (kind: TrpgBlockKind, value: string): JSONContent => ({ type: 'trpgBlock', attrs: { kind }, content: [paragraph(value)] });

export const manuscriptTemplates: Record<string, () => JSONContent[]> = {
  '시나리오 개요': () => [heading('시나리오 개요'), paragraph('배경 · 시대 · 예상 플레이 시간 · 인원'),
    heading('탐사자가 사건에 참여하는 이유'), paragraph(), block('gm', '진상과 주요 결말 조건')],
  '장면 진행': () => [heading('장면 제목'), block('read', '탐사자에게 읽어 줄 첫인상'),
    block('gm', '이 장면의 목적과 등장인물'), block('check', '판정과 필수 단서의 대체 획득 경로'), block('branch', '선택과 가능한 진행')],
  'CoC 판정·이성': () => [block('check', '기능과 난이도\n성공 시 결과\n실패 시 대체 진행'), block('check', '이성 판정 · 성공 시 손실 / 실패 시 손실'), block('gm', '발동 조건과 후속 연출')],
  'NPC 소개': () => [heading('NPC 이름'), paragraph('외형과 첫인상'), block('gm', '목적 · 비밀 · 알고 있는 단서'), block('check', '주요 기능치와 전투 정보')]
};

export const handoutTemplates: Record<string, string[]> = {
  '빈 문서': [],
  '편지': ['수신인', '본문', '발신인'],
  '일기': ['날짜', '오늘 있었던 일'],
  '보고서': ['보고 일시 및 작성자', '관찰 내용', '후속 조치'],
  '신문': ['발행일 및 호수', '기사 제목', '기사 본문'],
  '공문서': ['문서 번호 및 발신 기관', '제목', '본문 및 서명']
};
export function handoutDocument(template: string): JSONContent {
  const sections = handoutTemplates[template] || [];
  return { type: 'doc', content: sections.length ? sections.flatMap(section => [heading(section), paragraph()]) : [paragraph()] };
}
export function documentText(node: JSONContent): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inline = node.type === 'paragraph' || node.type === 'heading';
  return (node.content || []).map(documentText).join(inline ? '' : '\n');
}
