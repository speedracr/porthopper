import type { BillingAdapter, SubmitUsageResult, UsageRequest } from "../../../packages/shared/billing.ts";

type MockScenario = "accept" | "reject" | "temporary" | "ambiguous";

export class MockBillingAdapter implements BillingAdapter {
  private readonly accepted = new Map<string, SubmitUsageResult>();
  private readonly scenario: MockScenario;

  constructor(scenario = process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO ?? "accept") {
    if (process.env.NODE_ENV === "production" && (process.env.PORT_HOPPER_MOCK_USAGE_SCENARIO !== undefined || scenario !== "accept")) {
      throw new Error("Mock usage scenarios are disabled in production");
    }
    if (!["accept", "reject", "temporary", "ambiguous"].includes(scenario)) throw new Error("Invalid mock usage scenario");
    this.scenario = scenario as MockScenario;
  }

  async submitUsage(request: Readonly<UsageRequest>): Promise<SubmitUsageResult> {
    const previous = this.accepted.get(request.id);
    if (previous) return previous;
    if (this.scenario === "accept") {
      const result: SubmitUsageResult = { outcome: "accepted", externalId: `mock-${request.id}` };
      this.accepted.set(request.id, result);
      return result;
    }
    return { outcome: this.scenario === "reject" ? "rejected" : this.scenario };
  }
}

export function createMockBillingAdapter(scenario?: string): BillingAdapter {
  return new MockBillingAdapter(scenario);
}
