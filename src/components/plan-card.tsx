import { CircleCheck, CircleX } from "lucide-react";
import { formatCad, STORES } from "../lib/catalog";
import type { PlanEvaluation } from "../lib/pricing";

export function PlanTable({ evaluation }: { evaluation: PlanEvaluation }) {
  return (
    <table className="plan-table">
      <thead>
        <tr><th scope="col">Item</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Unit</th><th scope="col" className="num">Line</th></tr>
      </thead>
      <tbody>
        {evaluation.carts.map(cart => [
          <tr key={`${cart.storeId}-head`} className="store-row"><td colSpan={3}>{STORES[cart.storeId].name}</td><td className="num">{formatCad(cart.totalCents)}</td></tr>,
          ...cart.lines.map(line => (
            <tr key={`${cart.storeId}-${line.sku}`}><td>{line.name} <span className="aux">({line.sku})</span></td><td className="num">{line.quantity}</td><td className="num">{formatCad(line.unitCents)}</td><td className="num">{formatCad(line.lineCents)}</td></tr>
          )),
          <tr key={`${cart.storeId}-ship`}><td colSpan={3} className="aux">Shipping</td><td className="num">{cart.shippingCents === 0 ? "Free" : formatCad(cart.shippingCents)}</td></tr>,
        ])}
      </tbody>
    </table>
  );
}

export function PlanChecks({ evaluation }: { evaluation: PlanEvaluation }) {
  const reportedGap = evaluation.reportedTotalCents === null ? 0 : evaluation.reportedTotalCents - evaluation.totalCents;
  const bestGap = evaluation.bestCents === null ? null : evaluation.totalCents - evaluation.bestCents;
  const checks: Array<{ ok: boolean; text: string }> = [
    { ok: evaluation.complete, text: evaluation.complete ? "All 60 items are in the plan." : "Quantities do not match the mission." },
    { ok: evaluation.meetsDeadline, text: evaluation.meetsDeadline ? "Everything arrives within the deadline." : "Something arrives after the deadline." },
    { ok: evaluation.withinBudget, text: evaluation.withinBudget ? `Within the ${formatCad(evaluation.budgetCents)} budget.` : `Over the ${formatCad(evaluation.budgetCents)} budget by ${formatCad(evaluation.totalCents - evaluation.budgetCents)}.` },
    { ok: evaluation.issues.length === 0, text: evaluation.issues.length === 0 ? "Stock, prices and SKUs match the store catalogues." : evaluation.issues[0] },
  ];
  return (
    <>
      <div className="plan-total"><span>Total, recomputed by ProxyCart</span><span>{formatCad(evaluation.totalCents)}</span></div>
      <ul className="checks" aria-label="Checks run by code">
        {checks.map(check => <li key={check.text} className={check.ok ? "ok" : "fail"}>{check.ok ? <CircleCheck size={19} aria-hidden="true" /> : <CircleX size={19} aria-hidden="true" />}<span>{check.text}</span></li>)}
        {reportedGap !== 0 && <li className="fail"><CircleX size={19} aria-hidden="true" /><span>The agent reported {formatCad(evaluation.reportedTotalCents!)}; the stores' prices give {formatCad(evaluation.totalCents)}. ProxyCart uses the stores' numbers.</span></li>}
        {bestGap !== null && <li className={bestGap === 0 ? "ok" : ""}>{bestGap === 0 ? <CircleCheck size={19} aria-hidden="true" /> : <span aria-hidden="true">·</span>}<span>{bestGap === 0 ? "This is the cheapest plan that meets every requirement." : `The cheapest compliant plan right now costs ${formatCad(evaluation.bestCents!)} (${formatCad(bestGap)} less).`}</span></li>}
      </ul>
    </>
  );
}
