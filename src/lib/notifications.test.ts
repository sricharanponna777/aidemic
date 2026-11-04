import { describe, expect, it } from 'vitest';
import { describeNotification } from './notifications';

const at = '2026-11-02T00:00:00Z';

describe('describeNotification', () => {
  // GAMIFICATION PAUSED: badge and league notifications are commented out in notifications.ts.
  it.skip('words a league result with the league moved to', () => {
    expect(
      describeNotification({
        id: 'league:2026-10-26',
        kind: 'league',
        at,
        data: { result: 'promoted', rank: 2, cohort_size: 28, from_tier: 'Moon', to_tier: 'Planet' },
      })
    ).toMatchObject({ title: 'You moved up to the Planet League', body: 'You finished 2nd of 28 last week.' });

    expect(
      describeNotification({ id: 'l', kind: 'league', at, data: { result: 'stayed', rank: 11, cohort_size: 30, to_tier: 'Moon' } })
    ).toMatchObject({ title: 'You stayed in the Moon League', body: 'You finished 11th of 30 last week.' });
  });

  // GAMIFICATION PAUSED: see above.
  it.skip('words badges and parent requests, and drops unknown kinds', () => {
    expect(
      describeNotification({ id: 'badge:void-blurter', kind: 'badge', at, data: { name: '5 Blurts', description: 'Finish 5 blurting sessions.', icon: 'brain' } })
    ).toMatchObject({ title: 'Badge earned: 5 Blurts', href: '/dashboard/progress', icon: 'brain' });
    expect(describeNotification({ id: 'p', kind: 'parent_link', at, data: {} })?.href).toBe('/dashboard/family');
    expect(describeNotification({ id: 'x', kind: 'mystery', at, data: null })).toBeNull();
  });
});
