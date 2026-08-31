import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../supabase-env';
import { getOrSetCache } from '../redis';
import { resolveTopic, type CurriculumScope, type ResolvedTopic } from './resolve';

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
