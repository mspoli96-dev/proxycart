import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreCheckout } from "../../../../components/store/store-checkout";
import { StoreFrame } from "../../../../components/store/store-frame";
import { isStoreId, STORES } from "../../../../lib/catalog";
import { loadStorePage } from "../../../../lib/server/store-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await params;
  return { title: isStoreId(store) ? `Checkout · ${STORES[store].name}` : "Checkout", robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ store }, query] = await Promise.all([params, searchParams]);
  const data = await loadStorePage(store, query.run, "checkout");
  if (!data) notFound();
  return (
    <StoreFrame store={data.store} base={data.base} signedIn={data.signedIn} runActive={Boolean(data.runId)}>
      <StoreCheckout store={data.store} base={data.base} runId={data.runId} />
    </StoreFrame>
  );
}
