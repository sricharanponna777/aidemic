import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../supabase-env';
import { getOrSetCache } from '../redis';
import { loadTopicSubtopics, resolveTopic, type CurriculumScope, type ResolvedTopic } from './resolve';
import type { SubtopicCandidate } from './subtopicMatch';

const ONE_DAY_SECONDS = 60 * 60 * 24;

/**
 * Cached `resolveTopic`. The curriculum tables it reads (`specifications`,
 * `topics`, `subtopics`) are RLS `USING (true)` -- identical for every user --
 * so the result is safe to share globally rather than per request. Runs on
 * every marking and blurting evidence write, which is why resolve.ts already
 * flags the underlying query as expensive.
 *
 * Uses its own anon client rather than the caller's, so the cache key only
 * needs to depend on the plain (scope, topicName) args.
 */
export const cachedResolveTopic = (scope: CurriculumScope, topicName: string): Promise<ResolvedTopic | null> => {
  const key = `curriculum:resolve-topic:${JSON.stringify([scope.subject, scope.examBoard, scope.examType, scope.tier ?? null, topicName])}`;

  return getOrSetCache(key, ONE_DAY_SECONDS, async () => {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const db = createClient(supabaseUrl, supabaseAnonKey);
    return resolveTopic(db, scope, topicName);
  });
};

/**
 * Cached `loadTopicSubtopics`. Same sharing argument as `cachedResolveTopic`:
 * `subtopics` is RLS `USING (true)`, so one topic's subtopic list is identical
 * for every user and the topic id alone is a sufficient cache key.
 */
export const cachedLoadTopicSubtopics = (topicId: string): Promise<SubtopicCandidate[]> =>
  getOrSetCache(`curriculum:topic-subtopics:${topicId}`, ONE_DAY_SECONDS, async () => {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const db = createClient(supabaseUrl, supabaseAnonKey);
    return loadTopicSubtopics(db, topicId);
  });
