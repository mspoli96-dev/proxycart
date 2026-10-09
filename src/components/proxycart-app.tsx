"use client";

import { Pause, Play, RotateCcw, SkipForward, Square, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveConfig, RecordedRun, RespondRequest, RunSnapshot, Scenario } from "../lib/contracts";
import { RunView } from "./run-view";

const ACTIVE = new Set<RunSnapshot["status"]>(["starting", "running", "waiting"]);
const LIVE_KEY = "proxycart:live-run";

function recordingLength(run: RecordedRun): number {
  return Math.max(run.elapsedMs, ...run.steps.map(step => step.at)) + 1_500;
}

function RecordedPlayer({ runs }: { runs: RecordedRun[] }) {
  const [selected, setSelected] = useState(runs[0]?.id ?? "");
  const run = runs.find(entry => entry.id === selected) ?? runs[0];
  const length = run ? recordingLength(run) : 0;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);

  useEffect(() => { setTime(0); setPlaying(false); }, [selected]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime(current => {
      const next = current + 250 * speed;
      if (next >= length) { setPlaying(false); return length; }
      return next;
    }), 250);
    return () => window.clearInterval(timer);
  }, [playing, speed, length]);

  const snapshot = useMemo<RunSnapshot | null>(() => {
    if (!run) return null;
    const done = time >= length;
    return { ...run, status: done ? run.status : "running", elapsedMs: Math.min(time, run.elapsedMs), steps: run.steps.filter(step => step.at <= time), pending: null, finalMessage: done ? run.finalMessage : null };
  }, [run, time, length]);

  if (!run || !snapshot) return <p className="notice">Recorded runs are being prepared. Please check back shortly.</p>;
  return (
    <div>
      <div className="recorded-picker" role="group" aria-label="Recorded runs">
        {runs.map(entry => (
          <button key={entry.id} className="recorded-option" aria-pressed={entry.id === run.id} onClick={() => setSelected(entry.id)}>
            <strong>{entry.title}</strong>
            <span>{entry.description}</span>
          </button>
        ))}
      </div>
      <div className="player-bar">
        <button className="button primary" onClick={() => { if (time >= length) setTime(0); setPlaying(!playing); }}>{playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}{playing ? "Pause" : time === 0 ? "Play the recording" : time >= length ? "Replay" : "Resume"}</button>
        <button className="button secondary" onClick={() => { setPlaying(false); setTime(length); }}><SkipForward size={20} aria-hidden="true" />Show the whole run</button>
        <button className="button secondary" onClick={() => { setPlaying(false); setTime(0); }}><RotateCcw size={20} aria-hidden="true" />Restart</button>
        <label className="aux">Speed{" "}
          <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
            <option value={2}>2×</option>
            <option value={6}>6×</option>
            <option value={15}>15×</option>
          </select>
        </label>
        <span className="aux">Recorded {new Date(run.recordedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })} with {run.model}. The buyer's decisions were scripted in advance for each scenario.</span>
      </div>
      <RunView snapshot={snapshot} />
    </div>
  );
}

function LiveRun({ config }: { config: LiveConfig | null }) {
  const [scenario, setScenario] = useState<Scenario>("standard");
  const [consent, setConsent] = useState(false);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
    return body as RunSnapshot;
  }, []);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(LIVE_KEY);
      if (saved) call(`/api/runs/${saved}`).then(setSnapshot).catch(() => window.sessionStorage.removeItem(LIVE_KEY));
    } catch {
      return;
    }
  }, [call]);

  useEffect(() => {
    if (!snapshot || !ACTIVE.has(snapshot.status)) return;
    const timer = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try { setSnapshot(await call(`/api/runs/${snapshot.id}`)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "The run could not be refreshed."); }
      finally { polling.current = false; }
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [snapshot, call]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const next = await call(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      setSnapshot(next);
      if (path === "/api/runs") window.sessionStorage.setItem(LIVE_KEY, next.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (snapshot) {
    const active = ACTIVE.has(snapshot.status);
    return (
      <div>
        {error && <p className="error-box" role="alert">{error}</p>}
        <RunView
          snapshot={snapshot}
          busy={busy}
          onRespond={(request: RespondRequest) => act(`/api/runs/${snapshot.id}/respond`, request)}
          extraControls={active ? (
            <div className="player-bar">
              {!snapshot.conditions.stockOutArmed && snapshot.conditions.hoodiesSoldOutAt.length === 0 && <button className="button secondary" disabled={busy} onClick={() => act(`/api/runs/${snapshot.id}/stock-out`)}><TriangleAlert size={20} aria-hidden="true" />Make hoodies sell out at checkout</button>}
              <button className="button danger" disabled={busy} onClick={() => act(`/api/runs/${snapshot.id}/cancel`)}><Square size={20} aria-hidden="true" />Stop the run</button>
            </div>
          ) : (
            <div className="player-bar"><button className="button secondary" onClick={() => { window.sessionStorage.removeItem(LIVE_KEY); setSnapshot(null); }}>Back to live run options</button></div>
          )}
        />
      </div>
    );
  }

  return (
    <form className="live-start" onSubmit={event => { event.preventDefault(); void act("/api/runs", { scenario, consent: true }); }}>
      {config && !config.liveEnabled && <p className="notice">{config.unavailableReason}</p>}
      <fieldset>
        <legend className="aux">Choose what happens in the stores</legend>
        <label className="choice"><input type="radio" name="scenario" checked={scenario === "standard"} onChange={() => setScenario("standard")} /><span><strong>Normal day</strong><span>Prices and stock stay as listed. You can still arm a stock-out during the run.</span></span></label>
        <label className="choice"><input type="radio" name="scenario" checked={scenario === "stock-out"} onChange={() => setScenario("stock-out")} /><span><strong>Sold out at checkout</strong><span>Hoodies sell out at whichever store the agent first tries to pay for them. Watch it re-plan and ask again.</span></span></label>
      </fieldset>
      <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I understand that an OpenAI agent will browse three fictional demo stores in a cloud browser, and that my decisions are stored with the run for up to three hours.</span></label>
      <p className="aux">Live runs take three to eight minutes and are limited to a few per day so the demo stays within its budget. One live run can be active at a time.</p>
      {error && <p className="error-box" role="alert">{error}</p>}
      <div><button className="button primary" type="submit" disabled={busy || !consent || !config?.liveEnabled}>{busy ? "Starting…" : "Start a live run"}</button></div>
    </form>
  );
}

export function ProxyCartApp({ recorded }: { recorded: RecordedRun[] }) {
  const [tab, setTab] = useState<"recorded" | "live">("recorded");
  const [config, setConfig] = useState<LiveConfig | null>(null);
  useEffect(() => {
    fetch("/api/config").then(response => response.json()).then(setConfig).catch(() => setConfig({ liveEnabled: false, model: "", unavailableReason: "Live runs are unavailable right now. The recorded runs are real sessions with the same agent." }));
  }, []);
  return (
    <div>
      <div className="console-tabs" role="tablist" aria-label="Run mode">
        <button role="tab" aria-selected={tab === "recorded"} onClick={() => setTab("recorded")}>Recorded runs</button>
        <button role="tab" aria-selected={tab === "live"} onClick={() => setTab("live")}>Live run</button>
      </div>
      <div role="tabpanel">{tab === "recorded" ? <RecordedPlayer runs={recorded} /> : <LiveRun config={config} />}</div>
    </div>
  );
}
