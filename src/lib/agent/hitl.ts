/**
 * Human-in-the-loop types, mirrored from langchain's hitl middleware.
 *
 * Re-declared rather than imported because they live in a deep internal path
 * (`langchain/dist/agents/middleware/hitl`) that is not part of the public
 * entry — importing it would couple the UI to a file path that can move.
 * Verified field-for-field against that d.ts.
 */

export interface ActionRequest {
	name: string;
	args: Record<string, unknown>;
	description?: string;
}

/** Exactly three. There is no `respond` — verified across langchain 1.0–1.5. */
export type DecisionType = 'approve' | 'edit' | 'reject';

export interface ReviewConfig {
	actionName: string;
	allowedDecisions: DecisionType[];
	argsSchema?: Record<string, unknown>;
}

export interface HITLRequest {
	actionRequests: ActionRequest[];
	reviewConfigs: ReviewConfig[];
}

export type Decision =
	| { type: 'approve' }
	| { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
	| { type: 'reject'; message?: string };

export interface HITLResponse {
	decisions: Decision[];
}

/** A paused run, as the UI needs it. */
export interface Pending {
	request: HITLRequest;
	/** The interrupt id LangGraph assigned, for the X-ray. */
	id?: string;
}

export function reviewFor(req: HITLRequest, actionName: string): ReviewConfig | undefined {
	return req.reviewConfigs.find((r) => r.actionName === actionName);
}

/**
 * Which tools pause by default.
 *
 * `generate_image` and not `fetch_paper`, for two reasons — one about product,
 * one about physics.
 *
 * Product: image generation costs real money and produces something you may not
 * want. Fetching a paper is a read. Approving reads trains people to click
 * Approve without looking, which is worse than not asking.
 *
 * Physics: the agent dispatches paper-readers **in parallel** — four subagents,
 * four simultaneous `interrupt()` calls. The browser AsyncLocalStorage shim has
 * one store, not one per async context, so genuinely concurrent interrupts
 * clobber each other and throw "outside the context of a graph". Image
 * generation happens one at a time inside image-smith, so it is safe to gate.
 *
 * Gating a tool that runs inside parallel subagents is therefore not supported.
 * The settings panel says so next to the toggles.
 */
export const DEFAULT_INTERRUPT_ON: Record<string, boolean> = {
	generate_image: true
};

/** Tools that can run concurrently in subagents, where gating is unsafe. */
export const PARALLEL_UNSAFE = new Set(['fetch_paper', 'search_papers']);
