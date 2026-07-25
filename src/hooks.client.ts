import { installBrowserAsyncContext } from '$lib/agent/async-context';

// Must run before any graph is compiled. LangGraph's interrupt() reads the run
// config from an AsyncLocalStorage singleton that browsers stub out; without
// this the very first interrupt throws "Called interrupt() outside the context
// of a graph". initializeGlobalInstance is no-clobber, so this is safe to call
// early and often.
installBrowserAsyncContext();
