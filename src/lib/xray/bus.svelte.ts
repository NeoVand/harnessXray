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
		this.#seq = 0;
		this.#t0 = typeof performance !== 'undefined' ? performance.now() : 0;
		this.version++;
	}

	/** All frames belonging to one HTTP exchange, in order. */
	framesOf(httpId: string) {
		return this.events.filter((e) => e.kind === 'http_sse_frame' && e.httpId === httpId);
	}

	byId(id: string) {
		return this.events.find((e) => e.id === id);
	}

	scopes(): Scope[] {
		return [...new Set(this.events.map((e) => e.scope))];
	}
}

export const bus = new EventBus();

// In dev, the log is reachable from the console as `__hx.bus`. This lab is about
// making the invisible inspectable; that should include inspecting the lab.
if (import.meta.env.DEV && typeof window !== 'undefined') {
	(window as unknown as { __hx: unknown }).__hx = { bus };
}
