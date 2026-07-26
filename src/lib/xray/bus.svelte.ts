import { DISPLAY_OF, type EventKind, type Scope, type XrayEvent } from './events';

/**
 * The event log.
 *
 * The log itself is a **plain array**, deliberately not `$state`. A run emits
 * thousands of SSE frames; wrapping each one in a deep reactive proxy would cost
 * more than rendering them. Instead the array is mutated directly and a single
 * `version` counter — bumped once per animation frame — is the only reactive
 * value. A view reads `bus.version` to declare its dependency, then reads the
 * plain array. One proxy, not ten thousand.
 *
 * Everything downstream is a pure fold over this log, which is what makes
 * replay and time-travel free rather than a feature.
 */

type Emitted<K extends EventKind> = Extract<XrayEvent, { kind: K }>;
type EmitInput<K extends EventKind> = Omit<
	Emitted<K>,
	'id' | 'seq' | 't' | 'displayKind' | 'branchId'
> & {
	kind: K;
	displayKind?: Emitted<K>['displayKind'];
	branchId?: string;
};

export class EventBus {
	/** Append-only. Never spliced — replay is a fold with a cursor, not a mutation. */
	readonly events: XrayEvent[] = [];

	/** The only reactive value. Bumped at most once per frame. */
	version = $state(0);

	#seq = 0;
	#frame: number | null = null;
	#t0 = typeof performance !== 'undefined' ? performance.now() : 0;

	branchId = 'main';

	get length() {
		return this.events.length;
	}

	/** The seq the next event will be given — a stable mark to rewind to. */
	get nextSeq() {
		return this.#seq + 1;
	}

	/** Milliseconds since the bus was created. */
	now() {
		return (typeof performance !== 'undefined' ? performance.now() : 0) - this.#t0;
	}

	emit<K extends EventKind>(input: EmitInput<K>): Emitted<K> {
		const event = {
			...input,
			id: `e${(++this.#seq).toString().padStart(6, '0')}`,
			seq: this.#seq,
			t: this.now(),
			displayKind: input.displayKind ?? DISPLAY_OF[input.kind],
			branchId: input.branchId ?? this.branchId
		} as unknown as Emitted<K>;

		this.events.push(event);
		this.#schedule();
		return event;
	}

	/**
	 * Amend an event already in the log.
	 *
	 * Streaming makes some facts arrive after the event they belong to: a tool
	 * call is announced with its name before its arguments have finished
	 * arriving, so anything derived from those arguments — which file, which
	 * skill — cannot be known when the row is first written. Amending in place
	 * keeps one row per thing that happened, rather than a second row quietly
	 * correcting the first.
	 *
	 * Still append-only in the sense that matters: no event is removed and no
	 * order changes. Only a row that was incomplete becomes complete.
	 *
	 * The replacement is a *new object*, not a mutation. Events are plain and
	 * deliberately un-proxied — that is what makes ten thousand of them cheap —
	 * so a keyed `{#each}` has no way to notice a field changing underneath it.
	 * Swapping identity is the signal. Returns the new event; hold that one.
	 */
	revise<T extends XrayEvent>(event: T, patch: Partial<T>): T {
		const at = this.events.indexOf(event);
		const next = { ...event, ...patch } as T;
		if (at >= 0) this.events[at] = next;
		this.#schedule();
		return next;
	}

	/**
	 * Coalesce notifications to one per frame. A streaming response can emit
	 * hundreds of frames between paints; the UI only needs to know "something
	 * changed" once.
	 */
	#schedule() {
		if (this.#frame !== null) return;
		if (typeof requestAnimationFrame === 'undefined') {
			this.version++;
			return;
		}
		this.#frame = requestAnimationFrame(() => {
			this.#frame = null;
			this.version++;
		});
	}

	clear() {
		this.events.length = 0;
		this.branches.length = 0;
		this.#seq = 0;
		this.#t0 = typeof performance !== 'undefined' ? performance.now() : 0;
		this.version++;
	}

	/**
	 * Runs that were abandoned by a rewind, newest first.
	 *
	 * Kept, because a fork in LangGraph discards nothing — the old checkpoints
	 * stay in the store as an orphan branch — and a log that quietly deleted them
	 * would be telling a different story from the graph it claims to mirror.
	 */
	readonly branches: { id: string; forkedAt: number; events: XrayEvent[] }[] = [];

	/**
	 * Rewind the live log to just before `seq`, setting the rest aside.
	 *
	 * `events` is the *live branch*, which is what every panel folds over, so it
	 * has to end where the run now ends. The events after the fork point move to
	 * `branches` rather than being dropped.
	 */
	fork(seq: number) {
		const cut = this.events.findIndex((e) => e.seq >= seq);
		if (cut < 0) return;
		const abandoned = this.events.splice(cut);
		if (abandoned.length) {
			this.branches.unshift({ id: this.branchId, forkedAt: seq, events: abandoned });
		}
		// A new branch id, so events recorded from here are distinguishable from
		// the ones they replaced. `#seq` is deliberately *not* rewound — ids must
		// keep climbing past everything ever issued, or a new event would collide
		// with an archived one and `byId` would return the wrong thing.
		this.branchId = `b${this.branches.length + 1}`;
		this.version++;
	}

	/**
	 * Restore a previously saved log.
	 *
	 * The conversation was persisted to localStorage from the start while the
	 * event log lived only in memory — so a reload brought the chat back and left
	 * the timeline empty, which reads as "the timeline reset itself" even though
	 * nothing cleared it. Making both survive removes the asymmetry.
	 */
	hydrate(events: XrayEvent[]) {
		this.events.length = 0;
		this.events.push(...events);
		this.#seq = events.reduce((max, e) => Math.max(max, e.seq), 0);
		this.version++;
	}

	/**
	 * A version of the log worth writing to disk.
	 *
	 * SSE frames are ~80% of the volume and are only interesting while you are
	 * looking at the exchange that produced them, so the oldest are dropped
	 * first. Everything semantic — tools, files, interrupts, images — is kept.
	 */
	snapshot(maxFrames = 400): XrayEvent[] {
		const frames = this.events.reduce((n, e) => n + (e.kind === 'http_sse_frame' ? 1 : 0), 0);
		let toDrop = Math.max(0, frames - maxFrames);
		return this.events.filter((e) => {
			if (e.kind !== 'http_sse_frame' || toDrop === 0) return true;
			toDrop--;
			return false;
		});
	}

	/** All frames belonging to one HTTP exchange, in order. */
	framesOf(httpId: string) {
		return this.events.filter((e) => e.kind === 'http_sse_frame' && e.httpId === httpId);
	}

	byId(id: string) {
		return this.events.find((e) => e.id === id);
	}

	scopes(): Scope[] {
		const out: Scope[] = [];
		for (const e of this.events) if (!out.includes(e.scope)) out.push(e.scope);
		return out;
	}
}

export const bus = new EventBus();

// In dev, the log is reachable from the console as `__hx.bus`. This lab is about
// making the invisible inspectable; that should include inspecting the lab.
if (import.meta.env.DEV && typeof window !== 'undefined') {
	// Spread, don't replace — hooks.client.ts already put the ALS shim here and
	// clobbering it makes the shim look uninstalled when it is merely hidden.
	const w = window as unknown as { __hx?: Record<string, unknown> };
	w.__hx = { ...(w.__hx ?? {}), bus };
}
