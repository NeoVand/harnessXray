import { createMiddleware } from 'langchain';
import { SystemMessage } from '@langchain/core/messages';
import { assets } from '$lib/storage/assets.svelte';
import { sources } from './sources';

/**
 * World-state awareness, as middleware — the harness construct this app was
 * missing.
 *
 * The disjointed-mind failures all had one shape: something true about the
 * world (an image exists, a paper was read) that the model could only learn
 * by choosing to call the right tool, and one wrong instrument later it was
 * regenerating images it already had. Tools are pull; awareness should be
 * push. This middleware appends a small `<world_state>` block to every model
 * call — main agent and subagents alike — naming the images that exist and
 * the state of the source registry.
 *
 * Three properties are load-bearing:
 *  - **Ephemeral.** The block rides the request via wrapModelCall and is
 *    never written into message history — state stays clean, and the block
 *    can never go stale because it is rebuilt per call.
 *  - **Appended last.** The prompt prefix (system, tools, history) is
 *    byte-identical to what it would have been, so prompt caching keeps
 *    working; the block only invalidates itself.
 *  - **Synchronous.** Reads the warm asset cache and the registry, no
 *    awaits — nothing for the browser ALS shim to lose.
 *
 * It is also, deliberately, a lesson: the Context panel shows the block as
 * its own injected row on the wire, which is what "dynamic context" actually
 * means in a harness.
 */
export const worldStateMiddleware = createMiddleware({
	name: 'WorldStateMiddleware',
	wrapModelCall: (request, handler) => {
		const images = assets.imagesSync();
		const papers = sources.all();
		if (!images.length && !papers.length) return handler(request);

		const lines: string[] = ['<world_state>'];
		if (images.length) {
			lines.push(
				'Images that exist RIGHT NOW (asset store — ls cannot see these; never regenerate them):'
			);
			for (const a of images.slice(0, 12)) {
				const meta = a.meta ?? {};
				const what =
					meta.source === 'extracted'
						? `extracted from arXiv:${String(meta.arxivId ?? '?')}`
						: meta.prompt
							? 'generated'
							: 'uploaded';
				const cap = String(meta.caption ?? meta.prompt ?? '').slice(0, 60);
				lines.push(`- ${a.path} (${what}${cap ? `: ${cap}` : ''})`);
			}
			if (images.length > 12)
				lines.push(`…and ${images.length - 12} more (list_figures shows all).`);
		}
		if (papers.length) {
			const read = papers.filter((s) => s.fetched).length;
			const cited = papers.filter((s) => s.cited > 0).length;
			lines.push(
				`Source registry: ${papers.length} papers seen · ${read} read in full · ${cited} cited.`
			);
		}
		lines.push('</world_state>');

		return handler({
			...request,
			messages: [...request.messages, new SystemMessage(lines.join('\n'))]
		});
	}
});
