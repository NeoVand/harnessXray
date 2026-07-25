// The whole lab is a static SPA. `prerender` is the actual fix for
// adapter-static's strict mode (verified: necessary and sufficient).
export const prerender = true;

// `ssr = false` is a deliberate choice, not part of the fix. Two reasons:
//  1. @hugeicons/svelte injects its SVG paths in onMount, so server-rendered
//     markup would ship empty icons until hydration.
//  2. The agent, the AsyncLocalStorage shim, IndexedDB and pdf.js are all
//     client-only. Rendering them on the server would only produce a flash.
export const ssr = false;
