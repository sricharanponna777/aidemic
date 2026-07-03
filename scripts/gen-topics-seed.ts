import fs from 'fs';
import { getMajorTopicsForSubject } from '../src/lib/ai/majorTopics';
import type { UserSubject } from '../src/lib/ai/subjectConfig';
import specificationsData from '../src/lib/ai/specifications.json';

const SELECTABLE_SUBJECTS = [
  'biology', 'chemistry', 'physics', 'mathematics',
  'english language', 'english literature',
  'history', 'geography', 'economics', 'psychology', 'business', 'computer science',
] as const;

type Row = {
  board: string;
  examType: 'gcse' | 'a-level';
  subject: string;
  specName: string;
  tier: string | null;
  topics: string[];
};

const specs = specificationsData as Record<string, Record<string, Record<string, { name: string; tiers?: string[]; options?: string[] }[]>>>;

const rows: Row[] = [];

for (const board of Object.keys(specs)) {
  for (const examType of Object.keys(specs[board]) as ('gcse' | 'a-level')[]) {
    for (const subject of SELECTABLE_SUBJECTS) {
      const entries = specs[board][examType]?.[subject];
      if (!entries || entries.length === 0) continue;

      for (const entry of entries) {
        const tiers = entry.tiers && entry.tiers.length > 0 ? entry.tiers : [null];
        for (const tier of tiers) {
          const pendingSubject: UserSubject = {
            id: 'seed',
            subject: subject as UserSubject['subject'],
            exam_board: board as UserSubject['exam_board'],
            exam_type: examType,
            spec_name: entry.name,
            spec_tier: tier,
          };
          const topics = getMajorTopicsForSubject(pendingSubject);
          rows.push({ board, examType, subject, specName: entry.name, tier, topics });
        }
      }
    }
  }
}

fs.writeFileSync(
  'C:/Users/swapn/AppData/Local/Temp/claude/c--Users-swapn-Documents-CharansProjects-aidemic/d04a39f5-9ff2-4e97-938b-b70eb8da38ae/scratchpad/topics-computed.json',
  JSON.stringify(rows, null, 2)
);

console.error('Total spec rows:', rows.length, 'Total topic entries:', rows.reduce((sum, r) => sum + r.topics.length, 0));
console.error('Rows with zero topics:', rows.filter((r) => r.topics.length === 0).length);
