import { describe, expect, it } from "vitest";

import {
  createAttempt,
  DEDUPE_WINDOW_SECONDS,
  readDedupeVerdict,
  type OrderAttempt,
  type PriorAttempt,
} from "../src/store.js";
import {
  buildEnvelopeV1,
  buildEnvelopeV2,
  PINNED_KEY,
} from "./support/envelope.js";
import { PROBE_SENT_AT } from "./support/relayFetch.js";

const corroboratingPrior = (
  attempt: OrderAttempt,
  overrides: Partial<PriorAttempt> = {}
): PriorAttempt => ({
  id: "6",
  sentAt: PROBE_SENT_AT,
  idempotencyKey: PINNED_KEY,
  contentHash: attempt.contentHash,
  ageSeconds: 60,
  ...overrides,
});

describe("the dedupe predicate", () => {
  it("suppresses a retry whose every condition corroborates a delivered twin", () => {
    const attempt = createAttempt(buildEnvelopeV2());

    expect(readDedupeVerdict(attempt, corroboratingPrior(attempt))).toEqual({
      isSuppressed: true,
      dupeOf: "6",
    });
  });

  it("sends when the statement reported no prior at all", () => {
    const attempt = createAttempt(buildEnvelopeV2());

    expect(readDedupeVerdict(attempt, undefined)).toEqual({
      isSuppressed: false,
    });
  });

  it("sends an edited order that reuses the key of a delivered one", () => {
    const edited = createAttempt(
      buildEnvelopeV2({ total: "300.00", idempotency_key: PINNED_KEY })
    );
    const prior = corroboratingPrior(edited, {
      contentHash:
        "1111111111111111111111111111111111111111111111111111111111111111",
    });

    expect(readDedupeVerdict(edited, prior)).toEqual({ isSuppressed: false });
  });

  it("sends again after an ambiguous outcome left the prior unconfirmed", () => {
    const attempt = createAttempt(buildEnvelopeV2());
    const prior = corroboratingPrior(attempt, { sentAt: null });

    expect(readDedupeVerdict(attempt, prior)).toEqual({ isSuppressed: false });
  });

  it("never suppresses a keyless v1 order, even when a prior is offered", () => {
    const attempt = createAttempt(buildEnvelopeV1());
    const prior = corroboratingPrior(attempt);

    expect(readDedupeVerdict(attempt, prior)).toEqual({ isSuppressed: false });
  });

  it("sends when the prior carries no key to corroborate with", () => {
    const attempt = createAttempt(buildEnvelopeV2());
    const prior = corroboratingPrior(attempt, { idempotencyKey: null });

    expect(readDedupeVerdict(attempt, prior)).toEqual({ isSuppressed: false });
  });

  it("sends when the two keys disagree", () => {
    const attempt = createAttempt(buildEnvelopeV2());
    const prior = corroboratingPrior(attempt, { idempotencyKey: "other-key" });

    expect(readDedupeVerdict(attempt, prior)).toEqual({ isSuppressed: false });
  });
});

describe("the thirty-minute dedupe window", () => {
  it("is thirty minutes expressed in seconds", () => {
    expect(DEDUPE_WINDOW_SECONDS).toBe(1800);
  });

  it("suppresses inside the window and sends once the prior falls outside it", () => {
    const attempt = createAttempt(buildEnvelopeV2());
    const verdictAt = (ageSeconds: number | null): boolean =>
      readDedupeVerdict(attempt, corroboratingPrior(attempt, { ageSeconds }))
        .isSuppressed;

    expect(verdictAt(0)).toBe(true);
    expect(verdictAt(60)).toBe(true);
    expect(verdictAt(1799)).toBe(true);
    expect(verdictAt(1800)).toBe(false);
    expect(verdictAt(1801)).toBe(false);
    expect(verdictAt(null)).toBe(false);
  });
});
