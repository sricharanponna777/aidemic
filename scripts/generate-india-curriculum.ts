/**
 * Generates the India curriculum artefacts from scripts/data/india-curriculum.ts:
 *
 *   1. merges the cbse / cisce / ib branches into src/lib/ai/specifications.json
 *   2. writes the curriculum → qualification → board → subject → specification seed
 *   3. writes the topics seed
 *
 * Every id is a deterministic UUIDv5 of its path in the tree, so re-running produces
 * byte-identical SQL and the migrations stay idempotent through ON CONFLICT (id).
 *
 *   bun run scripts/generate-india-curriculum.ts          # codegen only
 *   bun run scripts/generate-india-curriculum.ts --apply  # also upsert into the DB
 *
 * --apply writes the same rows the migrations contain straight to the live database
 * through the service role, so a project that is not linked to the CLI can be seeded
 * without pasting a 1,000-line file. The migrations remain the source of truth for
 * standing up a fresh database.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  INDIA_CURRICULUM,
  OBJECTIVE_CATALOGUE,
  SUBJECT_OBJECTIVES,
  type SpecDef,
} from './data/india-curriculum';
import { qualificationById } from '../src/lib/ai/qualifications';
import { SUPPORTED_SUBJECTS, getSubjectLabel } from '../src/lib/ai/subjects';

const APPLY = process.argv.includes('--apply');

const ROOT = process.cwd();
const SPEC_JSON = join(ROOT, 'src/lib/ai/specifications.json');
const CURRICULUM_SQL = join(ROOT, 'supabase/migrations/20260817001000_seed_india_curriculum.sql');
const TOPICS_SQL = join(ROOT, 'supabase/migrations/20260817002000_seed_india_topics.sql');
const OBJECTIVES_SQL = join(ROOT, 'supabase/migrations/20260817004000_seed_india_learning_objectives.sql');

const COUNTRY = 'india';
const CURRICULUM_NAME = 'Indian School Curriculum';

/** Fixed namespace so ids never move. Do not change it — every seeded row depends on it. */
const NAMESPACE = 'f2b9c0d4-6e51-4a7c-9b3f-1d8a5c2e7043';

const uuidv5 = (name: string): string => {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Every specification row a spec definition expands into: one per tier, or one untiered. */
const specRows = (spec: SpecDef) =>
  (spec.tiers ?? [null]).map((tier) => ({
    tier,
    topics: [...spec.topics, ...(tier ? spec.tierTopics?.[tier] ?? [] : [])],
  }));

// ---------------------------------------------------------------- validation

const problems: string[] = [];
const seenSpecKeys = new Set<string>();

for (const qual of INDIA_CURRICULUM) {
  const def = qualificationById(qual.qualId);
  if (!def) {
    problems.push(`Unknown qualification id "${qual.qualId}" — add it to src/lib/ai/qualifications.ts`);
    continue;
  }
  if (def.country !== COUNTRY) problems.push(`${qual.qualId} is registered under "${def.country}", not "${COUNTRY}"`);
  if (!def.boards.includes(qual.board)) {
    problems.push(`${qual.qualId} board "${qual.board}" is not one of [${def.boards.join(', ')}]`);
  }

  for (const subject of qual.subjects) {
    if (!(SUPPORTED_SUBJECTS as readonly string[]).includes(subject.subject)) {
      problems.push(`${qual.qualId}: subject "${subject.subject}" is not in SUPPORTED_SUBJECTS`);
    }
    const objectives = SUBJECT_OBJECTIVES[subject.subject];
    if (!objectives?.length) {
      problems.push(`No learning objectives mapped for subject "${subject.subject}"`);
    }
    for (const code of objectives ?? []) {
      if (!OBJECTIVE_CATALOGUE[code]) {
        problems.push(`${subject.subject}: unknown objective code "${code}"`);
      }
    }
    for (const spec of subject.specs) {
      const key = `${qual.qualId}/${subject.subject}/${spec.name}`;
      if (seenSpecKeys.has(key)) problems.push(`Duplicate specification "${key}"`);
      seenSpecKeys.add(key);

      if (spec.tiers && !def.tier) {
        problems.push(`${spec.name} declares tiers but ${qual.qualId} has no tier scheme`);
      }
      for (const tier of spec.tiers ?? []) {
        if (def.tier && !def.tier.values.includes(tier)) {
          problems.push(`${spec.name}: tier "${tier}" is not one of [${def.tier.values.join(', ')}]`);
        }
      }
      for (const tier of Object.keys(spec.tierTopics ?? {})) {
        if (!(spec.tiers ?? []).includes(tier)) {
          problems.push(`${spec.name}: tierTopics has "${tier}" which is not in its tiers list`);
        }
      }
      for (const [name, count] of Object.entries(
        specRows(spec).flatMap((row) => row.topics).reduce<Record<string, number>>((acc, topic) => {
          acc[topic] = (acc[topic] ?? 0) + 1;
          return acc;
        }, {})
      )) {
        if (count > (spec.tiers?.length ?? 1)) problems.push(`${spec.name}: duplicate topic "${name}"`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('India curriculum data is invalid:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

// ---------------------------------------------------------------- specifications.json

type SpecEntry = { name: string; tiers?: string[] };
const specJson = JSON.parse(readFileSync(SPEC_JSON, 'utf8')) as Record<
  string,
  Record<string, Record<string, SpecEntry[]>>
>;

for (const qual of INDIA_CURRICULUM) {
  specJson[qual.board] ??= {};
  specJson[qual.board][qual.qualId] = {};
  for (const subject of qual.subjects) {
    specJson[qual.board][qual.qualId][subject.subject] = subject.specs.map((spec) =>
      spec.tiers ? { name: spec.name, tiers: spec.tiers } : { name: spec.name }
    );
  }
}

writeFileSync(SPEC_JSON, JSON.stringify(specJson, null, 2) + '\n');

// ---------------------------------------------------------------- build rows

const curriculumId = uuidv5(COUNTRY);

const curricula = [
  {
    id: curriculumId,
    name: CURRICULUM_NAME,
    country: COUNTRY,
    description:
      'CBSE, CISCE (ICSE/ISC) and IB Diploma school qualifications, plus the JEE, NEET and EAMCET entrance exams, as studied in India.',
  },
];
const qualifications: Array<{ id: string; curriculum_id: string; name: string; level: string; description: string }> = [];
const exam_boards: Array<{ id: string; qualification_id: string; name: string }> = [];
const subjects: Array<{ id: string; exam_board_id: string; name: string }> = [];
const specifications: Array<{ id: string; subject_id: string; name: string; tier: string | null }> = [];
const topics: Array<{ id: string; specification_id: string; name: string; order_index: number }> = [];
const learning_objectives: Array<{
  id: string;
  subject_id: string;
  code: string;
  objective: string;
  applies_to: string[];
}> = [];

for (const qual of INDIA_CURRICULUM) {
  const def = qualificationById(qual.qualId)!;
  const qualPath = `${COUNTRY}/${qual.qualId}`;
  const qualUuid = uuidv5(qualPath);
  qualifications.push({
    id: qualUuid,
    curriculum_id: curriculumId,
    name: def.dbName,
    level: def.level,
    description: `${def.label} as awarded in India.`,
  });

  const boardPath = `${qualPath}/${qual.board}`;
  const boardUuid = uuidv5(boardPath);
  exam_boards.push({ id: boardUuid, qualification_id: qualUuid, name: qual.board.toUpperCase() });

  for (const subject of qual.subjects) {
    const subjectPath = `${boardPath}/${subject.subject}`;
    const subjectUuid = uuidv5(subjectPath);
    subjects.push({ id: subjectUuid, exam_board_id: boardUuid, name: getSubjectLabel(subject.subject) });

    for (const code of SUBJECT_OBJECTIVES[subject.subject] ?? []) {
      const entry = OBJECTIVE_CATALOGUE[code];
      learning_objectives.push({
        id: uuidv5(`${subjectPath}/lo/${code}`),
        subject_id: subjectUuid,
        code,
        objective: entry.objective,
        applies_to: entry.applies_to,
      });
    }

    for (const spec of subject.specs) {
      for (const row of specRows(spec)) {
        const specPath = `${subjectPath}/${spec.name}#${row.tier ?? ''}`;
        const specUuid = uuidv5(specPath);
        specifications.push({ id: specUuid, subject_id: subjectUuid, name: spec.name, tier: row.tier });

        row.topics.forEach((topic, index) => {
          topics.push({
            id: uuidv5(`${specPath}/topic/${topic}`),
            specification_id: specUuid,
            name: topic,
            order_index: index,
          });
        });
      }
    }
  }
}

const counts = {
  qualifications: qualifications.length,
  boards: exam_boards.length,
  subjects: subjects.length,
  specifications: specifications.length,
  topics: topics.length,
  learning_objectives: learning_objectives.length,
};

// ---------------------------------------------------------------- SQL emission

type SqlValue = string | number | null | string[];

const sqlValue = (value: SqlValue) => {
  if (value === null) return 'NULL';
  if (Array.isArray(value)) return `ARRAY[${value.map(q).join(', ')}]`;
  return typeof value === 'number' ? String(value) : q(value);
};

const block = (table: string, rows: Array<Record<string, SqlValue>>) => {
  const columns = Object.keys(rows[0]);
  const values = rows.map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(', ')})`);
  return [
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES`,
    values.join(',\n'),
    `ON CONFLICT (id) DO NOTHING;`,
    ``,
  ].join('\n');
};

const header = (title: string, body: string) =>
  [
    `-- ${title}`,
    `-- Generated by scripts/generate-india-curriculum.ts from scripts/data/india-curriculum.ts.`,
    `-- Ids are deterministic UUIDv5 values keyed on the row's path in the curriculum tree,`,
    `-- so this file is safe to re-run and safe to regenerate.`,
    ``,
    body,
  ].join('\n');

writeFileSync(
  CURRICULUM_SQL,
  header(
    'Seed: India curriculum, qualifications, exam boards, subjects and specifications',
    [
      block('curricula', curricula),
      block('qualifications', qualifications),
      block('exam_boards', exam_boards),
      block('subjects', subjects),
      block('specifications', specifications),
    ].join('\n')
  )
);

// Topics are batched: a single INSERT with ~1,000 rows is awkward to apply through the
// SQL editor and impossible to read in a diff.
const BATCH = 250;
const topicBlocks: string[] = [];
for (let i = 0; i < topics.length; i += BATCH) {
  topicBlocks.push(block('topics', topics.slice(i, i + BATCH)));
}

writeFileSync(TOPICS_SQL, header('Seed: India topics per specification', topicBlocks.join('\n')));

writeFileSync(
  OBJECTIVES_SQL,
  header(
    'Seed: India subject-level learning objectives',
    block('learning_objectives', learning_objectives)
  )
);

console.log('Wrote:');
console.log(`  ${SPEC_JSON}`);
console.log(`  ${CURRICULUM_SQL}`);
console.log(`  ${TOPICS_SQL}`);
console.log(`  ${OBJECTIVES_SQL}`);
console.log(counts);

// ---------------------------------------------------------------- optional apply

if (APPLY) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Parents before children, so every foreign key resolves.
  const tables: Array<[string, Array<Record<string, unknown>>]> = [
    ['curricula', curricula],
    ['qualifications', qualifications],
    ['exam_boards', exam_boards],
    ['subjects', subjects],
    ['specifications', specifications],
    ['topics', topics],
    ['learning_objectives', learning_objectives],
  ];

  for (const [table, rows] of tables) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from(table)
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        console.error(`Failed to upsert ${table}: ${error.message}`);
        process.exit(1);
      }
    }
    console.log(`  applied ${rows.length} → ${table}`);
  }
}
