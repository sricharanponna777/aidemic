import { describe, expect, it } from 'vitest';
import {
  buildRevisionPlan,
  daysUntilExam,
  subjectWeight,
  type PlannerSubject,
} from './revisionPlanner';

const FROM = new Date('2026-07-25T09:00:00Z');

const subject = (over: Partial<PlannerSubject> = {}): PlannerSubject => ({
  id: 's1',
  label: 'Biology',
  examDate: '2026-08-24', // 30 days out
  weakTopics: ['Enzymes', 'Osmosis'],
  ...over,
});

describe('daysUntilExam', () => {
  it('counts whole days to the exam', () => {
    expect(daysUntilExam('2026-08-24', FROM)).toBe(30);
  });
  it('returns null for no date', () => {
    expect(daysUntilExam(null, FROM)).toBeNull();
  });
  it('returns negative for a past exam', () => {
    expect(daysUntilExam('2026-07-20', FROM)).toBe(-5);
  });
});

describe('subjectWeight', () => {
  it('is zero when the exam has no date', () => {
    expect(subjectWeight(subject({ examDate: null }), FROM)).toBe(0);
  });
  it('is zero when the exam is in the past', () => {
    expect(subjectWeight(subject({ examDate: '2026-07-01' }), FROM)).toBe(0);
  });
  it('weighs a sooner exam more than a later one', () => {
    const soon = subjectWeight(subject({ examDate: '2026-08-01' }), FROM);
    const later = subjectWeight(subject({ examDate: '2026-09-30' }), FROM);
    expect(soon).toBeGreaterThan(later);
  });
  it('weighs more weak topics more heavily', () => {
    const few = subjectWeight(subject({ weakTopics: ['A'] }), FROM);
    const many = subjectWeight(subject({ weakTopics: ['A', 'B', 'C', 'D'] }), FROM);
    expect(many).toBeGreaterThan(few);
  });
});

describe('buildRevisionPlan', () => {
  it('returns nothing when no subject has an upcoming exam', () => {
    expect(buildRevisionPlan([subject({ examDate: null })], { from: FROM })).toEqual([]);
    expect(buildRevisionPlan([subject({ examDate: '2020-01-01' })], { from: FROM })).toEqual([]);
  });

  it('schedules sessions within the exam window, sorted by date', () => {
    const plan = buildRevisionPlan([subject()], { from: FROM, horizonDays: 28 });
    expect(plan.length).toBeGreaterThan(0);
    for (const item of plan) {
      expect(item.plannedDate >= '2026-07-25').toBe(true);
      expect(item.plannedDate <= '2026-08-24').toBe(true);
    }
    const dates = plan.map((p) => p.plannedDate);
    expect([...dates]).toEqual([...dates].sort());
  });

  it('cycles through weak topics in session titles', () => {
    const plan = buildRevisionPlan([subject({ weakTopics: ['Enzymes', 'Osmosis'] })], {
      from: FROM,
      sessionsPerWeek: 14,
    });
    const titles = plan.map((p) => p.title);
    expect(titles.some((t) => t.includes('Enzymes'))).toBe(true);
    expect(titles.some((t) => t.includes('Osmosis'))).toBe(true);
  });

  it('falls back to a general session when a subject has no weak topics', () => {
    const plan = buildRevisionPlan([subject({ weakTopics: [] })], { from: FROM });
    expect(plan.every((p) => p.title.includes('general revision'))).toBe(true);
  });

  it('gives a heavier subject more sessions than a lighter one', () => {
    const heavy = subject({ id: 'heavy', label: 'Heavy', examDate: '2026-08-01', weakTopics: ['a', 'b', 'c', 'd', 'e'] });
    const light = subject({ id: 'light', label: 'Light', examDate: '2026-09-20', weakTopics: [] });
    const plan = buildRevisionPlan([heavy, light], { from: FROM, sessionsPerWeek: 14, horizonDays: 28 });
    const heavyCount = plan.filter((p) => p.subjectId === 'heavy').length;
    const lightCount = plan.filter((p) => p.subjectId === 'light').length;
    expect(heavyCount).toBeGreaterThan(lightCount);
  });
});
