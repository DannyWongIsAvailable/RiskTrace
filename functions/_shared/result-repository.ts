import type { ReviewResultRow, ReviewResultType } from './domain'
import { createId } from './ids'

export async function upsertReviewResult(
  db: D1Database,
  input: {
    reviewRunId: string
    resultType: ReviewResultType
    schemaVersion: string
    result: unknown
    rawOutputObjectKey?: string | null
    now: string
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO review_results (
        id, review_run_id, result_type, schema_version, result_json,
        raw_output_object_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_run_id, result_type) DO UPDATE SET
        schema_version = excluded.schema_version,
        result_json = excluded.result_json,
        raw_output_object_key = COALESCE(excluded.raw_output_object_key, review_results.raw_output_object_key),
        updated_at = excluded.updated_at`,
    )
    .bind(
      createId('result'),
      input.reviewRunId,
      input.resultType,
      input.schemaVersion,
      JSON.stringify(input.result),
      input.rawOutputObjectKey ?? null,
      input.now,
      input.now,
    )
    .run()
}

export async function findReviewResult(
  db: D1Database,
  reviewRunId: string,
  resultType: ReviewResultType,
): Promise<ReviewResultRow | null> {
  return db
    .prepare(
      `SELECT * FROM review_results
       WHERE review_run_id = ? AND result_type = ?`,
    )
    .bind(reviewRunId, resultType)
    .first<ReviewResultRow>()
}

export async function reviewResultExists(
  db: D1Database,
  reviewRunId: string,
  resultType: ReviewResultType,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM review_results
       WHERE review_run_id = ? AND result_type = ?`,
    )
    .bind(reviewRunId, resultType)
    .first<{ found: number }>()

  return row?.found === 1
}
