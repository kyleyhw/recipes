import { budgetStatus } from "@/lib/ai/client";
import { formatUsd } from "@/lib/ai/pricing";

/**
 * What Claude has cost this month, against the ceiling.
 *
 * Shown wherever a billable action is offered, rather than hidden on a settings
 * page. A spend ceiling the owner cannot see is one they discover by hitting
 * it, halfway through cooking; a running figure next to the button is what
 * makes the ceiling a budget rather than a surprise.
 */
export async function AiBudgetNote() {
  const budget = await budgetStatus();
  const month = budget.since.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <p className={`text-xs ${budget.exceeded ? "text-warn" : "text-text-muted"}`}>
      Claude has cost {formatUsd(budget.spentUsd)} since the start of {month}, across{" "}
      {budget.calls} call{budget.calls === 1 ? "" : "s"}, against a ceiling of{" "}
      {formatUsd(budget.ceilingUsd)}.
      {budget.exceeded
        ? " The ceiling has been reached; raise AI_MONTHLY_BUDGET_USD to continue."
        : null}
    </p>
  );
}
