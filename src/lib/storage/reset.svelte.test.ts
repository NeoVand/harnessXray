import { describe, it, expect, beforeEach } from 'vitest';
import { factoryReset, resetInProgress } from './reset';

/**
 * Regression for the resurrection bug.
 *
 * The reload that ends a factory reset fires `pagehide` like any navigation,
 * and the exit-time flush used to do exactly what it was built to do — write
 * the live session back to storage, *after* the wipe. Reset, reload, and the
 * chat came back. The latch is the fix: every exit-time writer checks it. If
 * it stops being set, the resurrection comes back with it.
 */
describe('factoryReset', () => {
	beforeEach(() => {
		localStorage.clear();
		localStorage.setItem('hx:threads', '[{"id":"t1","title":"seeded"}]');
		localStorage.setItem('hx:thread:t1', '{"messages":[]}');
		localStorage.setItem('hx:skills', '{}');
		localStorage.setItem('hx:openai-key', 'sk-test');
		localStorage.setItem('hx:openai-key-persist', '1');
	});

	it('wipes app state but keeps the API key by default', async () => {
		await factoryReset();
		expect(localStorage.getItem('hx:threads')).toBeNull();
		expect(localStorage.getItem('hx:thread:t1')).toBeNull();
		expect(localStorage.getItem('hx:skills')).toBeNull();
		expect(localStorage.getItem('hx:openai-key')).toBe('sk-test');
		expect(localStorage.getItem('hx:openai-key-persist')).toBe('1');
	});

	it('wipes the key too when asked', async () => {
		await factoryReset({ includeKey: true });
		expect(localStorage.getItem('hx:openai-key')).toBeNull();
		expect(localStorage.getItem('hx:openai-key-persist')).toBeNull();
	});

	it('latches resetInProgress so exit-time flushes cannot write the wipe back', async () => {
		await factoryReset();
		expect(resetInProgress.value).toBe(true);
	});
});
