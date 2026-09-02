import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STUDENT_ONLY_PREFIXES } from '../nav';
import { buildTeacherChecklist, loadStudentChecklist } from './checklist';
import { homeHrefForRole, TOURS, type OnboardingRole } from './tour';

const appDir = fileURLToPath(new URL('../../app', import.meta.url));

/** `/dashboard/ai-questions` -> does `src/app/dashboard/ai-questions/page.tsx` exist. */
const routeExists = (href: string) => existsSync(`${appDir}${href.replace(/^\//, '/')}/page.tsx`);

const ROLES: OnboardingRole[] = ['student', 'teacher', 'parent'];

describe('welcome tour', () => {
  it.each(ROLES)('gives %s a tour with unique slide ids', (role) => {
    const slides = TOURS[role];
    expect(slides.length).toBeGreaterThan(0);
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length);
    for (const slide of slides) expect(slide.features.length).toBeGreaterThan(0);
  });

  // A tour that links at a route which does not exist sends a brand new user to
  // a 404 on their first click -- the single worst first impression available.
  it.each(ROLES)('only links %s at routes that exist', (role) => {
    const hrefs = TOURS[role].flatMap((slide) => slide.features.map((f) => f.href)).filter(Boolean) as string[];
    expect(hrefs.filter((href) => !routeExists(href))).toEqual([]);
  });

  // Teachers and parents are bounced out of the student-only routes by the
  // proxy, so advertising one to them is worse than saying nothing.
  it.each(['teacher', 'parent'] as const)('never points %s at a student-only route', (role) => {
    const hrefs = TOURS[role].flatMap((slide) => slide.features.map((f) => f.href)).filter(Boolean) as string[];
    const studentOnly = hrefs.filter((href) => STUDENT_ONLY_PREFIXES.some((prefix) => href.startsWith(prefix)));
    expect(studentOnly).toEqual([]);
  });

  it('sends each role to its own dashboard', () => {
    expect(homeHrefForRole('student')).toBe('/dashboard');
    expect(homeHrefForRole('teacher')).toBe('/dashboard/teacher');
    expect(homeHrefForRole('parent')).toBe('/dashboard/parent');
  });
});

describe('get-started checklist', () => {
  const stubClient = (count: number) => {
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: { count: number; error: null }) => unknown) => resolve({ count, error: null }),
    };
    return { from: () => query } as unknown as SupabaseClient;
  };

  it('marks every student step undone when nothing has been created', async () => {
    const items = await loadStudentChecklist(stubClient(0), 'user-1');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it('only links students at routes that exist', async () => {
    const items = await loadStudentChecklist(stubClient(0), 'user-1');
    expect(items.filter((item) => !routeExists(item.href))).toEqual([]);
  });

  it('only links teachers at routes that exist', () => {
    const items = buildTeacherChecklist({
      classCount: 0,
      studentCount: 0,
      assignmentCount: 0,
      markedAttemptCount: 0,
    });
    expect(items.filter((item) => !routeExists(item.href))).toEqual([]);
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it('ticks a teacher step off once its rows exist', () => {
    const items = buildTeacherChecklist({
      classCount: 2,
      studentCount: 30,
      assignmentCount: 0,
      markedAttemptCount: 0,
    });
    expect(items.filter((item) => item.done).map((item) => item.id)).toEqual(['class', 'roster']);
  });
});
