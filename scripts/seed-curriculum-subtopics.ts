/**
 * Generates subtopics for every topic in a country's curriculum tree, one AI call per
 * specification, and both upserts them and writes a SQL seed migration.
 *
 *   bun --env-file=.env.local run scripts/seed-curriculum-subtopics.ts --country india
 *   bun --env-file=.env.local run scripts/seed-curriculum-subtopics.ts --country india --dry
 *
 * Resumable by design: it skips any topic that already has subtopics, so a run killed
 * by a rate limit, a timeout or a crash picks up where it stopped. Re-running after a
 * complete pass is a no-op.
 *
 * Subtopic ids are UUIDv5 of `topic_id/name`, so a re-run that produces the same names
 * conflicts rather than duplicating, and the emitted SQL is stable.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getAIConfig, buildAIHeaders } from '../src/lib/ai/config';
import { extractChatMessageText, extractJsonWithCoercer } from '../src/lib/ai/json';

const arg = (name: string, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const COUNTRY = arg('country', 'india');
const DRY = process.argv.includes('--dry');
const OUT = join(process.cwd(), 'supabase/migrations', `20260817003000_seed_${COUNTRY}_subtopics.sql`);

const NAMESPACE = 'f2b9c0d4-6e51-4a7c-9b3f-1d8a5c2e7043';
const uuidv5 = (name: string): string => {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const ai = getAIConfig();
if (!ai.apiKey) {
  console.error('Set AI_API_KEY (or OPENAI_API_KEY).');
  process.exit(1);
}

// ---------------------------------------------------------------- read the tree

type SpecRow = {
  id: string;
  name: string;
  tier: string | null;
  subjects: {
    name: string;
    exam_boards: { name: string; qualifications: { name: string } | null } | null;
  } | null;
};

const { data: specData, error: specError } = await supabase
  .from('specifications')
  .select('id, name, tier, subjects!inner(name, exam_boards!inner(name, qualifications!inner(name, curricula!inner(country))))')
  .eq('subjects.exam_boards.qualifications.curricula.country', COUNTRY);

if (specError) {
  console.error(`Could not read specifications: ${specError.message}`);
  process.exit(1);
}
const specs = (specData ?? []) as unknown as SpecRow[];

// PostgREST caps a response at 1000 rows and a very long `in` list overflows the URL,
// so every bulk read here has to chunk the filter and page the result. Getting this
// wrong is silent: an empty result reads as "nothing done yet" and regenerates the lot.
const TOPIC_CHUNK = 100;
const PAGE = 1000;

// The topics read needs that paging too, and the failure mode is the nastier one: past row
// 1000 the topics simply never reach `pending`, so the run reports success having skipped
// them. India tripped this the moment the entrance exams took it over 1000 topics.
// Ordered by specification first so a spec's topics stay together in the emitted migration.
const allTopics: Array<{ id: string; name: string; order_index: number; specification_id: string }> = [];
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supabase
    .from('topics')
    .select('id, name, order_index, specification_id')
    .in('specification_id', specs.map((spec) => spec.id))
    .order('specification_id', { ascending: true })
    .order('order_index', { ascending: true })
    .range(offset, offset + PAGE - 1);

  if (error) {
    console.error(`Could not read topics: ${error.message}`);
    process.exit(1);
  }
  const page = (data ?? []) as typeof allTopics;
  allTopics.push(...page);
  if (page.length < PAGE) break;
}

const readSubtopics = async <T>(columns: string): Promise<T[]> => {
  const rows: T[] = [];
  for (let i = 0; i < allTopics.length; i += TOPIC_CHUNK) {
    const chunk = allTopics.slice(i, i + TOPIC_CHUNK).map((topic) => topic.id);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('subtopics')
        .select(columns)
        .in('topic_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.error(`Could not read subtopics: ${error.message}`);
        process.exit(1);
      }
      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
};

// Resumability: anything that already has subtopics is done.
const existing = await readSubtopics<{ topic_id: string }>('topic_id');
const done = new Set(existing.map((row) => row.topic_id));

const pending = allTopics.filter((topic) => !done.has(topic.id));
console.log(
  `${COUNTRY}: ${specs.length} specifications, ${allTopics.length} topics, ${done.size} already done, ${pending.length} to generate.`
);

// ---------------------------------------------------------------- generate

type SubtopicRow = { id: string; topic_id: string; name: string; order_index: number };

/** Pulls a subtopic name out of whichever shape the model used: a bare string, or an
 * object wrapping it under one of the obvious keys. */
const subtopicName = (item: unknown): string | null => {
  if (typeof item === 'string') return item.trim() || null;
  if (item && typeof item === 'object') {
    for (const key of ['name', 'subtopic', 'title', 'text']) {
      const value = (item as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
};

const coerce = (value: unknown): Record<string, string[]> | null => {
  if (!value || typeof value !== 'object') return null;
  // Accept both {"topics": {...}} and a bare {topic: [...]} map.
  const wrapper = (value as { topics?: unknown }).topics;
  const source = wrapper && typeof wrapper === 'object' ? wrapper : value;

  const result: Record<string, string[]> = {};
  for (const [topic, subtopics] of Object.entries(source as Record<string, unknown>)) {
    if (!Array.isArray(subtopics)) continue;
    const names = subtopics.map(subtopicName).filter((name): name is string => !!name);
    if (names.length > 0) result[topic] = names;
  }
  return Object.keys(result).length > 0 ? result : null;
};

const generateForSpec = async (spec: SpecRow, topics: typeof pending): Promise<Record<string, string[]> | null> => {
  const subject = spec.subjects?.name ?? '';
  const board = spec.subjects?.exam_boards?.name ?? '';
  const qualification = spec.subjects?.exam_boards?.qualifications?.name ?? '';
  const specLabel = [spec.name, spec.tier].filter(Boolean).join(' - ');

  const prompt =
    `You are a ${qualification} ${subject} examiner working from the current ${board} syllabus.\n` +
    `Specification: ${specLabel}.\n\n` +
    `For each topic below, list 3-6 subtopics: the specific, revisable units a student would ` +
    `actually study within that topic. Be precise to this specification — do not import content ` +
    `from another board or another class level. Each subtopic should be a short noun phrase ` +
    `(under 90 characters), specific enough to generate exam questions from.\n\n` +
    `Topics:\n${topics.map((topic) => `- ${topic.name}`).join('\n')}\n\n` +
    `Return strict JSON: {"topics": {"<exact topic name>": ["subtopic", ...], ...}}. ` +
    `Use the topic names exactly as given.`;

  // A dropped socket must not take the run down with it: this call sits inside a
  // Promise.all, so an unhandled rejection would abandon every other specification
  // in flight. Return null and let the caller's retry loop handle it.
  try {
    const response = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(ai),
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.warn(`  ! ${specLabel}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
      return null;
    }

    const text = extractChatMessageText(await response.json());
    return extractJsonWithCoercer(text, coerce);
  } catch (error) {
    console.warn(`  ! ${specLabel}: ${error instanceof Error ? error.message : 'request failed'}`);
    return null;
  }
};

const bySpec = new Map<string, typeof pending>();
for (const topic of pending) {
  const list = bySpec.get(topic.specification_id) ?? [];
  list.push(topic);
  bySpec.set(topic.specification_id, list);
}

// The model echoes topic names back with drifting case, punctuation and dash styles,
// so match on a normalised key rather than the literal string.
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const mapRows = (result: Record<string, string[]>, topics: typeof pending): SubtopicRow[] => {
  const returned = new Map(Object.entries(result).map(([topic, subtopics]) => [normalise(topic), subtopics]));
  const rows: SubtopicRow[] = [];
  for (const topic of topics) {
    const names = returned.get(normalise(topic.name)) ?? [];
    names.slice(0, 6).forEach((name, index) => {
      const clean = name.trim().slice(0, 200);
      rows.push({ id: uuidv5(`${topic.id}/${clean}`), topic_id: topic.id, name: clean, order_index: index });
    });
  }
  // De-duplicate: the same subtopic name under one topic collapses to one id, and
  // upserting two rows with the same id in a single request errors.
  return [...new Map(rows.map((row) => [row.id, row])).values()];
};

const processSpec = async (specificationId: string, topics: typeof pending, position: number) => {
  const spec = specs.find((entry) => entry.id === specificationId);
  if (!spec) return [];
  const label = [spec.name, spec.tier].filter(Boolean).join(' - ');

  // Retry on an empty mapping, not just an unparseable response — the model sometimes
  // returns well-formed JSON keyed on topic names it invented rather than the ones given.
  let unique: SubtopicRow[] = [];
  for (let attempt = 1; attempt <= 3 && unique.length === 0; attempt += 1) {
    const result = await generateForSpec(spec, topics);
    if (result) unique = mapRows(result, topics);
    if (unique.length === 0 && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }

  if (unique.length === 0) {
    console.log(`[${position}/${bySpec.size}] ${label} — no usable subtopics after 3 attempts, skipping`);
    return [];
  }

  if (!DRY) {
    const { error } = await supabase.from('subtopics').upsert(unique, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.warn(`  ! ${label}: upsert failed: ${error.message}`);
  }

  console.log(`[${position}/${bySpec.size}] ${label} (${topics.length} topics) — ${unique.length} subtopics`);
  return unique;
};

// A few specifications in flight at once: the run is ~100 sequential model calls
// otherwise, and each one takes several seconds. Kept low to stay well inside provider
// rate limits — a 429 costs more than the parallelism saves.
const CONCURRENCY = 5;
const entries = [...bySpec.entries()];
const generated: SubtopicRow[] = [];
let cursor = 0;

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      const [specificationId, topics] = entries[index];
      generated.push(...(await processSpec(specificationId, topics, index + 1)));
    }
  })
);

// ---------------------------------------------------------------- emit SQL

if (DRY) {
  console.log(`\nDry run — would have written ${generated.length} subtopics.`);
  process.exit(0);
}

// Read back everything rather than emitting only what this pass produced: after a
// resumed run, `generated` holds just the last slice, and the migration has to carry
// the whole set to stand up a fresh database.
type PersistedRow = { id: string; topic_id: string; name: string; order_index: number };
const persisted = await readSubtopics<PersistedRow>('id, topic_id, name, order_index');

// Stable order so regenerating the file produces a readable diff.
const topicOrder = new Map(allTopics.map((topic, index) => [topic.id, index]));
persisted.sort(
  (a, b) => (topicOrder.get(a.topic_id) ?? 0) - (topicOrder.get(b.topic_id) ?? 0) || a.order_index - b.order_index
);

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
const BATCH = 500;
const blocks: string[] = [];
for (let i = 0; i < persisted.length; i += BATCH) {
  const values = persisted
    .slice(i, i + BATCH)
    .map((row) => `  ('${row.id}', '${row.topic_id}', ${q(row.name)}, ${row.order_index})`);
  blocks.push(
    [
      'INSERT INTO subtopics (id, topic_id, name, order_index) VALUES',
      values.join(',\n'),
      'ON CONFLICT (id) DO NOTHING;',
      '',
    ].join('\n')
  );
}

writeFileSync(
  OUT,
  [
    `-- Seed: ${COUNTRY} subtopics, 3-6 per topic.`,
    `-- Generated by scripts/seed-curriculum-subtopics.ts using ${ai.model}, one call per`,
    `-- specification. Ids are UUIDv5 of "topic_id/name" so re-running conflicts rather`,
    `-- than duplicating. Re-run the script to fill any topic a pass skipped; it rewrites`,
    `-- this file from the full set each time.`,
    '',
    blocks.join('\n'),
  ].join('\n')
);
console.log(`\nGenerated ${generated.length} this pass; wrote ${persisted.length} total to ${OUT}`);
