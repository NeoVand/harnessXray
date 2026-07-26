import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';

const shim = (name: string) =>
	fileURLToPath(new URL(`./src/lib/shims/${name}.ts`, import.meta.url));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			alias: { $agent: 'src/lib/agent', $xray: 'src/lib/xray' }
		})
	],

	// ── Browser shims for the agent core ────────────────────────────────────
	// `deepagents/browser` emits no `node:` imports of its own, but its
	// dependency graph does. Measured, not guessed — `esbuild --platform=browser`
	// fails on exactly these four and succeeds once they are aliased:
	//
	//   path  → picomatch (top-level CJS require, hard load failure)
	//   util  → micromatch + fill-range (top-level CJS require, hard load failure)
	//   node:fs/promises, node:path → langsmith sandbox client (lazy import,
	//                                 only fails if LangSmithSandbox runs — it never does)
	//
	// Each alias is exact-match so a future dependency reaching for something
	// unexpected fails loudly at build time instead of silently at runtime.
	resolve: {
		alias: [
			{ find: /^node:fs\/promises$/, replacement: shim('unavailable') },
			{ find: /^(node:)?util$/, replacement: shim('util') },
			{ find: /^(node:)?path$/, replacement: 'path-browserify' }
		]
	},
	// 43 unguarded `process.env.X` reads survive into the bundle (LangSmith's
	// config defaults, mostly). Every `process.versions` / `platform` / `arch`
	// read is already behind a `typeof process !== "undefined"` guard, so this
	// single narrow define is all that is needed — we deliberately do NOT
	// polyfill a whole `process` object we do not have.
	// Parenthesised so `process.env.FOO` becomes `({}).FOO` rather than a block.
	define: { 'process.env': '({})' },

	optimizeDeps: {
		include: [
			'deepagents/browser',
			'langchain',
			'@langchain/core',
			'@langchain/langgraph/web',
			'@langchain/openai'
		]
	},
	worker: { format: 'es' },

	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
