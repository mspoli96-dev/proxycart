"use client";

import { Ban, Bot, CircleCheck, Download, Globe, KeyRound, MessageSquare, MousePointerClick, PackageX, Receipt, Store, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { formatCad, STORES } from "../lib/catalog";
import type { PendingAction, RespondRequest, RunSnapshot, TimelineStep } from "../lib/contracts";
import { BUDGET_OPTIONS_CENTS } from "../lib/mission";
import { PlanChecks, PlanTable } from "./plan-card";

function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\s)\*([^*\s][^*]*)\*/g, "$1$2").replace(/`([^`]+)`/g, "$1");
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function storeName(storeId: keyof typeof STORES | null | undefined): string {
  return storeId ? STORES[storeId].name : "an unknown site";
}

const STATUS_TEXT: Record<RunSnapshot["status"], string> = {
  starting: "Starting the cloud browser",
  running: "The agent is working",
  waiting: "Waiting for your decision",
  completed: "Run finished",
  failed: "Run failed",
  cancelled: "Run stopped",
  expired: "Run timed out",
};

function StepView({ step }: { step: TimelineStep }) {
  switch (step.kind) {
    case "action":
      return (
        <li className="step agent">
          <span className="step-icon"><MousePointerClick size={20} aria-hidden="true" /></span>
          <div>
            <div className="step-meta"><span>Browser action</span><span>{clock(step.at)}</span></div>
            <p className="step-title">{step.title}</p>
            {step.status !== "completed" && <p className="step-body">{step.status === "in_progress" ? "In progress" : step.status === "failed" ? "Failed" : "Stopped early"}</p>}
          </div>
        </li>
      );
    case "message":
      return (
        <li className="step agent">
          <span className="step-icon"><MessageSquare size={20} aria-hidden="true" /></span>
          <div><div className="step-meta"><span>Agent</span><span>{clock(step.at)}</span></div><p className="step-body">{plain(step.text)}</p></div>
        </li>
      );
    case "origin":
      return (
        <li className={`step decision ${step.decision === "approve" ? "" : "bad"}`}>
          <span className="step-icon"><Globe size={20} aria-hidden="true" /></span>
          <div><div className="step-meta"><span>Buyer's decision</span><span>{clock(step.at)}</span></div><p className="step-title">{step.decision === "approve" ? `Allowed the browser into ${storeName(step.storeId)}` : `Blocked ${step.storeId ? storeName(step.storeId) : step.origin}`}</p></div>
        </li>
      );
    case "sign-in":
      return (
        <li className="step decision">
          <span className="step-icon"><KeyRound size={20} aria-hidden="true" /></span>
          <div><div className="step-meta"><span>Buyer's decision</span><span>{clock(step.at)}</span></div><p className="step-title">{step.decision === "submit" ? `Signed in at ${storeName(step.storeId)} with the demo account` : "Declined the sign-in"}</p>{step.decision === "submit" && <p className="step-body">The values went straight into the browser form. The model never saw the password.</p>}</div>
        </li>
      );
    case "approval": {
      const label = step.decision === "approve" ? `Approved ${formatCad(step.evaluation.totalCents)} and issued ${step.mandates.length} mandate${step.mandates.length === 1 ? "" : "s"}` : step.decision === "reject" ? `Declined a ${formatCad(step.evaluation.totalCents)} plan` : step.decision === "reduce-budget" ? `Lowered the budget to ${formatCad(step.newBudgetCents ?? 0)}` : "ProxyCart's checks returned the plan";
      return (
        <li className={`step decision ${step.decision === "approve" ? "good" : step.decision === "returned" ? "bad" : ""}`}>
          <span className="step-icon"><Wallet size={20} aria-hidden="true" /></span>
          <div><div className="step-meta"><span>{step.decision === "returned" ? "Checked by code" : "Buyer's decision"}</span><span>{clock(step.at)}</span></div><p className="step-title">{label}</p>{step.decision === "returned" && step.evaluation.issues[0] && <p className="step-body">{step.evaluation.issues[0]}</p>}{step.changeReason && <p className="step-body">Agent: {plain(step.changeReason)}</p>}</div>
        </li>
      );
    }
    case "store": {
      const tone = step.event.kind === "order-placed" || step.event.kind === "signed-in" ? "good" : step.event.kind === "checkout-blocked" || step.event.kind === "stock-changed" || step.event.kind === "sign-in-failed" ? "bad" : "";
      const Icon = step.event.kind === "order-placed" ? Receipt : step.event.kind === "checkout-blocked" ? Ban : step.event.kind === "stock-changed" ? PackageX : Store;
      return (
        <li className={`step store ${tone}`}>
          <span className="step-icon"><Icon size={20} aria-hidden="true" /></span>
          <div><div className="step-meta"><span>{STORES[step.event.storeId].name} server</span><span>{clock(step.at)}</span></div><p className="step-body">{step.event.kind === "visit" ? `Agent opened the ${step.event.detail} page.` : step.event.detail}</p></div>
        </li>
      );
    }
  }
}

function PendingCard({ pending, budgetCents, busy, onRespond }: { pending: PendingAction; budgetCents: number; busy: boolean; onRespond: (request: RespondRequest) => void }) {
  const lower = BUDGET_OPTIONS_CENTS.filter(option => option < budgetCents);
  const [budget, setBudget] = useState<number>(lower[0] ?? 0);
  if (pending.kind === "origin") {
    return (
      <section className="panel decision-card" aria-live="polite">
        <h3><Globe size={22} aria-hidden="true" />The agent wants to open {storeName(pending.storeId)}</h3>
        <p>{pending.origin}</p>
        <p className="aux">OpenAI's cloud browser asks before it visits each new site. Allowing a site does not let the agent pay there.</p>
        <div className="decision-actions">
          <button className="button approve" disabled={busy} onClick={() => onRespond({ kind: "origin", requestId: pending.requestId, decision: "approve" })}>Allow this store</button>
          <button className="button danger" disabled={busy} onClick={() => onRespond({ kind: "origin", requestId: pending.requestId, decision: "deny" })}>Block it</button>
        </div>
      </section>
    );
  }
  if (pending.kind === "sign-in") {
    return (
      <section className="panel decision-card" aria-live="polite">
        <h3><KeyRound size={22} aria-hidden="true" />{storeName(pending.storeId)} asks for a sign-in</h3>
        {pending.reason && <p className="agent-quote">{plain(pending.reason)}</p>}
        <p className="aux">ProxyCart can send the store's demo account straight to the browser form. The values never enter the model's context.</p>
        <div className="decision-actions">
          <button className="button approve" disabled={busy} onClick={() => onRespond({ kind: "sign-in", requestId: pending.requestId, decision: "submit" })}>Sign in with the demo account</button>
          <button className="button danger" disabled={busy} onClick={() => onRespond({ kind: "sign-in", requestId: pending.requestId, decision: "cancel" })}>Don't sign in</button>
        </div>
      </section>
    );
  }
  return (
    <section className="panel decision-card" aria-live="polite">
      <h3><Wallet size={22} aria-hidden="true" />Approve this purchase?</h3>
      {pending.changeReason && <p className="agent-quote"><strong>What changed:</strong> {plain(pending.changeReason)}</p>}
      <PlanTable evaluation={pending.evaluation} />
      <PlanChecks evaluation={pending.evaluation} />
      <p className="agent-quote">{plain(pending.summary)}</p>
      <div className="decision-actions">
        <button className="button approve" disabled={busy || !pending.evaluation.valid} onClick={() => onRespond({ kind: "approval", callId: pending.callId, decision: "approve" })}>Approve and issue mandates</button>
        {lower.length > 0 && (
          <>
            <label className="sr-only" htmlFor="budget-select">Lower budget</label>
            <select id="budget-select" value={budget} onChange={event => setBudget(Number(event.target.value))}>{lower.map(option => <option key={option} value={option}>{formatCad(option)}</option>)}</select>
            <button className="button secondary" disabled={busy} onClick={() => onRespond({ kind: "approval", callId: pending.callId, decision: "reduce-budget", budgetCents: budget })}>Ask for a cheaper plan</button>
          </>
        )}
        <button className="button danger" disabled={busy} onClick={() => onRespond({ kind: "approval", callId: pending.callId, decision: "reject" })}>Decline</button>
      </div>
    </section>
  );
}

function downloadAudit(snapshot: RunSnapshot) {
  const audit = { ...snapshot, steps: snapshot.steps.map(step => (step.kind === "action" ? { ...step, screenshot: step.screenshot ? "[omitted]" : null } : step)), exportedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `proxycart-${snapshot.source}-${snapshot.id.slice(0, 8)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RunView({ snapshot, busy = false, onRespond, extraControls }: { snapshot: RunSnapshot; busy?: boolean; onRespond?: (request: RespondRequest) => void; extraControls?: React.ReactNode }) {
  const steps = snapshot.steps;
  const liveSteps = steps.filter(step => step.kind !== "action" && step.kind !== "message");
  const agentLog = steps.filter(step => step.kind === "action" || step.kind === "message");
  const latestApproval = [...steps].reverse().find((step): step is Extract<TimelineStep, { kind: "approval" }> => step.kind === "approval");
  const latestShot = [...steps].reverse().find((step): step is Extract<TimelineStep, { kind: "action" }> => step.kind === "action" && Boolean(step.screenshot));
  const orders = steps.filter((step): step is Extract<TimelineStep, { kind: "store" }> => step.kind === "store" && step.event.kind === "order-placed");
  const ordered = orders.reduce((sum, step) => sum + (step.event.amountCents ?? 0), 0);
  const finished = ["completed", "failed", "cancelled", "expired"].includes(snapshot.status);
  return (
    <div>
      <div className="run-status">
        <span className={snapshot.source === "recorded" ? "recorded-badge" : "live-badge"}>{snapshot.source === "recorded" ? "Recorded run" : "Live run"}</span>
        <strong>{STATUS_TEXT[snapshot.status]}</strong>
        <span>{clock(snapshot.elapsedMs)} elapsed</span>
        <span>Model {snapshot.model}</span>
        <span>Budget {formatCad(snapshot.budgetCents)}</span>
        {snapshot.conditions.hoodiesSoldOutAt.length > 0 && <span><TriangleAlert size={16} aria-hidden="true" /> Hoodies sold out at {snapshot.conditions.hoodiesSoldOutAt.map(storeId => STORES[storeId].name).join(", ")}</span>}
        {snapshot.conditions.stockOutArmed && snapshot.conditions.hoodiesSoldOutAt.length === 0 && <span><TriangleAlert size={16} aria-hidden="true" /> Stock-out armed for the next hoodie checkout</span>}
      </div>
      {extraControls}
      <div className="run-layout">
        <div className="run-columns">
          <section aria-labelledby="timeline-heading">
            <h3 id="timeline-heading" className="column-heading">As it happened</h3>
            <p className="aux">The buyer's decisions and what each store's server saw, in real time.</p>
            {liveSteps.length === 0 ? <p className="panel"><Bot size={22} aria-hidden="true" /> The cloud browser is starting. The first store visit usually appears within a minute.</p> : <ol className="timeline">{liveSteps.map(step => <StepView key={step.id} step={step} />)}</ol>}
          </section>
          <section aria-labelledby="agent-log-heading" className="agent-log">
            <h3 id="agent-log-heading" className="column-heading">The agent's own log</h3>
            <p className="aux">The Agents API publishes the agent's actions and notes when its turn ends, so they arrive together.</p>
            {agentLog.length === 0 ? <p className="panel">{finished ? "No actions were published for this run." : "Waiting for the agent to finish its turn."}</p> : <ol className="timeline compact">{agentLog.map(step => <StepView key={step.id} step={step} />)}</ol>}
          </section>
        </div>
        <div className="now-panel">
          {snapshot.pending && onRespond && <PendingCard key={snapshot.pending.kind === "approval" ? snapshot.pending.callId : snapshot.pending.requestId} pending={snapshot.pending} budgetCents={snapshot.budgetCents} busy={busy} onRespond={onRespond} />}
          {!snapshot.pending && latestApproval && (
            <section className="panel">
              <h3>{latestApproval.decision === "approve" ? "Approved plan" : latestApproval.decision === "returned" ? "Plan returned by ProxyCart's checks" : latestApproval.decision === "reduce-budget" ? "Plan sent back with a lower budget" : "Declined plan"}</h3>
              <PlanTable evaluation={latestApproval.evaluation} />
              <PlanChecks evaluation={latestApproval.evaluation} />
              {latestApproval.summary && <p className="agent-quote"><strong>The agent's reasoning:</strong> {plain(latestApproval.summary)}</p>}
              {latestApproval.mandates.length > 0 && (
                <>
                  <p className="aux" style={{ marginTop: 14 }}>Single-use mandates, each bound to one store, cart and amount for 15 minutes:</p>
                  <ul className="mandate-list">{latestApproval.mandates.map(mandate => <li key={mandate.code}><span>{STORES[mandate.storeId].name}</span><span>{mandate.code.slice(0, 4)}••••-{mandate.code.slice(-4)} · {formatCad(mandate.amountCents)}</span></li>)}</ul>
                </>
              )}
            </section>
          )}
          {latestShot?.screenshot && (
            <figure className="screen">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latestShot.screenshot} alt={`Cloud browser screenshot: ${latestShot.title}`} />
              <figcaption className="screen-caption">What the agent saw: {latestShot.title}</figcaption>
            </figure>
          )}
          {orders.length > 0 && (
            <section className="panel">
              <h3><CircleCheck size={22} aria-hidden="true" /> Test orders accepted by the stores</h3>
              {orders.map(step => <div key={step.id} className="receipt"><strong>{STORES[step.event.storeId].name}</strong> · {step.event.orderNumber} · {formatCad(step.event.amountCents ?? 0)}<br /><span>Mandate {step.event.mandate} verified by the store server.</span></div>)}
              <p className="plan-total"><span>Total ordered</span><span>{formatCad(ordered)}</span></p>
            </section>
          )}
          {finished && snapshot.finalMessage && <section className="panel"><h3>The agent's summary</h3><p className="final-message">{plain(snapshot.finalMessage)}</p></section>}
          {finished && <button className="button secondary" onClick={() => downloadAudit(snapshot)}><Download size={20} aria-hidden="true" />Export the audit trail (JSON)</button>}
        </div>
      </div>
    </div>
  );
}
