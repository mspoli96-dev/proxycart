import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreFrame } from "../../../../components/store/store-frame";
import { loadStorePage } from "../../../../lib/server/store-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team sign-in · Harbour Print Studio", robots: { index: false, follow: false } };

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignInPage({ params, searchParams }: Props) {
  const [{ store }, query] = await Promise.all([params, searchParams]);
  if (store !== "harbour") notFound();
  const data = await loadStorePage(store, query.run, "sign-in");
  if (!data) notFound();
  const failed = query.error === "1";
  return (
    <StoreFrame store={data.store} base={data.base} signedIn={data.signedIn} runActive={Boolean(data.runId)}>
      <section className="store-sign-in" aria-labelledby="sign-in-heading">
        <h1 id="sign-in-heading">Team buyer sign-in</h1>
        <p>Sign in to unlock team pricing on hoodies, tumblers and notebooks.</p>
        {data.signedIn && <p className="store-hint success">You are already signed in. <a href={`${data.base}/`}>See team prices</a>.</p>}
        {failed && <p className="checkout-error" role="alert">That email and password did not match a team account.</p>}
        <form method="post" action="/api/stores/harbour/sign-in" className="sign-in-form">
          <input type="hidden" name="base" value={data.base} />
          <label><span>Email</span><input type="email" name="email" autoComplete="username" required /></label>
          <label><span>Password</span><input type="password" name="password" autoComplete="current-password" required /></label>
          <button type="submit">Sign in</button>
        </form>
      </section>
    </StoreFrame>
  );
}
