export const levels = ['펌블', '실패', '보통 성공', '어려운 성공', '극단적 성공', '대성공'] as const;
export type RollLevel = typeof levels[number];
export type Difficulty = 'regular' | 'hard' | 'extreme';
export const difficulties: Record<Difficulty, string> = { regular: '보통', hard: '어려움', extreme: '극단적' };
export const ruleSources = { official: '공식 기본 규칙', optional: '선택 규칙', house: '하우스룰', narrative: '시나리오 연출' } as const;
export type RuleKind = 'skill' | 'opposed' | 'san' | 'combat' | 'chase';
export const ruleKinds: Record<RuleKind, string> = { skill: '기능·특성치', opposed: '대항 판정', san: '이성(SAN)', combat: '전투', chase: '추적' };
export type RuleDraft = {
  kind: RuleKind;
  source: keyof typeof ruleSources;
  skill: string;
  rating: number;
  difficulty: Difficulty;
  bonus: number;
  opponentRating: number;
  opponentBonus: number;
  defense: 'dodge' | 'fightBack';
  successLoss: string;
  failureLoss: string;
  success: string;
  failure: string;
  outcomes: Partial<Record<RollLevel, string>>;
  push: string;
  notes: string;
};
export const emptyRule: RuleDraft = {
  kind: 'skill', source: 'official', skill: '', rating: 50, difficulty: 'regular', bonus: 0,
  opponentRating: 50, opponentBonus: 0, defense: 'dodge', successLoss: '0', failureLoss: '1D6',
  success: '', failure: '', outcomes: {}, push: '', notes: ''
};
export function thresholds(rating: number): Record<Difficulty, number> {
  if (!Number.isInteger(rating) || rating < 0) throw Error('기준값은 0 이상의 정수여야 합니다.');
  return { regular: rating, hard: Math.floor(rating / 2), extreme: Math.floor(rating / 5) };
}
export function classify(roll: number, rating: number, difficulty: Difficulty = 'regular'): RollLevel {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw Error('D100 결과는 1부터 100까지입니다.');
  const limit = thresholds(rating);
  if (roll === 1) return '대성공';
  if (roll === 100 || (roll >= 96 && limit[difficulty] < 50)) return '펌블';
  if (roll <= limit.extreme) return '극단적 성공';
  if (roll <= limit.hard) return '어려운 성공';
  if (roll <= limit.regular) return '보통 성공';
  return '실패';
}
export function meets(level: RollLevel, difficulty: Difficulty) {
  return levels.indexOf(level) >= ({ regular: 2, hard: 3, extreme: 4 })[difficulty];
}
export function percentile(units: number, tens: number[], modifier = 0) {
  if (![units, ...tens].every(n => Number.isInteger(n) && n >= 0 && n <= 9) ||
      !Number.isInteger(modifier) || Math.abs(modifier) > 2 || tens.length !== Math.abs(modifier) + 1) {
    throw Error('보너스·패널티에 맞는 D100 십의 자리 주사위가 필요합니다.');
  }
  const candidates = tens.map(n => n * 10 + units || 100);
  return modifier > 0 ? Math.min(...candidates) : Math.max(...candidates);
}
export function rollPercentile(modifier: number, random = Math.random) {
  const digit = () => Math.floor(random() * 10);
  return percentile(digit(), Array.from({ length: Math.abs(modifier) + 1 }, digit), modifier);
}
export function chanceOfSuccess(rating: number, difficulty: Difficulty, modifier: number) {
  if (!Number.isInteger(modifier) || Math.abs(modifier) > 2) throw Error('보너스·패널티 범위는 -2부터 +2까지입니다.');
  const limit = thresholds(rating)[difficulty];
  let wins = 0, cases = 0;
  const walk = (units: number, tens: number[]) => {
    if (tens.length === 1 + Math.abs(modifier)) {
      const result = percentile(units, tens, modifier);
      if (result === 1 || (result <= limit && result !== 100 && (limit >= 50 || result < 96))) wins++;
      cases++;
      return;
    }
    for (let digit = 0; digit <= 9; digit++) walk(units, [...tens, digit]);
  };
  for (let units = 0; units <= 9; units++) walk(units, []);
  return wins / cases;
}
export function opposed(a: RollLevel, b: RollLevel, rating: number, opponentRating: number) {
  if (!meets(a, 'regular') && !meets(b, 'regular')) return '양쪽 실패 · KP 판단';
  const delta = levels.indexOf(a) - levels.indexOf(b) || rating - opponentRating;
  return delta > 0 ? '판정자 승리' : delta < 0 ? '상대 승리' : '동률 · 양쪽 D100 재굴림, 낮은 쪽 승리';
}
export function melee(a: RollLevel, b: RollLevel, defense: RuleDraft['defense']) {
  if (!meets(a, 'regular') && !meets(b, 'regular')) return '명중 없음';
  const delta = levels.indexOf(a) - levels.indexOf(b);
  if (delta > 0 || (delta === 0 && defense === 'fightBack')) return '공격자 명중';
  return defense === 'dodge' ? '방어자 회피' : '방어자 반격 명중 · 일반 피해';
}
export function diceExpression(text: string) {
  const match = /^\s*(\d+)(?:\s*d\s*(\d+)(?:\s*([+-])\s*(\d+))?)?\s*$/i.exec(text);
  if (!match) throw Error('이성 손실은 0, 1D6, 2D4+1 같은 형식으로 입력해 주세요.');
  const [, first, die, sign, extra] = match;
  const count = die ? Number(first) : 0;
  const sides = Number(die || 1);
  const modifier = die ? (sign === '-' ? -1 : 1) * Number(extra || 0) : Number(first);
  if (count > 100 || (die && (count < 1 || sides < 2 || sides > 1000)) || Math.abs(modifier) > 10000) throw Error('이성 손실식 범위를 벗어났습니다.');
  return {
    max: Math.max(0, count * sides + modifier),
    roll: (random = Math.random) => Math.max(0, Array.from({ length: count }, () => 1 + Math.floor(random() * sides)).reduce((sum, n) => sum + n, modifier))
  };
}
export function sanityLoss(roll: number, san: number, success: string, failure: string, random = Math.random) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw Error('D100 결과는 1부터 100까지입니다.');
  if (!Number.isInteger(san) || san < 0 || san > 99) throw Error('현재 이성은 0부터 99까지입니다.');
  if (classify(roll, san) === '펌블') return { success: false, loss: diceExpression(failure).max };
  const passed = roll <= san;
  return { success: passed, loss: diceExpression(passed ? success : failure).roll(random) };
}

export const maxHp = (con: number, siz: number) => Math.floor((con + siz) / 10);
export const maxMp = (pow: number) => Math.floor(pow / 5);
export const majorWound = (damageAfterArmor: number, hp: number) => hp > 0 && damageAfterArmor >= Math.ceil(hp / 2);
