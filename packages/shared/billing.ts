export type UsageRequest = {
  id: string;
  voyageId: string;
  playerId: string;
  productKey: string;
  billingCountry: string;
  performanceCountry: string;
  taxLocation: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};
export type UsageStatus = "pending" | "submitting" | "accepted" | "failed" | "unknown";
export type UsageAttempt = {
  id: number;
  startedAt: string;
  completedAt: string | null;
  outcome: "accepted" | "rejected" | "temporary" | "ambiguous" | null;
  error: string | null;
};
export type UsageSubmission = {
  id: string;
  voyageId: string;
  status: UsageStatus;
  createdAt: string;
  attemptedAt: string | null;
  externalId: string | null;
  request: UsageRequest;
  attempts: UsageAttempt[];
};
export type SubmitUsageResult =
  | { outcome: "accepted"; externalId: string }
  | { outcome: "rejected" | "temporary" | "ambiguous" };
export interface BillingAdapter {
  submitUsage(request: Readonly<UsageRequest>): Promise<SubmitUsageResult>;
}
