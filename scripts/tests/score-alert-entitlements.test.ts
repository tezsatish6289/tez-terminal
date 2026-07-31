import {
  clampScoreAlertMinScore,
  withClampedScoreAlertMinScore,
} from "../../src/lib/alerts/prefs";
import { DEFAULT_SCORE_ALERT_PREFERENCES } from "../../src/lib/alerts/constants";
import { hasFeature, type EntitlementContext } from "../../src/lib/entitlements";
import { assertTrue, describe, summary, test } from "./_assert";

function ctx(tier: EntitlementContext["tier"]): EntitlementContext {
  return { tier, isActive: true, isAuthenticated: true };
}

describe("score alert ≥80 entitlement", () => {
  test("trial and silver cannot use score_alerts_80", () => {
    assertTrue(!hasFeature("score_alerts_80", ctx("free")), "trial locked");
    assertTrue(!hasFeature("score_alerts_80", ctx("silver")), "silver locked");
    assertTrue(hasFeature("score_alerts_80", ctx("gold")), "gold open");
    assertTrue(hasFeature("score_alerts_80", ctx("daypass")), "daypass open");
  });

  test("clamp drops 80 to 70 without gold floor", () => {
    assertTrue(clampScoreAlertMinScore(80, false) === 70, "80 → 70");
    assertTrue(clampScoreAlertMinScore(70, false) === 70, "70 stays");
    assertTrue(clampScoreAlertMinScore(80, true) === 80, "gold keeps 80");
  });

  test("prefs helper clamps only minScore", () => {
    const prefs = { ...DEFAULT_SCORE_ALERT_PREFERENCES, minScore: 80 as const, enabled: true };
    const next = withClampedScoreAlertMinScore(prefs, false);
    assertTrue(next.minScore === 70, `got ${next.minScore}`);
    assertTrue(next.enabled === true, "enabled preserved");
  });
});

summary();
