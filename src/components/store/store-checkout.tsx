"use client";

import { useEffect, useState } from "react";
import { formatCad } from "../../lib/catalog";
import type { CartLine, PricedCart } from "../../lib/pricing";
import type { StoreView } from "../../lib/server/store-page";
import { cartKey, readCart, writeCart } from "./cart-storage";

type Result = { ok: boolean; message: string; orderNumber?: string; mandate?: string };

export function StoreCheckout({ store, base, runId }: { store: StoreView; base: string; runId: string | null }) {
  const key = cartKey(store.id, runId);
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [quote, setQuote] = useState<PricedCart | null>(null);
  const [mandate, setMandate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = readCart(key);
    setLines(current);
    if (current.length === 0) return;
    fetch(`/api/stores/${store.id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: current }) })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "The cart could not be priced.");
        setQuote(body.cart as PricedCart);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "The cart could not be priced."));
  }, [key, store.id]);

  const placeOrder = async () => {
    if (!lines || lines.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/stores/${store.id}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, mandate }) });
      const body = await response.json();
      if (body.cart) setQuote(body.cart as PricedCart);
      const next: Result = { ok: Boolean(body.ok), message: body.message ?? body.error ?? "The order could not be placed.", orderNumber: body.orderNumber, mandate: body.mandate };
      setResult(next);
      if (next.ok) writeCart(key, []);
    } catch {
      setResult({ ok: false, message: "The order could not be placed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (lines === null) return <p>Loading your cart…</p>;
  if (lines.length === 0 && !result?.ok) return <section className="store-checkout"><h1>Checkout</h1><p>Your cart is empty. <a href={`${base}/`}>Return to the catalogue</a>.</p></section>;

  return (
    <section className="store-checkout" aria-labelledby="checkout-heading">
      <h1 id="checkout-heading">Checkout</h1>
      {error && <p className="checkout-error" role="alert">{error}</p>}
      {quote && (
        <div className="checkout-summary">
          <h2>Order summary</h2>
          <ul className="cart-lines">
            {quote.lines.map(line => (
              <li key={line.sku}><span>{line.quantity} × {line.name} <small>({line.sku})</small></span><span>{formatCad(line.lineCents)}</span></li>
            ))}
          </ul>
          <dl className="cart-totals">
            <div><dt>Subtotal</dt><dd>{formatCad(quote.subtotalCents)}</dd></div>
            <div><dt>Shipping</dt><dd>{quote.shippingCents === 0 ? "Free" : formatCad(quote.shippingCents)}</dd></div>
            <div className="grand"><dt>Order total</dt><dd>{formatCad(quote.totalCents)}</dd></div>
          </dl>
          {quote.issues.length > 0 && <ul className="checkout-issues" role="alert">{quote.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        </div>
      )}
      {!result?.ok && (
        <form className="mandate-form" onSubmit={event => { event.preventDefault(); void placeOrder(); }}>
          <h2>Payment authorization</h2>
          <p>{store.name} accepts payment only with a ProxyCart mandate code. The buyer issues one code per store after approving the exact cart and total.</p>
          <label>
            <span>Mandate code</span>
            <input name="mandate" value={mandate} onChange={event => setMandate(event.target.value)} placeholder="PXC-XXXX-XXXX" autoComplete="off" spellCheck={false} maxLength={40} />
          </label>
          <button type="submit" disabled={busy || !runId}>{busy ? "Placing order…" : "Place test order"}</button>
          {!runId && <p className="store-hint">Checkout is disabled outside a ProxyCart run.</p>}
        </form>
      )}
      {result && (
        <div className={`checkout-result ${result.ok ? "ok" : "blocked"}`} role="status">
          <h2>{result.ok ? "Test order placed" : "Order not placed"}</h2>
          <p>{result.message}</p>
          {result.ok && result.mandate && <p>Mandate verified by the store: {result.mandate}</p>}
        </div>
      )}
    </section>
  );
}
