import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://webytex-proxycart.vercel.app"),
  title: "ProxyCart | An AI shopping agent that can't pay without you, by Webytex",
  description: "Watch an OpenAI agent with its own cloud browser compare three stores, sign in and build the carts, then wait for your approval. The stores refuse payment without a signed mandate.",
  icons: { icon: "/mark.svg" },
  openGraph: { title: "ProxyCart by Webytex", description: "A browser and a budget, but not the power to pay.", type: "website", locale: "en_CA", images: [{ url: "/social-preview.png", width: 1920, height: 1080, alt: "ProxyCart, an AI shopping agent demo by Webytex for Startups." }] },
  twitter: { card: "summary_large_image", title: "ProxyCart by Webytex", images: ["/social-preview.png"] },
};

export const viewport: Viewport = { themeColor: "#f6f7f4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-CA" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>;
}
