import type { ReactNode } from "react";
import type { StoreView } from "../../lib/server/store-page";

export function StoreFrame({ store, base, signedIn, runActive, children }: { store: StoreView; base: string; signedIn: boolean; runActive: boolean; children: ReactNode }) {
  return (
    <div className="store-shell" style={{ ["--store-accent" as string]: store.accent }}>
      <div className="store-notice" role="note">Fictional demo store for ProxyCart by Webytex. Test orders only. No real products or payments.</div>
      <header className="store-header">
        <a className="store-brand" href={`${base}/`}>
          <span className="store-logo" aria-hidden="true">{store.name.charAt(0)}</span>
          <span><strong>{store.name}</strong><span className="store-tagline">{store.tagline} · {store.city}</span></span>
        </a>
        <nav className="store-nav" aria-label={`${store.name} navigation`}>
          <a href={`${base}/`}>Catalogue</a>
          <a href={`${base}/checkout`}>Checkout</a>
          {store.signInForTeamPricing && (signedIn ? <span className="store-signed-in">Team buyer signed in</span> : <a href={`${base}/sign-in`}>Sign in</a>)}
        </nav>
      </header>
      {!runActive && <p className="store-banner">You are browsing without an active ProxyCart run. You can look around, but checkout is disabled.</p>}
      <main className="store-main">{children}</main>
      <footer className="store-footer">Prices in Canadian dollars. Delivery estimates are business days from today.</footer>
    </div>
  );
}
