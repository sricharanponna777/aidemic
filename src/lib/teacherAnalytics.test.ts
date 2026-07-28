import { describe, expect, it } from 'vitest';
import { atRiskStudents, buildAssignmentStats, buildClassStats, buildStudentStats } from './teacherAnalytics';
import type { TeacherAssignment, TeacherAttempt, TeacherClass, TeacherStudent } from '@/hooks/useTeacherClassData';

const cls = (id: string, name = id): TeacherClass => ({
  id,
  name,
  status: 'active',
  specification_id: null,
  specifications: null,
});

const assignment = (id: string, class_id: string, created_at: string): TeacherAssignment => ({
  id,
  title: id,
  class_id,
  assignment_type: 'exam',
  topic_id: null,
  topics: null,
  due_date: null,
  created_at,
});

const attempt = (over: Partial<TeacherAttempt> & Pick<TeacherAttempt, 'assignment_id' | 'student_id'>): TeacherAttempt => ({
  status: 'completed',
  percentage: null,
  predicted_grade: null,
  completed_at: null,
  started_at: null,
  ...over,
});

const student = (student_id: string, class_id: string, full_name: string | null = student_id): TeacherStudent => ({
  id: `roster-${student_id}`,
  student_id,
  class_id,
  joined_at: null,
  full_name,
  email: null,
});

describe('buildStudentStats', () => {
  it('reports the most recently completed predicted grade', () => {
    // Regression: useTeacherClassData orders assignments created_at DESC, so
    // taking the last grade in array order surfaced the OLDEST grade.
    const stats = buildStudentStats({
      classes: [cls('c1')],
      assignments: [assignment('a-new', 'c1', '2026-07-20'), assignment('a-old', 'c1', '2026-01-01')],
      attempts: [
        attempt({ assignment_id: 'a-new', student_id: 's1', percentage: 90, predicted_grade: '9', completed_at: '2026-07-21' }),
        attempt({ assignment_id: 'a-old', student_id: 's1', percentage: 20, predicted_grade: '2', completed_at: '2026-01-02' }),
      ],
      students: [student('s1', 'c1')],
    });

    expect(stats[0].predictedGrade).toBe('9');
  });

  it('ignores grades from attempts that are not completed', () => {
    const stats = buildStudentStats({
      classes: [cls('c1')],
      assignments: [assignment('a1', 'c1', '2026-01-01')],
      attempts: [attempt({ assignment_id: 'a1', student_id: 's1', status: 'in_progress', predicted_grade: '7', started_at: '2026-01-01' })],
      students: [student('s1', 'c1')],
    });

    expect(stats[0].predictedGrade).toBeNull();
    expect(stats[0].completedCount).toBe(0);
  });

  it('averages only completed scores and tracks last activity', () => {
    const stats = buildStudentStats({
      classes: [cls('c1')],
      assignments: [assignment('a1', 'c1', '2026-02-01'), assignment('a2', 'c1', '2026-01-01')],
      attempts: [
        attempt({ assignment_id: 'a1', student_id: 's1', percentage: 80, completed_at: '2026-02-02' }),
        attempt({ assignment_id: 'a2', student_id: 's1', percentage: 40, completed_at: '2026-01-02' }),
      ],
      students: [student('s1', 'c1')],
    });

    expect(stats[0].avgScore).toBe(60);
    expect(stats[0].assignedCount).toBe(2);
    expect(stats[0].lastActivity?.toISOString().slice(0, 10)).toBe('2026-02-02');
  });
});

describe('buildClassStats', () => {
  it('never reports completion above 100% when the roster shrinks', () => {
    // Two completed attempts survive, but only one student is still enrolled.
    const stats = buildClassStats({
      classes: [cls('c1')],
      assignments: [assignment('a1', 'c1', '2026-01-01')],
      attempts: [
        attempt({ assignment_id: 'a1', student_id: 's1', percentage: 50, completed_at: '2026-01-02' }),
        attempt({ assignment_id: 'a1', student_id: 'departed', percentage: 50, completed_at: '2026-01-02' }),
      ],
      students: [student('s1', 'c1')],
    });

    expect(stats[0].completionRate).toBe(100);
  });

  it('returns null completion when there is nothing assigned', () => {
    const stats = buildClassStats({ classes: [cls('c1')], assignments: [], attempts: [], students: [student('s1', 'c1')] });
    expect(stats[0].completionRate).toBeNull();
    expect(stats[0].rosterSize).toBe(1);
  });
});

describe('buildAssignmentStats', () => {
  it('clamps completion rate and averages completed scores', () => {
    const stats = buildAssignmentStats({
      classes: [cls('c1')],
      assignments: [assignment('a1', 'c1', '2026-01-01')],
      attempts: [
        attempt({ assignment_id: 'a1', student_id: 's1', percentage: 70, completed_at: '2026-01-02' }),
        attempt({ assignment_id: 'a1', student_id: 'departed', percentage: 30, completed_at: '2026-01-02' }),
      ],
      students: [student('s1', 'c1')],
    });

    expect(stats.get('a1')?.completionRate).toBe(100);
    expect(stats.get('a1')?.avgScore).toBe(50);
  });
});

describe('atRiskStudents', () => {
  it('puts students who have completed nothing first', () => {
    const stats = buildStudentStats({
      classes: [cls('c1')],
      assignments: [assignment('a1', 'c1', '2026-01-01')],
      attempts: [
        attempt({ assignment_id: 'a1', student_id: 'low', percentage: 20, completed_at: '2026-01-02' }),
        attempt({ assignment_id: 'a1', student_id: 'ok', percentage: 85, completed_at: '2026-01-02' }),
      ],
      students: [student('low', 'c1'), student('ok', 'c1'), student('idle', 'c1')],
    });

    expect(atRiskStudents(stats).map((s) => s.student_id)).toEqual(['idle', 'low']);
  });
});
