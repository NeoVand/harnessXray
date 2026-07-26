import type { EventBus } from '$lib/xray/bus.svelte';
import type { Source } from '$lib/agent/sources';
import type { Todo, XrayEvent } from '$lib/xray/events';
import { runTotals, money, compact } from '$lib/xray/usage';

/**
 * The run, folded into a story the lab tutor can reason over.
 *
 * A pure function over the same event log every panel folds over — no model
 * call, no reactivity, no network. The tutor's honesty depends on this file:
 * whatever is not in the digest, the tutor is told not to say, so the digest
 * has to carry the load-bearing facts (tools, lanes, gates, files, costs) and
 * carry them compactly enough to fit in a sidecar prompt.
 *
 * Hard-capped, newest-first under pressure: when a long session outgrows the
 * budget, whole early turns are elided rather than every turn being shaved,
 * because a student's questions are almost always about the run they just
 * watched.
 */

export const DIGEST_CAP = 9000;

/** The slice of the log the digest reads. Structural, so tests can hand in a plain array. */
export interface DigestLog {
	events: readonly XrayEvent[];
}

/** The slice of session state the digest quotes. */
export interface DigestSession {
	model: string;
	todos: readonly Todo[];
	fileList: readonly string[];
	/** Names of the skills currently enabled, when the caller knows them. */
	skillNames?: readonly string[];
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const TODO_MARK: Record<Todo['status'], string> = {
	completed: '[done]',
	in_progress: '[now]',
	pending: '[ ]'
};

interface TurnBlock {
	header: string;
	tools: string[];
	writes: string[];
	lines: string[];
}

function renderTurn(b: TurnBlock): string {
	const out = [b.header];
	if (b.tools.length) {
		const shown = b.tools.slice(0, 28);
		const more = b.tools.length - shown.length;
		out.push(
			`  tools (${b.tools.length}): ${shown.join(' → ')}${more > 0 ? ` … +${more} more` : ''}`
		);
	}
	if (b.writes.length) {
		const shown = b.writes.slice(0, 10);
		const more = b.writes.length - shown.length;
		out.push(`  files: ${shown.join(' · ')}${more > 0 ? ` +${more} more` : ''}`);
	}
	for (const line of b.lines) out.push(`  ${line}`);
	return out.join('\n');
}

export function buildDigest(
	log: DigestLog,
	session: DigestSession,
	sources: readonly Source[] = []
): string {
	const events = log.events;

	// runTotals only reads `.events`; the EventBus class type is nominal (it has
	// private fields), so a synthetic log is structurally sufficient and the
	// cast is the honest way to say so.
	const t = runTotals(log as unknown as EventBus, session.model);

	const head: string[] = [];
	head.push('== run digest — folded from the live event log ==');
	head.push(`model: ${session.model} · ${events.length} events on the log`);

	if (t.calls > 0) {
		const cachePct = t.input > 0 ? Math.round((t.cached / t.input) * 100) : 0;
		head.push(
			`totals: ${t.calls} model calls · ${compact(t.input)} tokens in (${cachePct}% cached` +
				`${t.cacheWrite ? `, ${compact(t.cacheWrite)} cache-write` : ''}) · ` +
				`${compact(t.output)} out${t.reasoning ? ` (${compact(t.reasoning)} reasoning)` : ''} · ` +
				`${money(t.costUsd)} total · ${(t.ms / 1000).toFixed(1)}s of run time`
		);
		if (t.imageCalls > 0) {
			head.push(
				`images: ${t.imageCalls} generated · ${compact(t.imageOut)} image-output tokens · ` +
					`${money(t.imageUsd)} of the total (billed on their own meter)`
			);
		}
	} else {
		head.push('totals: no model calls on the wire yet');
	}

	if (session.todos.length) {
		const shown = session.todos.slice(0, 12);
		head.push(
			`todos (${session.todos.length}): ` +
				shown.map((td) => `${TODO_MARK[td.status]} ${trunc(td.content, 60)}`).join(' / ') +
				(session.todos.length > shown.length ? ' / …' : '')
		);
	}

	if (session.fileList.length) {
		const shown = session.fileList.slice(0, 40);
		head.push(
			`files (${session.fileList.length}): ${shown.join(', ')}` +
				(session.fileList.length > shown.length ? ', …' : '')
		);
	}

	// Prefer what the caller knows now; fall back to what the log last reported.
	const skills =
		session.skillNames ??
		[...events].reverse().find((e) => e.kind === 'skills_loaded')?.names ??
		[];
	if (skills.length) head.push(`skills active (${skills.length}): ${skills.join(', ')}`);

	if (sources.length) {
		const shown = sources.slice(0, 12);
		head.push(
			`sources (${sources.length}): ` +
				shown
					.map(
						(s) =>
							`[S${s.n}] ${s.arxivId}${s.title ? ` "${trunc(s.title, 48)}"` : ''} ` +
							`${s.fetched ? 'read in full' : 'snippet only'}${s.cited ? `, cited ${s.cited}×` : ''}`
					)
					.join(' · ')
		);
	}

	// ── the turns, oldest first ─────────────────────────────────────────────
	const turns: TurnBlock[] = [];
	let current: TurnBlock | null = null;
	// Uploads land on the log while the file sits in the composer — before the
	// run_start they belong to — so they wait here for the turn that sends them.
	let staged: string[] = [];
	let turnNo = 0;

	// Returns the block rather than assigning the captured variable from inside
	// the closure — the checker cannot see closure writes, so every later use of
	// `current` would be typed as still-null.
	const open = (header: string): TurnBlock => {
		const block: TurnBlock = { header, tools: [], writes: [], lines: staged };
		staged = [];
		turns.push(block);
		return block;
	};

	for (const e of events) {
		switch (e.kind) {
			case 'run_start':
				current = open(`turn ${++turnNo} — you: "${trunc(e.input.replace(/\s+/g, ' '), 160)}"`);
				break;
			case 'upload':
				staged.push(`upload: ${e.path} (${compact(e.chars)} chars extracted)`);
				break;
			case 'tool_start': {
				if (!current) current = open(`turn ${++turnNo} — (input not on the log)`);
				const name = e.skill ? `${e.name}(skill:${e.skill})` : e.name;
				current.tools.push(e.lane ? `${e.lane}:${name}` : name);
				break;
			}
			case 'tool_end':
				if (current && e.status === 'error')
					current.lines.push(
						`tool error: ${e.lane ? `${e.lane}:` : ''}${e.name} — ${trunc(e.result.replace(/\s+/g, ' '), 100)}`
					);
				break;
			case 'fs_write':
				current?.writes.push(`${e.op} ${e.path}`);
				break;
			case 'interrupt':
				current?.lines.push(
					`gate raised: ${e.actions.map((a) => a.name).join(', ')} — the run paused for a human ` +
						`(choices offered: ${e.allowed.join('/') || 'approve'})`
				);
				break;
			case 'resume': {
				const taken = e.decisions
					.map((d) => (d as { type?: string })?.type ?? 'decision')
					.join(', ');
				current?.lines.push(
					`decision taken: ${taken} for ${e.actions.join(', ')} — the run resumed`
				);
				break;
			}
			case 'paper_fetched':
				current?.lines.push(
					`paper read: ${e.arxivId}${e.title ? ` "${trunc(e.title, 60)}"` : ''} (${compact(e.chars)} chars)`
				);
				break;
			case 'figure_extracted':
				current?.lines.push(
					`figure kept: ${e.path} — "${trunc(e.caption.replace(/\s+/g, ' '), 70)}"`
				);
				break;
			case 'image_done':
				current?.lines.push(`image generated: ${e.path} (${(e.ms / 1000).toFixed(1)}s)`);
				break;
			case 'compaction':
				current?.lines.push(
					`compaction (${e.trigger}): ${e.cutoffIndex} messages folded into a summary` +
						(e.filePath ? `, originals archived at ${e.filePath}` : '')
				);
				break;
			case 'rewind':
				current?.lines.push(
					`rewind: forked from an earlier checkpoint, ${e.dropped} messages moved to an orphan branch`
				);
				break;
			case 'http_error':
				current?.lines.push(
					`network error: ${trunc(e.message, 90)}${e.maybeRejectedKey ? ' (possibly a rejected key)' : ''}`
				);
				break;
			case 'note':
				current?.lines.push(`note: ${trunc(e.message, 110)}`);
				break;
			case 'run_end':
				current?.lines.push(
					e.status === 'done'
						? `end: finished · ${(e.ms / 1000).toFixed(1)}s`
						: e.status === 'interrupted'
							? `end: paused mid-turn, waiting on the gate · ${(e.ms / 1000).toFixed(1)}s`
							: `end: error${e.label ? ` — ${trunc(e.label, 80)}` : ''} · ${(e.ms / 1000).toFixed(1)}s`
				);
				break;
			default:
				break;
		}
	}
	if (staged.length)
		turns.push({ header: 'staged for the next turn:', tools: [], writes: [], lines: staged });

	const headText = head.join('\n');
	if (!turns.length) return trunc(`${headText}\nno turns yet — nothing has run.`, DIGEST_CAP);

	// Drop whole early turns until the story fits; the recent ones are what
	// questions are about. The final slice is a backstop, not the mechanism.
	const blocks = turns.map(renderTurn);
	let dropped = 0;
	let body = blocks.join('\n');
	while (dropped < blocks.length - 1 && headText.length + body.length + 64 > DIGEST_CAP) {
		dropped++;
		body = blocks.slice(dropped).join('\n');
	}
	const elision = dropped
		? `(… ${dropped} earlier turn${dropped === 1 ? '' : 's'} elided to fit …)\n`
		: '';
	return trunc(`${headText}\n— turns, oldest first —\n${elision}${body}`, DIGEST_CAP);
}
