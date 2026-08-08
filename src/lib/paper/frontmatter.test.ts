import { describe, it, expect } from 'vitest';
import { splitFrontmatter, tokenizeYaml } from './frontmatter';
import { BUILTIN_SKILLS } from '$lib/agent/skills.svelte';

/**
 * Frontmatter splitting, pinned.
 *
 * The dangerous failure is not a mis-coloured key — it is eating prose. A `---`
 * further down a document is a horizontal rule, and treating one as a metadata
 * fence would silently swallow a section of the review. So the strictness of the
 * opening match matters more than anything else here, and the real skills the
 * app ships are used as the fixture, because they are the documents this
 * actually runs against.
 */

const text = (tokens: { text: string }[][]) => tokens.map((l) => l.map((t) => t.text).join(''));

describe('splitFrontmatter', () => {
	it('peels the leading block and leaves the body untouched', () => {
		const { frontmatter, body } = splitFrontmatter(
			'---\nname: demo\ndescription: A thing\n---\n# Heading\n\nBody text.\n'
		);
		expect(frontmatter).toBe('name: demo\ndescription: A thing');
		expect(body).toBe('# Heading\n\nBody text.\n');
	});

	it('leaves a horizontal rule alone', () => {
		// The whole point. A rule mid-document is content, not metadata.
		const src = 'Some prose.\n\n---\n\nMore prose.\n';
		expect(splitFrontmatter(src)).toEqual({ frontmatter: '', body: src });
	});

	it('treats unterminated frontmatter as no frontmatter', () => {
		// Better to render a stray fence than to eat the rest of the file.
		const src = '---\nname: demo\n\n# Heading\n';
		expect(splitFrontmatter(src).frontmatter).toBe('');
		expect(splitFrontmatter(src).body).toBe(src);
	});

	it('handles CRLF and a BOM, both of which arrive from real uploads', () => {
		const { frontmatter, body } = splitFrontmatter('﻿---\r\nname: demo\r\n---\r\nBody\r\n');
		expect(frontmatter).toBe('name: demo');
		expect(body).toBe('Body\r\n');
	});

	it('survives an empty or absent source', () => {
		expect(splitFrontmatter('')).toEqual({ frontmatter: '', body: '' });
		expect(splitFrontmatter(undefined as unknown as string).body).toBe('');
	});

	it('splits every skill this app actually ships', () => {
		// These are the documents the complaint was about: each opens with a
		// `---` block that used to render as running prose.
		for (const s of BUILTIN_SKILLS) {
			const { frontmatter, body } = splitFrontmatter(s.body);
			expect(frontmatter, s.name).toContain('name:');
			expect(frontmatter, s.name).toContain('description:');
			// And the body must not keep a dangling fence.
			expect(body.trimStart().startsWith('---'), s.name).toBe(false);
		}
	});
});

describe('tokenizeYaml', () => {
	it('never loses a character', () => {
		// The renderer prints tokens in order, so round-tripping is the guarantee
		// that nothing is dropped or duplicated on screen.
		const src = 'name: demo\ndescription: A thing: with a colon\ncount: 3\nok: true\n# note\n- one';
		expect(text(tokenizeYaml(src)).join('\n')).toBe(src);
	});

	it('colours keys, strings, numbers and booleans apart', () => {
		const kinds = (line: string) =>
			tokenizeYaml(line)[0]
				.filter((t) => t.text.trim())
				.map((t) => t.kind);
		expect(kinds('name: demo')).toEqual(['key', 'plain', 'string']);
		expect(kinds('count: 42')).toEqual(['key', 'plain', 'number']);
		expect(kinds('enabled: false')).toEqual(['key', 'plain', 'boolean']);
	});

	it('keeps a hash inside a value out of the comment colour', () => {
		// `#` only opens a comment after whitespace — a colour or a URL fragment
		// is part of the value.
		const t = tokenizeYaml('colour: #131316')[0].filter((x) => x.text.trim());
		expect(t.some((x) => x.kind === 'comment')).toBe(false);

		const c = tokenizeYaml('name: demo # trailing')[0];
		expect(c.some((x) => x.kind === 'comment')).toBe(true);
	});

	it('recognises block list items', () => {
		const kinds = tokenizeYaml('  - first')[0].map((t) => t.kind);
		expect(kinds).toContain('dash');
		expect(kinds).toContain('string');
	});
});
