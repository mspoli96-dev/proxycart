import { initBotId } from "botid/client/core";

if (!window.location.hostname.startsWith("proxycart-")) initBotId({ protect: [{ path: "/api/runs", method: "POST" }] });
