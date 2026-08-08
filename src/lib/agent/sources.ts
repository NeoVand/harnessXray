import { browser } from '$app/environment';
import { arxivYear, surnameOf, type PaperHit } from './retrieval';

/**
 * The source registry — what makes a citation checkable.
 *
 * Every paper that enters the run through `search_papers` or `fetch_paper` is
 * recorded here, with whether its full text was actually read. The `cite` tool
 * then refuses two things a model will otherwise happily do: cite a paper that
 * never appeared in this run at all (a hallucinated reference), and cite a
 * paper it only ever saw as a search snippet (an abstract dressed up as a
 * reading). Subagents share the registry for free — module state is one per
 * tab — so the parent, three paper-readers and the report-writer all mean the
 * same paper when they say [S3].
 *
 * Deliberately module state and not a graph channel: tools are plain functions
 * with no handle on graph state, and threading one through would mean changing
 * the harness — the one thing this app never does. The cost of that choice is
 * that the registry is not checkpointed, so a rewind does not roll it back; it
 * is a strictly-grows record of what this thread has seen, which for its one
 * job — refusing citations of the never-seen — errs in the honest direction.
 */

export interface Source {
	/** Stable 1-based number, in order of first appearance: [S3]. */
	n: number;
	arxivId: string;
	title: string;
	authors: string[];
	year: number | null;
	citations: number;
	/** True once the full text has actually been fetched and read. */
	fetched: boolean;
	/** How many times `cite` has been called for it. */
	cited: number;
}

const KEY = (thread: string) => `hx:sources:${thread}`;

class SourceRegistry {
	#byId = new Map<string, Source>();
	#thread = '';

	/** Point the registry at a conversation; loads what that thread had. */
	setScope(threadId: string) {
		if (this.#thread === threadId) return;
		this.#thread = threadId;
		this.#byId.clear();
		if (!browser) return;
		try {
			const stored = JSON.parse(localStorage.getItem(KEY(threadId)) ?? '[]') as Source[];
			for (const s of stored) this.#byId.set(s.arxivId, s);
		} catch {
			/* an unreadable registry is an empty one */
		}
	}

	#save() {
		if (!browser || !this.#thread) return;
		localStorage.setItem(KEY(this.#thread), JSON.stringify([...this.#byId.values()]));
	}

	/** Forget one conversation's registry, when its thread is deleted. */
	drop(threadId: string) {
		if (browser) localStorage.removeItem(KEY(threadId));
		if (this.#thread === threadId) this.#byId.clear();
	}

	/** Record search hits. Idempotent; never downgrades `fetched`. */
	registerHits(hits: PaperHit[]) {
		for (const h of hits) {
			if (!h.arxivId) continue;
			const prior = this.#byId.get(h.arxivId);
			if (prior) {
				// A later search can carry better metadata than the first one did.
				prior.title = prior.title || h.title;
				prior.citations = Math.max(prior.citations, h.citations);
				continue;
			}
			this.#byId.set(h.arxivId, {
				n: this.#byId.size + 1,
				arxivId: h.arxivId,
				title: h.title,
				authors: h.authors,
				year: h.year,
				citations: h.citations,
				fetched: false,
				cited: 0
			});
		}
		this.#save();
	}

	/**
	 * Record that a paper's full text was actually read, and whatever the read
	 * turned up about it.
	 *
	 * `meta` matters more than it looks. A model knows SWE-bench is 2310.06770
	 * and dispatches a reader straight at the id, without searching first — so
	 * the entry was created here, with an empty title and no authors, and the
	 * reference list came out `Unknown authors (n.d.). (title not recorded).`
	 * for every famous paper in the run. The fetch had the header in its hands
	 * the whole time.
	 *
	 * Only ever fills blanks: a search hit's metadata is canonical and a second
	 * read must not overwrite it with something thinner.
	 */
	markFetched(arxivId: string, meta?: { title?: string; authors?: string[] }) {
		const prior = this.#byId.get(arxivId);
		// Free, offline, and always agrees with the id printed beside it — an
		// arXiv id states its own year. `(n.d.)` was never necessary here.
		const year = arxivYear(arxivId);
		if (prior) {
			prior.fetched = true;
			if (!prior.title && meta?.title) prior.title = meta.title;
			if (!prior.authors.length && meta?.authors?.length) prior.authors = meta.authors;
			if (prior.year == null) prior.year = year;
		} else {
			// Fetched directly by id, without a search first — still a real read.
			this.#byId.set(arxivId, {
				n: this.#byId.size + 1,
				arxivId,
				title: meta?.title ?? '',
				authors: meta?.authors ?? [],
				year,
				citations: 0,
				fetched: true,
				cited: 0
			});
		}
		this.#save();
	}

	/** True when a source still cannot name itself, so a lookup is worth a request. */
	needsMetadata(arxivId: string): boolean {
		const s = this.#byId.get(arxivId);
		return !s || !s.authors.length || !s.title;
	}

	get(arxivId: string): Source | undefined {
		return this.#byId.get(arxivId);
	}

	all(): Source[] {
		return [...this.#byId.values()].sort((a, b) => a.n - b.n);
	}

	/**
	 * The canonical inline citation, or a refusal explaining exactly why.
	 *
	 * The two failure strings are written for the model that will read them:
	 * they state the rule and the next action, because "error" alone teaches a
	 * model nothing it can act on.
	 */
	cite(arxivId: string): { ok: boolean; text: string } {
		const s = this.#byId.get(arxivId);
		if (!s) {
			return {
				ok: false,
				text:
					`REFUSED: arXiv:${arxivId} is not in this run's source registry. ` +
					`Only papers that entered the run through search_papers or fetch_paper can be cited. ` +
					`If the paper is real, search for it first; if you cannot find it, cut the claim.`
			};
		}
		if (!s.fetched) {
			return {
				ok: false,
				text:
					`REFUSED: arXiv:${arxivId} ("${s.title.slice(0, 80)}") was only seen as a search ` +
					`snippet — its full text was never read. An abstract is not the paper. Dispatch a ` +
					`paper-reader for it (or fetch_paper), then cite it.`
			};
		}
		s.cited++;
		this.#save();
		// A paper nothing could name still cites cleanly by id. A bare arXiv id is
		// an honest citation; "(Unknown, n.d.)" is typesetting a shrug.
		const who = s.authors[0] ? surnameOf(s.authors[0]) : '';
		const inline = who
			? `(${who}${s.authors.length > 1 ? ' et al.' : ''}, ${s.year ?? 'n.d.'}, arXiv:${s.arxivId})`
			: `(arXiv:${s.arxivId})`;
		return {
			ok: true,
			text: `Cite inline as: ${inline}  — this is [S${s.n}] in the registry, read in full, cited ${s.cited}× so far.`
		};
	}

	/** The References section, generated from the registry rather than recalled. */
	bibliography(): string {
		const used = this.all().filter((s) => s.cited > 0);
		const pool = used.length ? used : this.all().filter((s) => s.fetched);
		if (!pool.length) return 'The registry holds no cited or read papers yet. Nothing to list.';
		return pool
			.map((s) => {
				const who = s.authors.length ? s.authors.join(', ') : 'Unknown authors';
				return `[S${s.n}] ${who} (${s.year ?? 'n.d.'}). ${s.title || '(title not recorded)'}. arXiv:${s.arxivId}.`;
			})
			.join('\n');
	}
}

export const sources = new SourceRegistry();
