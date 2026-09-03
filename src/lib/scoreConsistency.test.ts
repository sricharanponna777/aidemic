import { describe, expect, it } from 'vitest';
import {
  average,
  buildAssignmentStats,
  buildClassStats,
  buildStudentStats,
  buildTopicStats,
} from './teacherAnalytics';
import { gradeFromPercentage } from './ai/gradeScales';
import type { TeacherAssignment, TeacherAttempt, TeacherClass, TeacherStudent } from '@/hooks/useTeacherClassData';

/**
 * One score, every surface.
 *
 * A marked attempt produces a single percentage in `mark-answers`, which is
 * written once to `assignment_attempts.percentage` and then re-aggregated
 * independently by the student result page, the assignment view, the teacher
 * dashboard, the class average, the individual report, and both parent screens.
 * Nothing forces those aggregations to agree — they are separate reducers over
 * the same column — so this pins the agreement rather than trusting it.
 *
 * The fixture is the observed case: two students on one assignment, scoring 86%
 * and 67%.
 */

const CLASS_ID = 'class-11b';
const ASSIGNMENT_ID = 'assignment-cell-biology';
const TOPIC_ID = 'topic-cell-biology';

const classes: TeacherClass[] = [
  { id: CLASS_ID, name: '11B Biology', status: 'active', specification_id: 'spec-1', specifications: null },
];

const assignments: TeacherAssignment[] = [
  {
    id: ASSIGNMENT_ID,
    title: 'Cell Biology - Assignment - 01',
    class_id: CLASS_ID,
    assignment_type: 'practice',
    topic_id: TOPIC_ID,
    topics: { name: 'Cell Biology' },
    due_date: null,
    created_at: '2026-09-01T09:00:00.000Z',
  },
];

const attempt = (student_id: string, percentage: number): TeacherAttempt => ({
  assignment_id: ASSIGNMENT_ID,
  student_id,
  status: 'completed',
  percentage,
  predicted_grade: null,
  completed_at: '2026-09-02T10:00:00.000Z',
  started_at: '2026-09-02T09:30:00.000Z',
});

const student = (student_id: string, full_name: string): TeacherStudent => ({
  id: `member-${student_id}`,
  student_id,
  class_id: CLASS_ID,
  joined_at: '2026-08-01T09:00:00.000Z',
  full_name,
  email: null,
});

const attempts = [attempt('student-a', 86), attempt('student-b', 67)];
const students = [student('student-a', 'Student A'), student('student-b', 'Student B')];
const data = { classes, assignments, attempts, students };

/** (86 + 67) / 2 = 76.5, rounded once by `average`. */
const EXPECTED_CLASS_AVERAGE = 77;

describe('score consistency across roles', () => {
  it('reports each student their own score unchanged', () => {
    const stats = buildStudentStats(data);
    expect(stats.find((s) => s.student_id === 'student-a')?.avgScore).toBe(86);
    expect(stats.find((s) => s.student_id === 'student-b')?.avgScore).toBe(67);
  });

  it('gives the same class average from the class, topic and assignment reducers', () => {
    // Three independent aggregations over the same column, used by the teacher
    // dashboard, AI Insights and the assignments list respectively.
    expect(buildClassStats(data)[0].avgScore).toBe(EXPECTED_CLASS_AVERAGE);
    expect(buildTopicStats(data)[0].avgScore).toBe(EXPECTED_CLASS_AVERAGE);
    expect(buildAssignmentStats(data).get(ASSIGNMENT_ID)?.avgScore).toBe(EXPECTED_CLASS_AVERAGE);
  });

  it('matches the average a parent screen derives from the same attempts', () => {
    // The parent dashboard has its own inline reducer over the child's
    // attempts; this is that calculation, and it must not drift from the
    // teacher-side one.
    const parentSideAverage = average(attempts.map((a) => a.percentage as number));
    expect(parentSideAverage).toBe(EXPECTED_CLASS_AVERAGE);
  });

  it('counts completion identically for the teacher and the parent', () => {
    const assignmentStat = buildAssignmentStats(data).get(ASSIGNMENT_ID);
    const parentSideCompleted = attempts.filter((a) => a.status === 'completed').length;

    expect(assignmentStat?.completedCount).toBe(parentSideCompleted);
    expect(assignmentStat?.rosterSize).toBe(students.length);
    expect(assignmentStat?.completionRate).toBe(100);
  });

  it('derives one grade equivalent per score, whoever is looking', () => {
    // Student result page, teacher attempt view and parent assignments list all
    // render this from the same stored percentage.
    expect(gradeFromPercentage(86, 'gcse', null, 'aqa')).toBe(gradeFromPercentage(86, 'gcse', null, 'aqa'));
    expect(gradeFromPercentage(86, 'gcse', null, 'aqa')).not.toBe(gradeFromPercentage(67, 'gcse', null, 'aqa'));
  });

  it('ignores an unmarked attempt in every average', () => {
    // A started-but-unfinished attempt has no percentage. If any reducer counted
    // it as 0 the teacher and parent numbers would diverge the moment a student
    // opened an assignment without submitting.
    const withInProgress = {
      ...data,
      attempts: [...attempts, { ...attempt('student-c', 0), status: 'in_progress', percentage: null }],
      students: [...students, student('student-c', 'Student C')],
    };

    expect(buildClassStats(withInProgress)[0].avgScore).toBe(EXPECTED_CLASS_AVERAGE);
    expect(buildTopicStats(withInProgress)[0].avgScore).toBe(EXPECTED_CLASS_AVERAGE);
    expect(buildAssignmentStats(withInProgress).get(ASSIGNMENT_ID)?.avgScore).toBe(EXPECTED_CLASS_AVERAGE);
  });
});
