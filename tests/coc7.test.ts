import { describe, expect, it } from 'vitest';
import { chanceOfSuccess, classify, majorWound, maxHp, maxMp, melee, meets, opposed, percentile, sanityLoss, thresholds } from '../src/coc7';

describe('CoC 7th rules', () => {
  it('rounds hard and extreme thresholds down and distinguishes difficulty from level', () => {
    expect(thresholds(59)).toEqual({ regular: 59, hard: 29, extreme: 11 });
    expect(classify(1, 59)).toBe('대성공');
    expect(classify(11, 59)).toBe('극단적 성공');
    expect(meets(classify(30, 59, 'hard'), 'hard')).toBe(false);
    expect(classify(96, 59)).toBe('실패');
    expect(classify(96, 59, 'hard')).toBe('펌블');
    expect(classify(100, 90)).toBe('펌블');
  });
  it('shares the units die and treats double zero as 100 with either modifier', () => {
    expect(percentile(0, [0, 4], 1)).toBe(40);
    expect(percentile(0, [0, 4], -1)).toBe(100);
    expect(percentile(2, [0, 4, 9], 2)).toBe(2);
  });
  it('calculates exact success odds with shared units dice', () => {
    expect(chanceOfSuccess(50, 'regular', 0)).toBe(0.5);
    expect(chanceOfSuccess(50, 'regular', 1)).toBe(0.75);
    expect(chanceOfSuccess(50, 'regular', -2)).toBe(0.125);
  });
  it('uses different tie rules for defense and opposed skills', () => {
    expect(melee('어려운 성공', '어려운 성공', 'dodge')).toBe('방어자 회피');
    expect(melee('어려운 성공', '어려운 성공', 'fightBack')).toBe('공격자 명중');
    expect(opposed('어려운 성공', '어려운 성공', 70, 60)).toBe('판정자 승리');
  });
  it('applies successful SAN losses and maximum loss on a fumble', () => {
    expect(sanityLoss(10, 55, '1', '2D6+1')).toEqual({ success: true, loss: 1 });
    expect(sanityLoss(97, 45, '1', '2D6+1', () => 0)).toEqual({ success: false, loss: 13 });
    expect(sanityLoss(70, 55, '1', '2D6+1', () => 0)).toEqual({ success: false, loss: 3 });
  });
  it('calculates HP and MP and compares one hit to half the maximum HP', () => {
    expect(maxHp(45, 50)).toBe(9);
    expect(maxMp(57)).toBe(11);
    expect(majorWound(4, 9)).toBe(false);
    expect(majorWound(5, 9)).toBe(true);
  });
});
