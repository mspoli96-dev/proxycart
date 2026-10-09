import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const store = (x, y, name, accent, price, status, statusColor) => `
<g transform="translate(${x} ${y})">
  <rect width="250" height="150" rx="14" fill="#ffffff" stroke="#dfe3e8" stroke-width="2"/>
  <rect width="250" height="10" rx="5" fill="${accent}"/>
  <text x="20" y="44" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#1f2a33">${name}</text>
  <text x="20" y="84" font-family="Arial,sans-serif" font-size="19" fill="#56616b">20 × hoodies</text>
  <text x="20" y="122" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#1f2a33">${price}</text>
  <text x="230" y="122" text-anchor="end" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="${statusColor}">${status}</text>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-labelledby="title description">
<title id="title">ProxyCart by Webytex</title>
<desc id="description">A cloud browser comparing three fictional stores while a locked approval card waits for the buyer before any payment.</desc>
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f8f5"/><stop offset="1" stop-color="#e9eef3"/></linearGradient>
  <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#1d4f8f" opacity=".12"/></pattern>
  <filter id="shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#0e2a4d" flood-opacity=".16"/></filter>
</defs>
<rect width="1920" height="1080" fill="url(#paper)"/>
<rect x="930" y="0" width="990" height="1080" fill="url(#grid)"/>
<path d="M930 0V1080" stroke="#d5dde6" stroke-width="2"/>

<g transform="translate(103 91)">
  <rect width="50" height="50" rx="13" fill="#0e2a4d"/>
  <g fill="none" stroke="#5a9ae8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13h5l4 18h17l4-12H18"/><circle cx="22" cy="37" r="2.4"/><circle cx="34" cy="37" r="2.4"/></g>
  <text x="67" y="36" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#1f2a33" letter-spacing="-1">webytex</text>
  <rect x="268" y="5" width="182" height="41" rx="20" fill="#5a9ae8"/>
  <text x="359" y="33" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#0e2a4d">STARTUPS</text>
</g>

<text x="103" y="268" font-family="Arial,sans-serif" font-size="88" font-weight="700" letter-spacing="-4" fill="#1f2a33">ProxyCart</text>
<text x="102" y="392" font-family="Georgia,serif" font-size="78" fill="#1f2a33" letter-spacing="-3">A browser and a budget.</text>
<text x="102" y="486" font-family="Georgia,serif" font-size="78" font-style="italic" fill="#1d4f8f" letter-spacing="-3">Not the power to pay.</text>
<text x="105" y="572" font-family="Arial,sans-serif" font-size="31" fill="#56616b">An AI agent shops three stores in its own cloud</text>
<text x="105" y="616" font-family="Arial,sans-serif" font-size="31" fill="#56616b">browser. The stores only accept your signed mandate.</text>

<g transform="translate(105 694)" font-family="Arial,sans-serif" font-size="25" font-weight="700">
  <rect width="462" height="58" rx="29" fill="#0e2a4d"/><text x="231" y="38" text-anchor="middle" fill="#ffffff">OpenAI Agents API · computer use</text>
  <rect x="480" width="200" height="58" rx="29" fill="#ffffff" stroke="#c9d3de" stroke-width="2"/><text x="580" y="38" text-anchor="middle" fill="#1f2a33">gpt-6-luna</text>
</g>
<g transform="translate(105 776)" font-family="Arial,sans-serif" font-size="25" font-weight="700">
  <rect width="272" height="58" rx="29" fill="#ffffff" stroke="#c9d3de" stroke-width="2"/><text x="136" y="38" text-anchor="middle" fill="#1f2a33">Built with AI</text>
  <rect x="290" width="390" height="58" rx="29" fill="#ffffff" stroke="#c9d3de" stroke-width="2"/><text x="485" y="38" text-anchor="middle" fill="#1f2a33">Open source · live demo</text>
</g>
<text x="105" y="960" font-family="Arial,sans-serif" font-size="25" fill="#56616b">Fictional stores · test orders · github.com/mspoli96-dev/proxycart</text>

<g filter="url(#shadow)">
  <rect x="1010" y="150" width="820" height="560" rx="22" fill="#ffffff" stroke="#d5dde6" stroke-width="2"/>
  <rect x="1010" y="150" width="820" height="62" rx="22" fill="#0e2a4d"/>
  <rect x="1010" y="190" width="820" height="22" fill="#0e2a4d"/>
  <circle cx="1048" cy="181" r="8" fill="#ff6b6b"/><circle cx="1074" cy="181" r="8" fill="#ffd166"/><circle cx="1100" cy="181" r="8" fill="#5ad19a"/>
  <rect x="1130" y="165" width="560" height="32" rx="16" fill="#163c69"/>
  <text x="1150" y="187" font-family="Arial,sans-serif" font-size="18" fill="#cfe0f5">Cloud browser · 3 stores allowed by you</text>
</g>
${store(1040, 250, "Maple Supply", "#B45309", "CAD 840", "In stock", "#22663f")}
${store(1305, 250, "Northbound", "#0F766E", "CAD 720", "Moved here", "#22663f")}
${store(1570, 250, "Harbour Print", "#9F1239", "CAD 780", "Sold out", "#9b2c2c")}
<g transform="translate(1040 432)" font-family="Arial,sans-serif">
  <rect width="780" height="248" rx="16" fill="#f4f7fb" stroke="#d5dde6" stroke-width="2"/>
  <text x="26" y="48" font-size="24" font-weight="700" fill="#1f2a33">Agent: re-planned after a stock-out</text>
  <text x="26" y="92" font-size="21" fill="#56616b">Hoodies from Northbound, the rest from Harbour Print</text>
  <text x="26" y="128" font-size="21" fill="#56616b">Two orders, two mandates · total CAD 1,155.00</text>
  <rect x="26" y="160" width="300" height="58" rx="12" fill="#22663f"/><text x="176" y="197" text-anchor="middle" font-size="22" font-weight="700" fill="#ffffff">Approve and sign</text>
  <rect x="344" y="160" width="160" height="58" rx="12" fill="#ffffff" stroke="#e2b8b3" stroke-width="2"/><text x="424" y="197" text-anchor="middle" font-size="22" font-weight="700" fill="#9b2c2c">Decline</text>
</g>

<g filter="url(#shadow)" transform="translate(1290 744)">
  <rect width="540" height="200" rx="20" fill="#0e2a4d"/>
  <g transform="translate(36 44)" fill="none" stroke="#5a9ae8" stroke-width="5" stroke-linecap="round"><rect x="0" y="40" width="72" height="62" rx="12"/><path d="M14 40V26a22 22 0 0 1 44 0v14"/></g>
  <text x="140" y="80" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#ffffff">No mandate, no payment</text>
  <text x="140" y="122" font-family="Arial,sans-serif" font-size="22" fill="#c8d7ea">Bound to one store, cart and total.</text>
  <text x="140" y="156" font-family="Arial,sans-serif" font-size="22" fill="#c8d7ea">Single use. Expires in 15 minutes.</text>
</g>
</svg>`;

await writeFile(path.join(root, "public/social-preview.svg"), svg);
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(root, "public/social-preview.png"));
console.log("Cover written to public/social-preview.svg and public/social-preview.png");
