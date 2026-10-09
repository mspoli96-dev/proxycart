"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCad } from "../../lib/catalog";
import type { CartLine } from "../../lib/pricing";
import type { ProductView, StoreView } from "../../lib/server/store-page";
import { cartKey, readCart, writeCart } from "./cart-storage";

function shipping(store: StoreView, subtotal: number): number {
  if (subtotal <= 0) return 0;
  return store.freeShippingFromCents !== null && subtotal >= store.freeShippingFromCents ? 0 : store.shippingCents;
}

export function StoreCatalogue({ store, products, base, runId, signedIn }: { store: StoreView; products: ProductView[]; base: string; runId: string | null; signedIn: boolean }) {
  const key = cartKey(store.id, runId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setCart(readCart(key)), [key]);

  const save = (next: CartLine[]) => {
    setCart(next);
    writeCart(key, next);
  };

  const setQuantity = (product: ProductView) => {
    const quantity = Number(drafts[product.sku]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      setNotice(`Enter a whole number from 1 to 500 for ${product.name}.`);
      return;
    }
    if (quantity > product.stock) {
      setNotice(product.stock === 0 ? `${product.name} is sold out.` : `Only ${product.stock} ${product.name} left in stock.`);
      return;
    }
    save([...cart.filter(line => line.sku !== product.sku), { sku: product.sku, quantity }].sort((a, b) => a.sku.localeCompare(b.sku)));
    setNotice(`Cart updated: ${quantity} × ${product.name}.`);
  };

  const lines = useMemo(() => cart.map(line => ({ line, product: products.find(product => product.sku === line.sku) })).filter((entry): entry is { line: CartLine; product: ProductView } => Boolean(entry.product)), [cart, products]);
  const subtotal = lines.reduce((sum, { line, product }) => sum + line.quantity * product.unitCents, 0);
  const shippingCents = shipping(store, subtotal);

  return (
    <div className="store-layout">
      <section aria-labelledby="catalogue-heading">
        <div className="store-section-heading">
          <h1 id="catalogue-heading">{store.name} catalogue</h1>
          {store.signInForTeamPricing && !signedIn && <p className="store-hint">Team pricing is available after you <a href={`${base}/sign-in`}>sign in</a>. List prices are shown below.</p>}
          {store.signInForTeamPricing && signedIn && <p className="store-hint success">Signed in as a team buyer. Team prices are applied.</p>}
        </div>
        <ul className="product-grid">
          {products.map(product => (
            <li key={product.sku} className="product-card">
              <div className="product-top">
                <h2>{product.name}</h2>
                <span className="sku">SKU {product.sku}</span>
              </div>
              <p className="product-detail">{product.detail}</p>
              <p className="product-price">
                <strong>{formatCad(product.unitCents)}</strong> each
                {product.listCents !== null && <span className="list-price">List {formatCad(product.listCents)}</span>}
                {store.signInForTeamPricing && !signedIn && <span className="list-label">List price</span>}
              </p>
              <p className={`product-stock ${product.stock === 0 ? "sold-out" : ""}`}>{product.stock === 0 ? "Sold out" : `${product.stock} in stock`} · Arrives in {product.arrivesInBusinessDays} business days</p>
              <div className="product-actions">
                <label>
                  <span>Quantity</span>
                  <input type="number" inputMode="numeric" min={1} max={500} value={drafts[product.sku] ?? ""} onChange={event => setDrafts({ ...drafts, [product.sku]: event.target.value })} disabled={product.stock === 0} aria-label={`Quantity of ${product.name}`} />
                </label>
                <button type="button" onClick={() => setQuantity(product)} disabled={product.stock === 0}>{cart.some(line => line.sku === product.sku) ? "Update cart" : "Add to cart"}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="store-cart" aria-labelledby="cart-heading">
        <h2 id="cart-heading">Cart</h2>
        {notice && <p className="store-notice-inline" role="status">{notice}</p>}
        {lines.length === 0 ? <p>Your cart is empty.</p> : (
          <ul className="cart-lines">
            {lines.map(({ line, product }) => (
              <li key={line.sku}>
                <span>{line.quantity} × {product.name} <small>({product.sku})</small></span>
                <span>{formatCad(line.quantity * product.unitCents)}</span>
                <button type="button" className="link-button" onClick={() => save(cart.filter(entry => entry.sku !== line.sku))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <dl className="cart-totals">
          <div><dt>Subtotal</dt><dd>{formatCad(subtotal)}</dd></div>
          <div><dt>Shipping</dt><dd>{subtotal === 0 ? "—" : shippingCents === 0 ? "Free" : formatCad(shippingCents)}</dd></div>
          <div className="grand"><dt>Total</dt><dd>{formatCad(subtotal + shippingCents)}</dd></div>
        </dl>
        <p className="store-hint">{store.freeShippingFromCents !== null ? `Shipping ${formatCad(store.shippingCents)}, free from ${formatCad(store.freeShippingFromCents)}.` : `Flat shipping ${formatCad(store.shippingCents)} per order.`}</p>
        <a className={`checkout-link ${lines.length === 0 ? "disabled" : ""}`} href={`${base}/checkout`} aria-disabled={lines.length === 0}>Go to checkout</a>
      </aside>
    </div>
  );
}
