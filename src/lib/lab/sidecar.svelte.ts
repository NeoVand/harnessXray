import { SvelteMap } from 'svelte/reactivity';
import { keys } from '$lib/state/keys.svelte';
import { replay } from '$lib/xray/replay.svelte';
import { KIND_HELP, type XrayEvent } from '$lib/xray/events';
import { detailOf } from '$lib/xray/format';

/**
 * The lab's own model calls — titles and explanations.
 *
 * These are the app talking, not the agent, and that distinction is enforced
 * structurally: nothing here goes through the instrumented fetch, nothing here
 * emits to the event bus, and nothing here touches the graph. The X-ray shows
 * the *specimen's* traffic; if the microscope's own light showed up on the
 * slide, every count on the Run panel would be a lie. The price of that honesty
 * is that sidecar spend is invisible in-app — it is a few hundred tokens of
 * `luna` per call, and it is documented here and in the README rather than
 * pretended away.
 *
 * Always the cheapest model, regardless of what the agent runs on. A title is
 * not worth reasoning about.
 */

const SIDECAR_MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function complete(prompt: string, maxTokens: number): Promise<string> {
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${keys.require()}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: SIDECAR_MODEL,
			// This family reasons by default; a title or a two-line explanation is
			// exactly the case the provider added 'none' for.
			reasoning_effort: 'none',
			max_completion_tokens: maxTokens,
			messages: [{ role: 'user', content: prompt }]
		})
	});
	if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`);
	const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
	return json.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * The explain-mode tutor speaks through this same pipe. Exporting the seam —
 * rather than a second fetch elsewhere — keeps exactly one place lab traffic
 * can originate, which is what makes "the microscope's light never lands on
 * the slide" checkable.
 */
export { complete as labComplete };

/** Can the sidecar run at all right now? Replay has no network to run on. */
export function sidecarReady(): boolean {
	return keys.present && !replay.active;
}

/**
 * A 3–6 word name for a conversation.
 *
 * Returns '' rather than throwing on anything — a chat that keeps its
 * fallback title is not a failure worth surfacing.
 */
export async function generateTitle(userText: string, assistantText: string): Promise<string> {
	if (!sidecarReady()) return '';
	try {
		const raw = await complete(
			'Name this conversation in 3 to 6 plain words. No quotes, no trailing period, ' +
				'no word "chat". Just the name.\n\n' +
				`They asked: ${userText.slice(0, 600)}\n\nThe agent replied: ${assistantText.slice(0, 600)}`,
			400
		);
		return raw
			.replace(/["'.«»]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 60);
	} catch {
		return '';
	}
}

export interface Explanation {
	status: 'thinking' | 'done' | 'error';
	text: string;
}

/**
 * One explanation per event, cached for the life of the page.
 *
 * Keyed by event id, so re-selecting a row costs nothing and the answer stays
 * put while a student compares it against the bytes underneath it.
 */
export const explanations = new SvelteMap<string, Explanation>();

const EXPLAIN_PROMPT = `You are the tutor built into harnessXray, a lab that runs a real Deep Agents harness (LangChain/LangGraph) in the browser and shows every byte of what it does. A student clicked an event in the run timeline and asked what it is.

The app's own one-line definition of this event kind: %HELP%

The event's actual payload (may be truncated):
%DETAIL%

Explain, in 3 to 5 short sentences, what THIS specific event is and why it happened at this point in the run. Refer to the actual values in the payload — names, paths, counts — not placeholders. Plain language, no headings, no bullet points, no flattery. If the payload shows something worth noticing (a cost, a cache hit, an unusually large result), say so.`;

export function explain(event: XrayEvent): void {
	if (explanations.get(event.id)?.status === 'done') return;
	if (!sidecarReady()) {
		explanations.set(event.id, {
			status: 'error',
			text: 'The explainer needs an API key (it makes one small luna call).'
		});
		return;
	}

	explanations.set(event.id, { status: 'thinking', text: '' });

	// Tool results can be tens of thousands of characters; the explainer needs
	// the shape and the edges of the value, not the whole paper.
	const detail = JSON.stringify(detailOf(event), null, 1).slice(0, 4000);
	const prompt = EXPLAIN_PROMPT.replace('%HELP%', KIND_HELP[event.kind]).replace(
		'%DETAIL%',
		detail
	);

	void complete(prompt, 1200)
		.then((text) => {
			explanations.set(
				event.id,
				text
					? { status: 'done', text }
					: { status: 'error', text: 'The model returned nothing. Try again.' }
			);
		})
		.catch((e) => {
			explanations.set(event.id, {
				status: 'error',
				text: e instanceof Error ? e.message : String(e)
			});
		});
}
