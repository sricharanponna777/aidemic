import { describe, expect, it } from 'vitest';
import { atRiskStudents, buildAssignmentStats, buildClassStats, buildStudentStats,
  classSpreads,
  questionWeaknesses,
  repeatedConceptGaps,
  studentSupportBand,
  studentsNeedingAttention,
  WIDE_SPREAD_POINTS,
  type StudentStat,
} from './teacherAnalytics';
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

// The threshold-only view reported "no students at risk" and "no pressing
// issues" for a class of 86% and 67%. These cover the signals added so that a
// class like that is no longer silent.
describe('graded attention signals', () => {
  const student = (over: Partial<StudentStat>): StudentStat => ({
    student_id: 's1',
    class_id: 'c1',
    className: '11B Biology',
    name: 'Student',
    email: null,
    assignedCount: 1,
    completedCount: 1,
    avgScore: 70,
    predictedGrade: null,
    lastActivity: null,
    ...over,
  });

  describe('studentSupportBand', () => {
    it('separates coping from thriving instead of only flagging failure', () => {
      expect(studentSupportBand(student({ avgScore: 86 }))).toBe('strong');
      expect(studentSupportBand(student({ avgScore: 67 }))).toBe('needs_support');
      expect(studentSupportBand(student({ avgScore: 72 }))).toBe('secure');
      expect(studentSupportBand(student({ avgScore: 31 }))).toBe('at_risk');
    });

    it('treats an assigned-but-untouched student separately from a low score', () => {
      expect(studentSupportBand(student({ completedCount: 0, avgScore: null }))).toBe('not_started');
    });

    it('has no opinion on a student with nothing assigned', () => {
      expect(studentSupportBand(student({ assignedCount: 0, completedCount: 0, avgScore: null }))).toBeNull();
    });
  });

  describe('studentsNeedingAttention', () => {
    it('surfaces the 67% student that the 40% cut-off dropped', () => {
      const rows = studentsNeedingAttention([
        student({ student_id: 'top', avgScore: 86 }),
        student({ student_id: 'mid', avgScore: 67 }),
      ]);

      expect(rows.map((r) => r.student_id)).toEqual(['mid']);
      expect(rows[0].band).toBe('needs_support');
    });

    it('orders not-started ahead of at-risk ahead of needs-support', () => {
      const rows = studentsNeedingAttention([
        student({ student_id: 'needs', avgScore: 55 }),
        student({ student_id: 'none', completedCount: 0, avgScore: null }),
        student({ student_id: 'risk', avgScore: 22 }),
      ]);

      expect(rows.map((r) => r.student_id)).toEqual(['none', 'risk', 'needs']);
    });
  });

  describe('classSpreads', () => {
    it('reports the gap between the strongest and weakest student', () => {
      const [spread] = classSpreads([
        student({ student_id: 'a', avgScore: 86 }),
        student({ student_id: 'b', avgScore: 67 }),
      ]);

      expect(spread).toMatchObject({ low: 67, high: 86, range: 19, studentCount: 2 });
      expect(spread.range).toBeGreaterThanOrEqual(WIDE_SPREAD_POINTS);
    });

    it('ignores a class with only one scored student', () => {
      expect(classSpreads([student({ avgScore: 86 })])).toEqual([]);
    });
  });

  describe('questionWeaknesses', () => {
    const entry = (student_id: string, marks: number[]) => ({
      assignment_id: 'a1',
      assignmentTitle: 'Cell Biology - Assignment - 01',
      className: '11B Biology',
      student_id,
      report: {
        markedAnswers: marks.map((marksAwarded, questionIndex) => ({ questionIndex, marksAwarded, maxMarks: 4 })),
      },
    });

    it('finds the question a well-scoring class still drops', () => {
      // Both students ace Q0 and lose most of Q1 -- invisible in the 80% average.
      const rows = questionWeaknesses([entry('s1', [4, 1]), entry('s2', [4, 1])]);

      expect(rows).toEqual([
        expect.objectContaining({ questionIndex: 1, avgMarkPercent: 25, attempts: 2 }),
      ]);
    });

    it('ignores a question only one student has attempted', () => {
      expect(questionWeaknesses([entry('s1', [0, 0])])).toEqual([]);
    });
  });

  describe('repeatedConceptGaps', () => {
    const identity = (value: string) => value;
    const entry = (student_id: string, tags: string[]) => ({
      student_id,
      report: { markedAnswers: [{ questionIndex: 0, marksAwarded: 0, maxMarks: 2, weaknessTags: tags }] },
    });

    it('keeps a gap shared by two students and drops a one-off', () => {
      const rows = repeatedConceptGaps(
        [entry('s1', ['Osmosis and ion movement', 'Careless arithmetic']), entry('s2', ['Osmosis and ion movement'])],
        identity
      );

      expect(rows).toEqual([{ label: 'Osmosis and ion movement', students: 2, occurrences: 2 }]);
    });

    it('counts through the label normaliser so slug and prose forms merge', () => {
      const rows = repeatedConceptGaps(
        [entry('s1', ['missing-root-hair']), entry('s2', ['Missing root hair'])],
        (value) => value.replace(/[-_]/g, ' ').toLowerCase()
      );

      expect(rows).toEqual([{ label: 'missing root hair', students: 2, occurrences: 2 }]);
    });
  });
});
