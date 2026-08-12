import { describe, it, expect } from 'vitest';
import { KONAMI, push, isComplete } from './cockpit.svelte';

/**
 * The Konami detector, and the bug it shipped with for about ten minutes.
 *
 * The first version tracked an index: advance on a match, and on a miss credit
 * the key as a possible fresh start. That reads as careful and is still wrong.
 * The code opens with two Up presses, so after `↑↑↑` you are two keys in, not
 * one — the last two Ups remain a valid prefix. The index version scored that
 * as one, then failed on the Down that followed, and the egg silently refused
 * to open. Silently is the whole problem: there is no error state for a key
 * sequence, so a wrong fallback is indistinguishable from a user who mistyped.
 *
 * Caught by driving the real app rather than by reading the code, which is why
 * these cases are the ones a person actually produces at a keyboard: the
 * over-press, the false start, the retry after giving up halfway.
 */

const type = (keys: string[]) => keys.reduce<string[]>((buf, k) => push(buf, k), []);
const CODE = [...KONAMI];

describe('konami', () => {
	it('opens on the code', () => {
		expect(isComplete(type(CODE))).toBe(true);
	});

	it('does not open on a prefix', () => {
		for (let n = 0; n < CODE.length; n++)
			expect(isComplete(type(CODE.slice(0, n))), `${n}`).toBe(false);
	});

	it('survives an over-pressed opening — the bug', () => {
		// ↑↑↑↓↓←→←→ba: the last ten keys ARE the code, and a person who leaned on
		// the arrow key expects it to work. The index version failed this.
		expect(isComplete(type(['ArrowUp', ...CODE]))).toBe(true);
		expect(isComplete(type(['ArrowUp', 'ArrowUp', 'ArrowUp', ...CODE.slice(2)]))).toBe(true);
	});

	it('survives any amount of junk before a clean run', () => {
		expect(isComplete(type(['x', 'Enter', 'ArrowDown', 'q', ...CODE]))).toBe(true);
	});

	it('survives a false start followed by the real thing', () => {
		// Got four keys in, realised it was wrong, started over without pausing.
		expect(isComplete(type([...CODE.slice(0, 4), ...CODE]))).toBe(true);
	});

	it('ignores case on the letters but not on the named keys', () => {
		expect(isComplete(type([...CODE.slice(0, 8), 'B', 'A']))).toBe(true);
		// 'arrowup' is not a key any browser emits; it must not be accepted.
		expect(isComplete(type(['arrowup', ...CODE.slice(1)]))).toBe(false);
	});

	it('does not open on the code with one key missing', () => {
		for (let i = 0; i < CODE.length; i++) {
			const missing = CODE.filter((_, j) => j !== i);
			expect(isComplete(type(missing)), `dropped ${CODE[i]}`).toBe(false);
		}
	});

	it('never grows the buffer past the code length', () => {
		let buf: string[] = [];
		for (let i = 0; i < 200; i++) buf = push(buf, 'ArrowUp');
		expect(buf).toHaveLength(KONAMI.length);
	});
});
