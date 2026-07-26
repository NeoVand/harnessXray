import { createMiddleware } from 'langchain';
import { AIMessage, isAIMessage } from '@langchain/core/messages';

/**
 * One approval-gated call per turn — enforced, not hoped for.
 *
 * The browser ALS shim has a single store, so two interrupt() consumptions in
 * the same super-step clobber each other and kill the run ("Called interrupt()
 * outside the context of a graph"). The old defence was an assumption — that
 * image-smith would only ever generate one image at a time — and a model being
 * efficient broke it by requesting both images as parallel tool calls in one
 * turn.
 *
 * This middleware makes the constraint structural. After the model speaks and
 * BEFORE the HITL middleware sees the message (appended middleware runs first
 * on the way out — the onion), a turn carrying several gated calls is rewritten
 * to keep the first gated call plus every ungated one. The dropped calls leave
 * no trace: same message id, so the reducer replaces rather than appends, and
 * as far as the model can tell it simply didn't make the extra request — the
 * world-state block and the unfinished todo lead it to ask again next turn,
 * one gate at a time.
 */

/** Tools that can pause for approval and therefore must not run in parallel. */
const GATED = new Set(['generate_image', 'present_outline']);

export const oneGatePerTurnMiddleware = createMiddleware({
	name: 'OneGatePerTurnMiddleware',
	afterModel: (state) => {
		const last = state.messages.at(-1);
		if (!last || !isAIMessage(last)) return;
		const calls = last.tool_calls ?? [];
		const gated = calls.filter((c) => GATED.has(c.name));
		if (gated.length < 2) return;

		const keep = gated[0];
		const patched = new AIMessage({
			id: last.id,
			content: last.content,
			tool_calls: calls.filter((c) => !GATED.has(c.name) || c === keep),
			additional_kwargs: last.additional_kwargs,
			response_metadata: last.response_metadata
		});
		return { messages: [patched] };
	}
});
