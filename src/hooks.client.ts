import { installBrowserAsyncContext } from '$lib/agent/async-context';
import { assets } from '$lib/storage/assets.svelte';
import { session } from '$lib/agent/session.svelte';

// Must run before any graph is compiled. LangGraph's interrupt() reads the run
// config from an AsyncLocalStorage singleton that browsers stub out; without
// this the very first interrupt throws "Called interrupt() outside the context
// of a graph". initializeGlobalInstance is no-clobber, so this is safe to call
// early and often.
installBrowserAsyncContext();

// Figures are resolved synchronously while rendering markdown, so the asset
// index has to be in memory before the first paint that might reference one.
void assets.warm();

// Checkpoint writes are debounced, so the last fraction of a second of a session
// is normally never written. That matters more than it sounds now that the UI
// stores checkpoint ids and offers to rewind to them: an id whose checkpoint
// never reached disk resolves to nothing, and LangGraph answers a missing
// checkpoint by silently starting an empty branch rather than by failing. So the
// page going away is a flush point.
//
// `pagehide` rather than `beforeunload`: the latter does not fire on mobile or
// on bfcache navigations, which is exactly when a tab is most likely to vanish.
//
// The one navigation this must NOT save on is the reload that ends a factory
// reset — flushing there wrote the freshly erased conversation straight back,
// which is why every writer under flushState checks `resetInProgress`.
if (typeof window !== 'undefined') {
	const flush = () => void session.flushState();
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
}
