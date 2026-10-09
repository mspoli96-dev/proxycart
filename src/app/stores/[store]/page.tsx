import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreCatalogue } from "../../../components/store/store-catalogue";
import { StoreFrame } from "../../../components/store/store-frame";
import { isStoreId, STORES } from "../../../lib/catalog";
import { loadStorePage } from "../../../lib/server/store-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await params;
  return { title: isStoreId(store) ? `${STORES[store].name} · ProxyCart demo store` : "ProxyCart demo store", robots: { index: false, follow: false } };
}

export default async function StorePage({ params, searchParams }: Props) {
  const [{ store }, query] = await Promise.all([params, searchParams]);
  const data = await loadStorePage(store, query.run, "catalogue");
  if (!data) notFound();
  return (
    <StoreFrame store={data.store} base={data.base} signedIn={data.signedIn} runActive={Boolean(data.runId)}>
      <StoreCatalogue store={data.store} products={data.products} base={data.base} runId={data.runId} signedIn={data.signedIn} />
    </StoreFrame>
  );
}
