import { describe, expect, it } from 'vitest';
import {
  getMajorTopicsForQualification,
  getQualificationTopicError,
  isAllowedQualificationTopic,
  isEnglishLiteratureSubject,
} from './majorTopics';
import type { UserSubject } from './subjectConfig';

const subject = (overrides: Partial<UserSubject>): UserSubject => ({
  id: 'test',
  subject: 'biology',
  exam_board: 'aqa',
  exam_type: 'gcse',
  ...overrides,
});

describe('getMajorTopicsForQualification', () => {
  it('still returns the UK static topic lists', () => {
    const topics = getMajorTopicsForQualification({
      subject: 'biology',
      examBoard: 'aqa',
      examType: 'gcse',
      specification: 'AQA GCSE Biology',
    });
    expect(topics).toContain('Cell biology');
  });

  /* The static lists are UK-only. Handing them back for a CBSE or IB course would make
   * the caller reject the student's real syllabus and accept topics they never study. */
  it('returns nothing for a non-UK qualification rather than leaking UK topics', () => {
    expect(
      getMajorTopicsForQualification({
        subject: 'biology',
        examBoard: 'cbse',
        examType: 'cbse-12',
        specification: 'CBSE Class 12 Biology',
      })
    ).toEqual([]);
    expect(
      getMajorTopicsForQualification({
        subject: 'physics',
        examBoard: 'ib',
        examType: 'ib-dp',
        specification: 'IB DP Physics - HL',
      })
    ).toEqual([]);
  });

  /* Together with getQualificationTopicError's empty-list rule below, this is the whole
   * reason a JEE or NEET generation request reaches the model instead of 400-ing: their
   * topics live in the seeded topics table, and the AI relevance gate does the checking. */
  it('returns nothing for the entrance exams, whose topics are database-seeded', () => {
    for (const input of [
      { subject: 'physics', examBoard: 'nta', examType: 'jee-main', specification: 'JEE Main Physics' },
      { subject: 'biology', examBoard: 'nta', examType: 'neet-ug', specification: 'NEET UG Biology' },
      { subject: 'chemistry', examBoard: 'iit', examType: 'jee-advanced', specification: 'JEE Advanced Chemistry' },
      { subject: 'mathematics', examBoard: 'tsche', examType: 'ts-eamcet', specification: 'TS EAMCET Mathematics' },
      { subject: 'mathematics', examBoard: 'apsche', examType: 'ap-eapcet', specification: 'AP EAPCET Mathematics' },
    ]) {
      expect(getMajorTopicsForQualification(input), input.examType).toEqual([]);
      expect(getQualificationTopicError('Rotational motion', []), input.examType).toBeNull();
    }
  });
});

describe('getQualificationTopicError', () => {
  it('rejects a topic that is not on a known list', () => {
    expect(getQualificationTopicError('Tectonics', ['Cell biology', 'Ecology'])).toContain('suggested topics');
  });

  it('accepts a topic that is on the list', () => {
    expect(getQualificationTopicError('Ecology', ['Cell biology', 'Ecology'])).toBeNull();
  });

  /* An empty list means "no catalogue for this qualification", not "nothing allowed".
   * Without this, every India generation request would 400, because their topics live
   * in the database rather than in the static UK lists. */
  it('holds no opinion when there is no topic list at all', () => {
    expect(getQualificationTopicError('Life processes', [])).toBeNull();
  });
});

describe('isAllowedQualificationTopic', () => {
  it('matches case- and punctuation-insensitively', () => {
    expect(isAllowedQualificationTopic('cell BIOLOGY', ['Cell biology'])).toBe(true);
    expect(isAllowedQualificationTopic('Tectonics', ['Cell biology'])).toBe(false);
  });
});

describe('isEnglishLiteratureSubject', () => {
  it('is true for UK English Literature, which has the poetry-cluster machinery', () => {
    expect(isEnglishLiteratureSubject(subject({ subject: 'english literature', exam_type: 'gcse' }))).toBe(true);
    expect(isEnglishLiteratureSubject(subject({ subject: 'english', exam_type: 'a-level' }), 'AQA A-Level English Literature A')).toBe(true);
  });

  /* ICSE and IB literature courses must fall through to the seeded topics table, not to
   * the AQA poetry clusters. */
  it('is false for non-UK literature courses', () => {
    expect(isEnglishLiteratureSubject(subject({ subject: 'english literature', exam_board: 'cisce', exam_type: 'icse' }))).toBe(false);
    expect(isEnglishLiteratureSubject(subject({ subject: 'english literature', exam_board: 'ib', exam_type: 'ib-dp' }))).toBe(false);
  });
});
