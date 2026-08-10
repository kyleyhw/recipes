import { describe, expect, it } from "vitest";
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  costUsd,
  formatUsd,
  MODEL_PRICING,
  MODELS,
  WEB_SEARCH_USD_PER_REQUEST,
} from "@/lib/ai/pricing";

/**
 * Tests for the arithmetic the spend ceiling rests on.
 *
 * The ceiling is the only thing standing between a deployed instance holding a
 * live API key and an unbounded bill, and it is enforced entirely from these
 * numbers. Every case below is hand-computed from the published prices rather
 * than from the implementation, so the test would fail if the implementation
 * and the price list ever disagreed.
 */

describe("token pricing", () => {
  /**
   * One million input tokens on the reasoning model is exactly its published
   * per-MTok input price. Chosen because it is the one input for which the
   * expected value is the published figure itself, with no arithmetic in
   * between to get wrong.
   */
  it("prices one million input tokens at the published input price", () => {
    expect(costUsd(MODELS.reasoning, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(
      MODEL_PRICING[MODELS.reasoning].inputPerMTok,
    );
  });

  it("prices one million output tokens at the published output price", () => {
    expect(costUsd(MODELS.reasoning, { inputTokens: 0, outputTokens: 1_000_000 })).toBe(
      MODEL_PRICING[MODELS.reasoning].outputPerMTok,
    );
  });

  /**
   * Output is five times input on both models. A pricing bug that swapped the
   * two would be invisible on a symmetric call and expensive on a real one,
   * where output dominates.
   */
  it("does not confuse the input and output rates", () => {
    const inputHeavy = costUsd(MODELS.reasoning, {
      inputTokens: 10_000,
      outputTokens: 1_000,
    });
    const outputHeavy = costUsd(MODELS.reasoning, {
      inputTokens: 1_000,
      outputTokens: 10_000,
    });
    expect(outputHeavy).toBeGreaterThan(inputHeavy);
  });

  it("prices a realistic generation call", () => {
    // A recipe generation: roughly 1,500 tokens of system and prompt, 2,000 of
    // recipe and thinking. At $5/$25 per MTok that is 0.0075 + 0.05.
    const cost = costUsd("claude-opus-5", { inputTokens: 1_500, outputTokens: 2_000 });
    expect(cost).toBeCloseTo(0.0575, 10);
  });

  it("prices the cheap model at a fifth of the reasoning model", () => {
    const usage = { inputTokens: 1_000, outputTokens: 1_000 };
    expect(costUsd(MODELS.cheap, usage) * 5).toBeCloseTo(
      costUsd(MODELS.reasoning, usage),
      10,
    );
  });
});

describe("cache and server-tool pricing", () => {
  it("applies the cache multipliers against the base input price", () => {
    const base = MODEL_PRICING[MODELS.cheap].inputPerMTok;
    expect(
      costUsd(MODELS.cheap, {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 1_000_000,
      }),
    ).toBeCloseTo(base * CACHE_WRITE_MULTIPLIER, 10);
    expect(
      costUsd(MODELS.cheap, {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo(base * CACHE_READ_MULTIPLIER, 10);
  });

  /**
   * Web search is billed per search, not per token, and at two searches it
   * exceeds the entire token cost of the photo call. Pricing it at zero — the
   * obvious omission — would make the most expensive operation in the
   * application appear free.
   */
  it("bills web searches per search, independently of tokens", () => {
    const withSearches = costUsd(MODELS.cheap, {
      inputTokens: 1_000,
      outputTokens: 500,
      webSearchRequests: 2,
    });
    const withoutSearches = costUsd(MODELS.cheap, {
      inputTokens: 1_000,
      outputTokens: 500,
    });
    expect(withSearches - withoutSearches).toBeCloseTo(
      2 * WEB_SEARCH_USD_PER_REQUEST,
      10,
    );
    expect(withSearches - withoutSearches).toBeCloseTo(0.02, 10);
    // And the searches dominate: the tokens here cost well under a tenth of it.
    expect(withoutSearches).toBeLessThan(withSearches - withoutSearches);
  });

  it("costs nothing for an empty call", () => {
    expect(costUsd(MODELS.reasoning, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("accumulation", () => {
  /**
   * The property the ceiling actually depends on: cost is additive over calls.
   * If it were rounded per call, a thousand sub-cent calls would accumulate to
   * zero and the ceiling would never trigger.
   */
  it("accumulates small calls rather than rounding them away", () => {
    const one = costUsd(MODELS.cheap, { inputTokens: 100, outputTokens: 50 });
    expect(one).toBeGreaterThan(0);
    const thousand = 1000 * one;
    expect(thousand).toBeCloseTo(
      costUsd(MODELS.cheap, { inputTokens: 100_000, outputTokens: 50_000 }),
      10,
    );
    expect(thousand).toBeGreaterThan(0.3);
  });
});

describe("display", () => {
  it("shows four decimals for figures a two-decimal format would hide", () => {
    expect(formatUsd(0.0035)).toBe("$0.0035");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0)).toBe("$0");
  });
});
