import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { BillingAdapter, UsageSubmission, UsageAttempt, SubmitUsageResult } from "../../../packages/shared/billing.ts";
import type { Voyage } from "../../../packages/shared/voyages.ts";

export function usageStore(db: DatabaseSync, adapter: BillingAdapter, now: () => number) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE usage_attempts SET completedAt = ?, outcome = 'ambiguous', error = 'Submission interrupted.'
      WHERE completedAt IS NULL`).run(new Date(now()).toISOString());
    db.exec("UPDATE usage_submissions SET status = 'unknown' WHERE status = 'submitting'; COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }

  function get(voyageId: string): UsageSubmission | null {
    const row = db.prepare("SELECT * FROM usage_submissions WHERE voyageId = ?").get(voyageId);
    if (!row) return null;
    return {
      id: String(row.id), voyageId, status: row.status as UsageSubmission["status"],
      createdAt: String(row.createdAt), attemptedAt: row.attemptedAt as string | null,
      externalId: row.externalId as string | null, request: JSON.parse(String(row.request)),
      attempts: db.prepare("SELECT id, startedAt, completedAt, outcome, error FROM usage_attempts WHERE submissionId = ? ORDER BY id").all(row.id) as UsageAttempt[],
    };
  }
  async function submit(voyage: Voyage) {
    if (voyage.endedAt === null || !voyage.durationSeconds || voyage.durationSeconds <= 0) return false;
    const id = `USG-${randomUUID()}`;
    const request = {
      id, voyageId: voyage.id, playerId: voyage.playerId, productKey: voyage.productKey,
      billingCountry: voyage.billingCountry, performanceCountry: voyage.performanceCountry,
      taxLocation: voyage.taxLocation, startedAt: voyage.startedAt, endedAt: voyage.endedAt,
      durationSeconds: voyage.durationSeconds,
    };
    const attemptedAt = new Date(now()).toISOString();
    db.exec("BEGIN IMMEDIATE");
    let attemptId: number;
    let submission: UsageSubmission;
    try {
      db.prepare("INSERT INTO usage_submissions (id, voyageId, status, request, createdAt) VALUES (?, ?, 'pending', ?, ?) ON CONFLICT(voyageId) DO NOTHING")
        .run(id, voyage.id, JSON.stringify(request), attemptedAt);
      submission = get(voyage.id)!;
      const claimed = db.prepare("UPDATE usage_submissions SET status = 'submitting', attemptedAt = ? WHERE id = ? AND status IN ('pending','failed')").run(attemptedAt, submission.id);
      if (!claimed.changes) { db.exec("COMMIT"); return true; }
      attemptId = Number(db.prepare("INSERT INTO usage_attempts (submissionId, startedAt) VALUES (?, ?)").run(submission.id, attemptedAt).lastInsertRowid);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    let result: SubmitUsageResult;
    try {
      result = await adapter.submitUsage(Object.freeze(submission.request));
      if (!result || !["accepted", "rejected", "temporary", "ambiguous"].includes(result.outcome)) result = { outcome: "ambiguous" };
      if (result.outcome === "accepted" && (!result.externalId || result.externalId.length > 200 || !/^[\w.-]+$/.test(result.externalId))) result = { outcome: "ambiguous" };
    } catch { result = { outcome: "ambiguous" }; }
    const status = result.outcome === "accepted" ? "accepted" : result.outcome === "ambiguous" ? "unknown" : "failed";
    const error = { rejected: "Usage rejected.", temporary: "Billing temporarily unavailable.", ambiguous: "Submission outcome unknown.", accepted: null }[result.outcome];
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE usage_submissions SET status = ?, externalId = ? WHERE id = ?").run(status, result.outcome === "accepted" ? result.externalId : null, submission.id);
      db.prepare("UPDATE usage_attempts SET completedAt = ?, outcome = ?, error = ? WHERE id = ?").run(new Date(now()).toISOString(), result.outcome, error, attemptId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      // An accepted response with a conflicting external ID cannot safely be retried.
      if (!(error instanceof Error) || !("errcode" in error) || error.errcode !== 2067) throw error;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE usage_submissions SET status = 'unknown' WHERE id = ?").run(submission.id);
        db.prepare("UPDATE usage_attempts SET completedAt = ?, outcome = 'ambiguous', error = 'Submission outcome unknown.' WHERE id = ?")
          .run(new Date(now()).toISOString(), attemptId);
        db.exec("COMMIT");
      } catch (recoveryError) { db.exec("ROLLBACK"); throw recoveryError; }
    }
    return true;
  }
  return { get, submit };
}
