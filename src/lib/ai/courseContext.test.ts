import { describe, expect, it } from 'vitest';
import { buildCourseContext, buildCourseSection, resolveTier, tierRules } from './courseContext';

describe('resolveTier', () => {
  it('reads the tier off the end of a built spec string, in registry casing', () => {
    expect(resolveTier('AQA GCSE Combined Science: Trilogy - Higher', 'gcse')).toEqual({ scheme: 'Tier', value: 'Higher' });
    expect(resolveTier('Edexcel GCSE Mathematics (1MA1) - Foundation', 'gcse')).toEqual({ scheme: 'Tier', value: 'Foundation' });
    expect(resolveTier('Mathematics Analysis and Approaches - HL', 'ib-dp')).toEqual({ scheme: 'Level', value: 'HL' });
  });

  it('is null for an untiered qualification even if the string contains a tier word', () => {
    expect(resolveTier('Higher Mathematics', 'a-level')).toBeNull();
  });

  it('is null when a tiered qualification names no tier', () => {
    expect(resolveTier('AQA GCSE History', 'gcse')).toBeNull();
  });
});

describe('tierRules', () => {
  it('excludes Higher-only content and caps demand at grade 5 for Foundation', () => {
    const rules = tierRules('gcse', { scheme: 'Tier', value: 'Foundation' }, 'generate').join(' ');
    expect(rules).toMatch(/Higher tier only/);
    expect(rules).toMatch(/grades 1-5/);
  });

  it('puts Higher-only content in scope for Higher', () => {
    expect(tierRules('gcse', { scheme: 'Tier', value: 'Higher' }, 'generate').join(' ')).toMatch(/Higher-tier-only content are in scope/);
  });

  it('falls back to common content when a tiered qualification names no tier', () => {
    expect(tierRules('gcse', null, 'generate').join(' ')).toMatch(/common to all of them/);
  });

  it('adds the no-penalty-outside-tier rule only when assessing', () => {
    const tier = { scheme: 'Tier', value: 'Foundation' };
    expect(tierRules('gcse', tier, 'assess').join(' ')).toMatch(/never withhold credit/);
    expect(tierRules('gcse', tier, 'generate').join(' ')).not.toMatch(/never withhold credit/);
  });
});

describe('buildCourseContext', () => {
  it('reports absent fields as null rather than empty strings', () => {
    const context = buildCourseContext({ examBoard: 'aqa', examType: 'gcse', subject: 'biology', specification: '', topic: '' });
    expect(context.specification).toBeNull();
    expect(context.topic).toBeNull();
    expect(context.tier).toBeNull();
  });
});

describe('buildCourseSection', () => {
  it('states the tier as its own field in the context block', () => {
    const section = buildCourseSection(
      { examBoard: 'aqa', examType: 'gcse', subject: 'physics', specification: 'AQA GCSE Physics (8463) - Foundation' },
      'generate'
    );
    expect(section).toContain('"tier": "Foundation"');
    expect(section).toContain('TIER: Foundation');
  });
});

describe('tierRules in assess mode', () => {
  it('omits question-writing demand guidance', () => {
    expect(tierRules('gcse', { scheme: 'Tier', value: 'Foundation' }, 'assess').join(' ')).not.toMatch(/structured questions/);
  });
});
