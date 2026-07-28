import type { TeacherAssignment, TeacherAttempt, TeacherClass, TeacherStudent } from '@/hooks/useTeacherClassData';

export const average = (values: number[]): number | null =>
  values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;

type Data = {
  classes: TeacherClass[];
  assignments: TeacherAssignment[];
  attempts: TeacherAttempt[];
  students: TeacherStudent[];
};

export type StudentStat = {
  student_id: string;
  class_id: string;
  className: string;
  name: string;
  email: string | null;
  assignedCount: number;
  completedCount: number;
  avgScore: number | null;
  predictedGrade: string | null;
  lastActivity: Date | null;
};

export type ClassStat = {
  class_id: string;
  name: string;
  status: 'active' | 'archived';
  rosterSize: number;
  assignmentCount: number;
  completionRate: number | null;
  avgScore: number | null;
};

export type TopicStat = {
  topic_id: string;
  name: string;
  className: string;
  completedAttempts: number;
  avgScore: number | null;
  completionRate: number | null;
};

const displayName = (s: { full_name: string | null; email: string | null }) => s.full_name || s.email || 'Student';

/** One row per (student, class) membership with their completion + score in that class. */
export function buildStudentStats(data: Data): StudentStat[] {
  const assignmentsByClass = new Map<string, TeacherAssignment[]>();
  for (const a of data.assignments) {
    const entry = assignmentsByClass.get(a.class_id) ?? [];
    entry.push(a);
    assignmentsByClass.set(a.class_id, entry);
  }
  const attemptsByAssignment = new Map<string, TeacherAttempt[]>();
  for (const att of data.attempts) {
    const entry = attemptsByAssignment.get(att.assignment_id) ?? [];
    entry.push(att);
    attemptsByAssignment.set(att.assignment_id, entry);
  }
  const classNameById = new Map(data.classes.map((c) => [c.id, c.name]));

  return data.students.map((student) => {
    const classAssignments = assignmentsByClass.get(student.class_id) ?? [];
    const scores: number[] = [];
    let completedCount = 0;
    let lastActivity: Date | null = null;
    // Track the grade alongside when it was earned: `classAssignments` arrives
    // newest-first, so picking by array position surfaced the oldest grade.
    let latestGrade: { grade: string; at: number } | null = null;

    for (const assignment of classAssignments) {
      const attempt = (attemptsByAssignment.get(assignment.id) ?? []).find((a) => a.student_id === student.student_id);
      if (!attempt) continue;
      const activity = attempt.completed_at ?? attempt.started_at;
      if (activity) {
        const date = new Date(activity);
        if (!lastActivity || date > lastActivity) lastActivity = date;
      }
      if (attempt.status !== 'completed') continue;
      completedCount += 1;
      if (typeof attempt.percentage === 'number') scores.push(attempt.percentage);
      if (attempt.predicted_grade) {
        const completedAt = new Date(attempt.completed_at ?? attempt.started_at ?? 0).getTime();
        const at = Number.isFinite(completedAt) ? completedAt : 0;
        // Strict `>` so that when timestamps tie (or are all missing) the
        // newest assignment wins, matching the newest-first input order.
        if (!latestGrade || at > latestGrade.at) latestGrade = { grade: attempt.predicted_grade, at };
      }
    }

    return {
      student_id: student.student_id,
      class_id: student.class_id,
      className: classNameById.get(student.class_id) ?? 'Class',
      name: displayName(student),
      email: student.email,
      assignedCount: classAssignments.length,
      completedCount,
      avgScore: average(scores),
      predictedGrade: latestGrade?.grade ?? null,
      lastActivity,
    };
  });
}

export function buildClassStats(data: Data): ClassStat[] {
  const rosterByClass = new Map<string, number>();
  for (const s of data.students) rosterByClass.set(s.class_id, (rosterByClass.get(s.class_id) ?? 0) + 1);

  const assignmentIdsByClass = new Map<string, Set<string>>();
  for (const a of data.assignments) {
    const entry = assignmentIdsByClass.get(a.class_id) ?? new Set<string>();
    entry.add(a.id);
    assignmentIdsByClass.set(a.class_id, entry);
  }
  const classByAssignment = new Map(data.assignments.map((a) => [a.id, a.class_id]));

  const completedByClass = new Map<string, { completed: number; scores: number[] }>();
  for (const att of data.attempts) {
    if (att.status !== 'completed') continue;
    const classId = classByAssignment.get(att.assignment_id);
    if (!classId) continue;
    const entry = completedByClass.get(classId) ?? { completed: 0, scores: [] };
    entry.completed += 1;
    if (typeof att.percentage === 'number') entry.scores.push(att.percentage);
    completedByClass.set(classId, entry);
  }

  return data.classes.map((cls) => {
    const rosterSize = rosterByClass.get(cls.id) ?? 0;
    const assignmentCount = assignmentIdsByClass.get(cls.id)?.size ?? 0;
    const completed = completedByClass.get(cls.id);
    const expected = rosterSize * assignmentCount;
    return {
      class_id: cls.id,
      name: cls.name,
      status: cls.status,
      rosterSize,
      assignmentCount,
      // Clamped: a student who completes work and then leaves the class keeps
      // their attempt while the roster shrinks, which can push this over 100%.
      completionRate: expected > 0 ? Math.min(100, Math.round(((completed?.completed ?? 0) / expected) * 100)) : null,
      avgScore: average(completed?.scores ?? []),
    };
  });
}

/** Average score by topic across every class (or a single class), weakest first. */
export function buildTopicStats(data: Data, classId?: string): TopicStat[] {
  const rosterByClass = new Map<string, number>();
  for (const s of data.students) rosterByClass.set(s.class_id, (rosterByClass.get(s.class_id) ?? 0) + 1);
  const classNameById = new Map(data.classes.map((c) => [c.id, c.name]));

  const assignments = classId ? data.assignments.filter((a) => a.class_id === classId) : data.assignments;
  const attemptsByAssignment = new Map<string, TeacherAttempt[]>();
  for (const att of data.attempts) {
    const entry = attemptsByAssignment.get(att.assignment_id) ?? [];
    entry.push(att);
    attemptsByAssignment.set(att.assignment_id, entry);
  }

  const perTopic = new Map<string, { name: string; className: string; completed: number; expected: number; scores: number[] }>();
  for (const a of assignments) {
    const key = `${a.class_id}:${a.topic_id ?? 'none'}`;
    const entry = perTopic.get(key) ?? {
      name: a.topics?.name ?? 'General',
      className: classNameById.get(a.class_id) ?? 'Class',
      completed: 0,
      expected: 0,
      scores: [],
    };
    entry.expected += rosterByClass.get(a.class_id) ?? 0;
    for (const attempt of attemptsByAssignment.get(a.id) ?? []) {
      if (attempt.status !== 'completed') continue;
      entry.completed += 1;
      if (typeof attempt.percentage === 'number') entry.scores.push(attempt.percentage);
    }
    perTopic.set(key, entry);
  }

  return [...perTopic.entries()]
    .map(([key, entry]) => ({
      topic_id: key,
      name: entry.name,
      className: entry.className,
      completedAttempts: entry.completed,
      avgScore: average(entry.scores),
      completionRate: entry.expected > 0 ? Math.round((entry.completed / entry.expected) * 100) : null,
    }))
    .sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101));
}

export type AssignmentStat = {
  assignment_id: string;
  completedCount: number;
  rosterSize: number;
  completionRate: number | null;
  avgScore: number | null;
};

/** Completion rate + average score per assignment, keyed by assignment id. */
export function buildAssignmentStats(data: Data): Map<string, AssignmentStat> {
  const rosterByClass = new Map<string, number>();
  for (const s of data.students) rosterByClass.set(s.class_id, (rosterByClass.get(s.class_id) ?? 0) + 1);

  const attemptsByAssignment = new Map<string, TeacherAttempt[]>();
  for (const att of data.attempts) {
    const entry = attemptsByAssignment.get(att.assignment_id) ?? [];
    entry.push(att);
    attemptsByAssignment.set(att.assignment_id, entry);
  }

  const stats = new Map<string, AssignmentStat>();
  for (const a of data.assignments) {
    const rosterSize = rosterByClass.get(a.class_id) ?? 0;
    const completed = (attemptsByAssignment.get(a.id) ?? []).filter((att) => att.status === 'completed');
    stats.set(a.id, {
      assignment_id: a.id,
      completedCount: completed.length,
      rosterSize,
      completionRate: rosterSize > 0 ? Math.min(100, Math.round((completed.length / rosterSize) * 100)) : null,
      avgScore: average(completed.filter((att) => typeof att.percentage === 'number').map((att) => att.percentage as number)),
    });
  }
  return stats;
}

/** A student is "at risk" if they've completed nothing despite having assignments,
 *  or their average score is below the pass line. Ordered most-urgent first. */
export function atRiskStudents(stats: StudentStat[]): StudentStat[] {
  return stats
    .filter((s) => s.assignedCount > 0 && (s.completedCount === 0 || (s.avgScore !== null && s.avgScore < 40)))
    .sort((a, b) => {
      const aScore = a.completedCount === 0 ? -1 : a.avgScore ?? 100;
      const bScore = b.completedCount === 0 ? -1 : b.avgScore ?? 100;
      return aScore - bScore;
    });
}
