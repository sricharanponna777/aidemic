import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/subtopic-classification.json';
import { classifyQuestionsToSubtopics } from '../src/lib/ai/classifySubtopic';

/**
 * Accuracy eval for closed-set subtopic classification.
 *
 * This is NOT a unit test — it calls the live model and costs money, so it is
 * skipped unless RUN_EVALS=1. Run it before changing the classifier prompt and
 * before changing OPENAI_MODEL:
 *
 *   RUN_EVALS=1 bun run test -- evals/
 *
 * Why it exists: every downstream feature (knowledge graph, planner, class
 * heatmap, grade forecast) reads a belief state whose accuracy is bounded by
 * this step. A model swap on OpenRouter that quietly drops accuracy from 90% to
 * 60% would corrupt every one of them, and nothing else in the codebase would
 * notice. The threshold below is deliberately a hard gate, not a report.
 */

/** Below this, the spine is attributing evidence to the wrong nodes too often. */
const MIN_ACCURACY = 0.8;
/** Wrong attribution is worse than none, so misclassification is capped tighter. */
const MAX_MISCLASSIFICATION = 0.1;

const shouldRun = process.env.RUN_EVALS === '1';

describe.skipIf(!shouldRun)('subtopic classification accuracy', () => {
  for (const testCase of fixtures.cases) {
    it(
      `classifies "${testCase.topic}" questions to the right subtopic`,
      { timeout: 120_000 },
      async () => {
        const questions = testCase.questions.map((q) => q.text);
        const { subtopicIds, error } = await classifyQuestionsToSubtopics(
          testCase.candidates,
          questions
        );
        expect(error).toBeUndefined();

        let correct = 0;
        let wrong = 0;
        const failures: string[] = [];

        testCase.questions.forEach((question, index) => {
          const actual = subtopicIds[index];
          if (actual === question.expected) {
            correct += 1;
          } else if (actual !== null) {
            wrong += 1;
            failures.push(`  "${question.text}"\n    expected ${question.expected}, got ${actual}`);
          } else {
            failures.push(`  "${question.text}"\n    expected ${question.expected}, got no match`);
          }
        });

        const accuracy = correct / questions.length;
        const misclassification = wrong / questions.length;

        if (failures.length > 0) {
          console.log(`\n${testCase.topic} — ${correct}/${questions.length} correct\n${failures.join('\n')}`);
        }

        expect(accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY);
        expect(misclassification).toBeLessThanOrEqual(MAX_MISCLASSIFICATION);
      }
    );
  }
});

describe('eval fixtures', () => {
  it('every expected id refers to a real candidate', () => {
    for (const testCase of fixtures.cases) {
      const ids = new Set(testCase.candidates.map((c) => c.id));
      for (const question of testCase.questions) {
        expect(ids, `${testCase.topic}: ${question.expected}`).toContain(question.expected);
      }
    }
  });

  it('covers enough cases to be meaningful', () => {
    const total = fixtures.cases.reduce((n, c) => n + c.questions.length, 0);
    expect(total).toBeGreaterThanOrEqual(15);
  });
});
