import { idb } from '$lib/storage/idb';

/**
 * The words the papers actually contain.
 *
 * `fetch_paper` used to hand its text to whichever agent asked for it and keep
 * nothing. The only durable record of a paper was the note a model wrote about
 * it — a paraphrase — so nothing in the app could ever check a claim against
 * the source. The critic read the notes and the draft, which makes it one LLM
 * checking another LLM's summary: the pattern the literature is clearest about
 * NOT working (Huang et al., arXiv:2310.01798; Kamoi et al., TACL 2024).
 *
 * With the text kept, one useful class of check stops needing a model at all.
 * "Does this quote appear in the paper" is a string question with a right
 * answer, and it is exactly the question a fabricated attribution fails.
 *
 * IndexedDB, not localStorage and not the virtual filesystem:
 *   · a paper is tens of KB and localStorage caps around 5MB, and `sources`
 *     already lives there
 *   · the VFS is a LangGraph state channel, so every value in it is copied into
 *     every checkpoint — the same reason images are kept out (assets.svelte.ts)
 *
 * Stored UNTRUNCATED, while the model still only sees `maxChars` of it. The
 * verifier is deliberately better informed than the writer: a quote from a
 * section the reader never received still checks out, so a truncated read
 * cannot produce a false accusation.
 *
 * Thread-scoped, for the reason the asset store learned the hard way: two
 * conversations that each fetch the same id must not read each other's text.
 */

const KEY = (thread: string) => `papers:${thread}`;

/** Path → text, for one conversation. */
type Store = Record<string, string>;

let cache: Store | null = null;
let scope = '';

export function setPaperScope(threadId: string) {
	if (scope === threadId) return;
	scope = threadId;
	cache = null;
}

async function load(): Promise<Store> {
	if (cache) return cache;
	cache = (await idb.get<Store>(KEY(scope))) ?? {};
	return cache;
}

export const paperText = {
	async put(arxivId: string, text: string) {
		const store = await load();
		// Longest wins. A second fetch with a smaller `maxChars` must not shrink
		// what the verifier can see.
		if ((store[arxivId] ?? '').length >= text.length) return;
		store[arxivId] = text;
		void idb.set(KEY(scope), store);
	},

	async get(arxivId: string): Promise<string | undefined> {
		return (await load())[arxivId];
	},

	/** Which papers this conversation holds text for. */
	async ids(): Promise<string[]> {
		return Object.keys(await load());
	},

	/** Forget one conversation's texts, when its thread is deleted. */
	async drop(threadId: string) {
		await idb.del(KEY(threadId));
		if (scope === threadId) cache = null;
	}
};

/**
 * Squashed to alphanumerics for comparison.
 *
 * PDF extraction encodes inter-word spaces as position and drops them
 * unpredictably — "Can Language Models" comes out "CanLanguageModels" often
 * enough that any whitespace-sensitive comparison rejects real quotes. Case,
 * punctuation and hyphenation are lost for the same reason: a quote retyped
 * with a straight apostrophe where the paper had a curly one is still the
 * paper's sentence.
 */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Enough of a quote to be evidence.
 *
 * Short strings match everything — "the model" is in every paper in the
 * corpus — so a quote below this length is refused as unverifiable rather than
 * waved through. Roughly eight or ten ordinary words.
 */
export const MIN_QUOTE_CHARS = 40;

export type QuoteCheck =
	| { status: 'found'; context: string }
	| { status: 'absent' }
	| { status: 'too-short' }
	| { status: 'no-text' };

/**
 * Is this quote really in that paper?
 *
 * On success it returns the surrounding text rather than just `true`, because
 * the interesting failure is not a wholly invented sentence — it is a real
 * sentence used to support something it does not say. Handing back the context
 * lets the caller see the quote in situ, and lets the panel show it.
 */
export function checkQuote(quote: string, paper: string | undefined): QuoteCheck {
	const needle = squash(quote);
	if (needle.length < MIN_QUOTE_CHARS) return { status: 'too-short' };
	if (!paper) return { status: 'no-text' };

	// Index map from squashed positions back into the original text, so the
	// context can be quoted as the paper actually writes it.
	const map: number[] = [];
	let hay = '';
	for (let i = 0; i < paper.length; i++) {
		const c = paper[i].toLowerCase();
		if (c >= 'a' && c <= 'z') {
			hay += c;
			map.push(i);
		} else if (c >= '0' && c <= '9') {
			hay += c;
			map.push(i);
		}
	}

	const at = hay.indexOf(needle);
	if (at === -1) return { status: 'absent' };

	const from = map[at];
	const to = map[Math.min(at + needle.length, map.length - 1)];
	const PAD = 120;
	const context = paper
		.slice(Math.max(0, from - PAD), Math.min(paper.length, to + PAD))
		.replace(/\s+/g, ' ')
		.trim();
	return { status: 'found', context };
}
