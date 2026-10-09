import { ArrowUpRight, CodeXml, Globe, KeyRound, ShieldCheck, ShoppingCart, Sparkles } from "lucide-react";
import { ProxyCartApp } from "../components/proxycart-app";
import { formatCad, KIND_LABELS, PRODUCT_KINDS, STORE_IDS, STORES } from "../lib/catalog";
import type { RecordedRun } from "../lib/contracts";
import { storeUrl } from "../lib/hosts";
import { MISSION } from "../lib/mission";
import recordedRuns from "../data/recorded-runs.json";

const CONTACT = "https://startups.webytex.com/?utm_source=proxycart&utm_medium=demo&utm_campaign=open-source#quick-contact";
const SOURCE = "https://github.com/mspoli96-dev/proxycart";

export default function Home() {
  const recorded = recordedRuns as unknown as RecordedRun[];
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ProxyCart home">
          <span className="brand-mark"><ShoppingCart size={26} aria-hidden="true" /></span>
          <span>ProxyCart<span className="byline">An open-source project by Webytex</span></span>
        </a>
        <div className="header-links">
          <span className="vertical-label">Startups</span>
          <span className="ai-label"><Sparkles size={18} aria-hidden="true" />Built with AI</span>
          <a className="github-link" href={SOURCE} target="_blank" rel="noreferrer"><CodeXml size={21} aria-hidden="true" />Source code<ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div>
            <span className="eyebrow">Agentic commerce demo</span>
            <h1>A browser and a budget. <em>Not the power to pay.</em></h1>
            <p className="hero-lead">ProxyCart sends an OpenAI agent with its own cloud browser into three fictional stores. It compares prices, signs in for team pricing and builds the carts, then stops and asks you. The stores refuse payment unless you issued a signed mandate for that exact cart.</p>
            <div className="hero-actions">
              <a className="button primary" href="#console">Watch the agent shop</a>
              <a className="button secondary" href="#how">How the guardrail works</a>
            </div>
          </div>
          <ul className="fact-list">
            <li className="fact"><span className="fact-icon"><Globe size={24} aria-hidden="true" /></span><div><h3>You approve every store</h3><p>The cloud browser asks before it opens each new site, and its network only reaches the three demo stores.</p></div></li>
            <li className="fact"><span className="fact-icon"><KeyRound size={24} aria-hidden="true" /></span><div><h3>It signs in without seeing the password</h3><p>The demo account goes straight into the browser form. The model only learns that sign-in happened.</p></div></li>
            <li className="fact"><span className="fact-icon"><ShieldCheck size={24} aria-hidden="true" /></span><div><h3>The store enforces your approval</h3><p>Each payment needs a single-use mandate bound to one store, one cart and one amount. A prompt cannot forge it.</p></div></li>
          </ul>
        </section>

        <section className="section" aria-labelledby="mission-heading">
          <div className="section-heading">
            <h2 id="mission-heading">The <em>mission</em></h2>
            <p>The same task every time, so runs can be compared. Without team pricing at Harbour, no basket fits the budget.</p>
          </div>
          <div className="mission">
            <div className="panel">
              <h3>{MISSION.title}</h3>
              <ul className="mission-list">
                {PRODUCT_KINDS.map(kind => <li key={kind}><strong>{MISSION.quantities[kind]}</strong>{KIND_LABELS[kind]}</li>)}
              </ul>
              <dl className="mission-terms">
                <div><dt>Budget, shipping included</dt><dd>{formatCad(MISSION.budgetCents)}</dd></div>
                <div><dt>Deadline</dt><dd>Within {MISSION.deadlineBusinessDays} business days</dd></div>
                <div><dt>Payment</dt><dd>Only with your mandate</dd></div>
              </dl>
            </div>
            <div className="panel">
              <h3>Three fictional stores, three origins</h3>
              <ul className="store-list">
                {STORE_IDS.map(storeId => (
                  <li key={storeId}>
                    <span><span className="store-dot" style={{ background: STORES[storeId].accent }} aria-hidden="true" />{STORES[storeId].name}<span className="byline">{STORES[storeId].tagline}</span></span>
                    <a href={storeUrl(storeId)} target="_blank" rel="noreferrer">Browse<ArrowUpRight size={16} aria-hidden="true" /></a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="section" id="console" aria-labelledby="console-heading">
          <div className="section-heading">
            <h2 id="console-heading">Watch it <em>shop</em></h2>
            <p>Recorded runs replay real sessions with the same agent and stores. A live run lets you allow each store, sign the agent in, trigger a stock-out and approve or decline the purchase yourself.</p>
          </div>
          <ProxyCartApp recorded={recorded} />
        </section>

        <section className="section" id="how" aria-labelledby="how-heading">
          <div className="section-heading">
            <h2 id="how-heading">How the <em>guardrail</em> works</h2>
            <p>OpenAI's guidance is clear: approving a site does not confirm each action, so purchases must be blocked by the resource itself. ProxyCart puts the final check in the store, not in the prompt.</p>
          </div>
          <div className="how-grid">
            <div className="panel"><span className="step-number">1</span><h3>A cloud browser on a short leash</h3><p>The Agents API runs computer use in an OpenAI-hosted browser. Its network is restricted to the three store hosts, and each new origin needs your approval.</p></div>
            <div className="panel"><span className="step-number">2</span><h3>The agent proposes, code checks</h3><p>The agent calls a request_purchase_approval function with its carts. ProxyCart recomputes every price, stock level, deadline and total from the catalogues before you see it.</p></div>
            <div className="panel"><span className="step-number">3</span><h3>You approve one exact plan</h3><p>Approval issues one HMAC-signed mandate per store. Each code is bound to the run, the store, the cart contents and the total, and expires in 15 minutes.</p></div>
            <div className="panel"><span className="step-number">4</span><h3>The store verifies and logs</h3><p>At checkout the store server re-prices the cart, verifies the signature and marks the mandate as used. A changed cart, another store or a reused code is refused.</p></div>
          </div>
        </section>

        <section className="section" aria-labelledby="limits-heading">
          <div className="section-heading"><h2 id="limits-heading">What this demo <em>is and isn't</em></h2></div>
          <div className="limits">
            <div className="panel">
              <h3>What is real</h3>
              <ul>
                <li>OpenAI's Agents API with computer use and gpt-6-luna, browsing in an OpenAI-hosted cloud browser.</li>
                <li>Real approval requests for each site and for sign-in, answered by you or, in recordings, by the person running them.</li>
                <li>Server-side mandate checks in each store, with an independent log of what the stores saw.</li>
              </ul>
            </div>
            <div className="panel">
              <h3>What is simulated</h3>
              <ul>
                <li>The stores, products, prices and delivery times are fictional. Orders are test orders and no money moves.</li>
                <li>Agents make mistakes. The checks catch arithmetic and catalogue errors; they do not make the agent's choices right.</li>
                <li>This is a pattern for agent-safe checkout, not a payments integration or a compliance claim.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="startup-cta">
          <div>
            <span className="vertical-label">Webytex for Startups</span>
            <h2>Will agents use your product?</h2>
            <p>We build AI features and agent-ready flows for startups, with the guardrails in the system rather than in a prompt. Bring your use case and we'll scope a first version together.</p>
          </div>
          <a className="button" href={CONTACT} target="_blank" rel="noreferrer">Talk to Webytex<ArrowUpRight size={22} aria-hidden="true" /></a>
        </section>
      </main>

      <footer className="site-footer">
        <a href="https://webytex.com" target="_blank" rel="noreferrer">webytex</a>
        <p>MIT licensed · Fictional stores, test orders only.<br />An AI-assisted build, with human architecture and review.</p>
        <a href={SOURCE} target="_blank" rel="noreferrer">View source<ArrowUpRight size={18} aria-hidden="true" /></a>
      </footer>
    </div>
  );
}
