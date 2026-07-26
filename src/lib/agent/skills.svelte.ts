import { browser } from '$app/environment';

/**
 * Skills — the cheapest capability you can give an agent.
 *
 * A skill is a markdown file. That is the whole idea, and it is worth sitting
 * with: no code, no registration, no deployment. The harness lists each skill's
 * name and description in the system prompt and nothing else, so twenty skills
 * cost a few hundred tokens. When one is relevant the agent reads the file with
 * the same `read_file` it uses for anything else, and only then pays for the
 * instructions. That is progressive disclosure, and it is why a skill library
 * can grow without the context growing with it.
 *
 * They live at `/skills/<name>/SKILL.md` in the agent's virtual filesystem —
 * the same channel as its notes and drafts. `createDeepAgent({ skills: ['/skills/'] })`
 * scans that directory through the backend, so seeding a file into state is all
 * it takes to install one. Nothing here is special-cased by the harness; a
 * skill the user writes in the browser loads exactly like a built-in.
 */

export interface Skill {
	/** Directory name and frontmatter name — the spec wants them equal. */
	name: string;
	description: string;
	/** The complete SKILL.md, frontmatter included. */
	body: string;
	builtin: boolean;
	enabled: boolean;
	createdAt: number;
}

export const SKILLS_ROOT = '/skills/';
export const skillPath = (name: string) => `${SKILLS_ROOT}${name}/SKILL.md`;

/** The Agent Skills spec: lowercase, digits, hyphens, ≤64 chars. */
export const NAME_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateName(name: string): string {
	if (!name) return 'A skill needs a name.';
	if (name.length > 64) return 'Names are capped at 64 characters.';
	if (!NAME_RULE.test(name)) return 'Lowercase letters, digits and single hyphens only.';
	return '';
}

/** Pull `name` and `description` back out of a SKILL.md. */
export function readFrontmatter(body: string): { name: string; description: string } {
	const block = body.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!block) return { name: '', description: '' };
	const field = (key: string) => {
		// Values may be plain, quoted, or folded onto following indented lines.
		const m = block[1].match(new RegExp(`^${key}:\\s*(.*(?:\\n[ \\t]+.*)*)$`, 'm'));
		if (!m) return '';
		return m[1]
			.split('\n')
			.map((l) => l.trim())
			.join(' ')
			.replace(/^['"]|['"]$/g, '')
			.trim();
	};
	return { name: field('name'), description: field('description') };
}

export function composeSkill(name: string, description: string, instructions: string): string {
	// Descriptions are folded to one line: the frontmatter is YAML, and a stray
	// newline in an unquoted scalar silently truncates the value.
	const oneLine = description.replace(/\s+/g, ' ').trim();
	return `---\nname: ${name}\ndescription: ${oneLine}\n---\n\n${instructions.trim()}\n`;
}

/* ── the ones that ship ──────────────────────────────────────────────────── */

const SKILL_CREATOR = composeSkill(
	'skill-creator',
	'Write a new skill. Use when the user asks to create, generate, or improve a skill, or when you notice a workflow you have now repeated more than once and should capture.',
	`# Writing a skill

A skill is one markdown file at \`/skills/<name>/SKILL.md\`. It is read only when
it is relevant, so write it for the moment it is needed rather than as an
introduction.

## The shape

\`\`\`markdown
---
name: kebab-case-name
description: What it does AND when to reach for it. This line is the only part always in context.
---

# Title

Steps, in order. Concrete. Imperative.
\`\`\`

## Rules that matter

1. **The description is the whole interface.** It is all the agent sees until it
   decides to read further, so it must answer "would this help me right now?".
   Write "when to use" into it explicitly — "Use when the user asks for…".
2. **Name it \`kebab-case\`,** matching the directory. Lowercase, digits, hyphens.
3. **Body is procedure, not prose.** Numbered steps, exact tool names, exact
   paths. If there is a right order, say the order.
4. **Show one worked example.** A single concrete example teaches more than
   three paragraphs of description.
5. **Say what not to do.** Failure modes you already know about are the most
   valuable thing in the file.
6. **Keep it under ~150 lines.** Longer means it should have been two skills.

## How to write one here

1. Ask what the workflow is, if it is not already obvious from the conversation.
2. Draft the file.
3. \`write_file\` it to \`/skills/<name>/SKILL.md\`.
4. Tell the user it will load on the next run — the skill list is read when the
   agent starts, so a skill written mid-conversation is available from the next
   message onward.

## Do not

- Do not restate general competence ("be helpful", "write clean code"). A skill
  earns its tokens by carrying something specific.
- Do not write a description that only names the domain. "Data analysis" does
  not help anyone decide; "Use when the user has a CSV and wants a chart" does.`
);

const ARXIV_REVIEW = composeSkill(
	'arxiv-review',
	'Read arXiv papers and turn them into a citable literature review. Use when writing a survey, a related-work section, or any document that cites papers.',
	`# Reviewing arXiv papers

## Reading

1. \`search_papers\` two or three times with **different phrasings**. It is cheap
   and the phrasings surface different literatures. Prefer highly-cited work for
   foundations and recent work for the frontier.
2. Only \`fetch_paper\` what you will actually cite — a full paper is tens of
   thousands of tokens. Better still, dispatch a **paper-reader subagent** per
   paper so the full text never enters your context at all.
3. Immediately write notes to the exact path \`fetch_paper\` hands back. Then work
   from the notes, never from the full text.

## Note format

\`\`\`markdown
# <title> (arXiv:<id>)
**Authors** · **Year** · **Cited by N**

## Claim
The one sentence the paper is actually arguing.

## Method
How they show it. Two or three sentences.

## Numbers
The specific results worth quoting, with units.

## Use in the review
Which section this supports, and what it is evidence *for*.
\`\`\`

## Writing

- Every claim from a paper carries an inline citation: \`(Author, year, arXiv:ID)\`.
- **Never invent a citation.** If you cannot support a claim, cut the claim.
- Structure: motivation → what came before → the current split in approaches →
  what is unresolved. Not a list of paper summaries — a list of summaries is
  what a review is instead of.
- Say where the field disagrees. A review that reports consensus everywhere has
  not read carefully.

## Markdown and maths

- Inline maths: \`$E = mc^2$\`. Display maths: \`$$…$$\` on its own lines.
- Escape a literal dollar sign as \`\\$\` or it opens a maths span.
- Tables need a header row and a separator row; keep cells short.
- Reference figures by the exact path they were written to: \`![caption](/figures/x.png)\`.
- Link a paper as \`arXiv:2401.12345\` — bare ids are turned into links for you.

## Do not

- Do not cite a paper you only saw in a search result. The abstract is not the
  paper; read it or drop it.
- Do not hold the draft in chat. Write each section to \`/paper/<NN>-<slug>.md\`.`
);

const INFOGRAPHIC = composeSkill(
	'infographic',
	'Design an explanatory figure and write the image prompt for it. Use when a document needs a diagram, a schematic, or a concept illustration rather than a photograph.',
	`# Explanatory figures

The failure mode is asking for "an illustration of X" and getting decorative
stock art. A figure earns its place by carrying one idea the text cannot.

## Decide first

1. **What single claim does this figure make?** Write it as a sentence. If you
   cannot, the document does not need the figure.
2. **What kind of figure carries that claim?**
   - a *process* → left-to-right flow with labelled stages
   - a *comparison* → two panels, identical framing, one variable changed
   - a *structure* → cutaway or exploded view
   - a *quantity* → do not generate it; write the numbers in a table instead

## Then write the prompt

Name all five, in this order:

1. **Subject** — the specific thing, not the category.
2. **Composition** — where things sit and where the eye goes.
3. **Style** — e.g. "technical diagram, flat vector, thin uniform strokes",
   "cutaway scientific illustration", "isometric schematic".
4. **Palette** — two or three colours, named. Restraint reads as authority.
5. **Background** — usually "plain off-white, no gradient, no vignette".

### Example

> A technical diagram of a transformer attention head. Left to right: a row of
> input tokens as small squares, thin lines fanning from one highlighted token
> to all others with varying line weights, converging into a single output
> square. Flat vector style, uniform 2px strokes, no shadows. Palette: slate
> grey, one warm ochre accent for the highlighted token, white background.
> Clean margins, no text labels.

## Rules

- **Ask for no text in the image.** Generated lettering is unreliable; put
  labels in the markdown caption underneath.
- Prefer "flat", "schematic", "diagrammatic" over "realistic" or "detailed" —
  detail is noise in an explanatory figure.
- One figure, one idea. Two ideas means two figures.
- Landscape (\`1536x1024\`) for anything that flows left to right.
- Write a real caption. The caption states the claim; the figure shows it.`
);

export const BUILTIN_SKILLS: Skill[] = [SKILL_CREATOR, ARXIV_REVIEW, INFOGRAPHIC].map((body) => {
	const { name, description } = readFrontmatter(body);
	return { name, description, body, builtin: true, enabled: true, createdAt: 0 };
});

/* ── the library ─────────────────────────────────────────────────────────── */

const KEY = 'hx:skills';

interface Stored {
	name: string;
	body: string;
	createdAt: number;
}

class SkillLibrary {
	/** Built-ins first, then anything the user added. */
	all = $state<Skill[]>([]);
	/** Which are switched on, by name. Built-ins default to on. */
	#disabled = $state<Set<string>>(new Set());

	constructor() {
		this.all = BUILTIN_SKILLS.map((s) => ({ ...s }));
		if (browser) this.#load();
	}

	get active(): Skill[] {
		return this.all.filter((s) => s.enabled);
	}

	/**
	 * Changes to the library must rebuild the agent, because the skills
	 * middleware caches the scan in a closure — a skill added to a live agent
	 * would never be seen. This signature is folded into the agent's cache key.
	 */
	get signature(): string {
		return this.active.map((s) => s.name).join(',');
	}

	/** The files to seed into the virtual filesystem before a run. */
	seed(): Record<string, { content: string; mimeType: string; created_at: string; modified_at: string }> {
		const now = new Date().toISOString();
		const out: Record<
			string,
			{ content: string; mimeType: string; created_at: string; modified_at: string }
		> = {};
		for (const s of this.active) {
			out[skillPath(s.name)] = {
				content: s.body,
				mimeType: 'text/markdown',
				created_at: now,
				modified_at: now
			};
		}
		return out;
	}

	#load() {
		try {
			const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
				user?: Stored[];
				disabled?: string[];
			};
			this.#disabled = new Set(raw.disabled ?? []);
			const user: Skill[] = (raw.user ?? []).map((s) => {
				const { name, description } = readFrontmatter(s.body);
				return {
					name: name || s.name,
					description,
					body: s.body,
					builtin: false,
					enabled: true,
					createdAt: s.createdAt
				};
			});
			this.all = [...BUILTIN_SKILLS.map((s) => ({ ...s })), ...user].map((s) => ({
				...s,
				enabled: !this.#disabled.has(s.name)
			}));
		} catch {
			/* a corrupt library should not cost you the built-ins */
		}
	}

	#save() {
		if (!browser) return;
		localStorage.setItem(
			KEY,
			JSON.stringify({
				user: this.all
					.filter((s) => !s.builtin)
					.map((s) => ({ name: s.name, body: s.body, createdAt: s.createdAt })),
				disabled: [...this.#disabled]
			})
		);
	}

	/** Add or replace by name. Returns an error string, or '' on success. */
	add(body: string): string {
		const { name, description } = readFrontmatter(body);
		const bad = validateName(name);
		if (bad) return bad;
		if (!description) return 'The frontmatter needs a description — it is the only part always in context.';

		const next: Skill = { name, description, body, builtin: false, enabled: true, createdAt: Date.now() };
		const at = this.all.findIndex((s) => s.name === name);
		if (at >= 0 && this.all[at].builtin) return `“${name}” is a built-in. Pick another name.`;
		if (at >= 0) this.all[at] = next;
		else this.all.push(next);
		this.#disabled.delete(name);
		this.#save();
		return '';
	}

	remove(name: string) {
		this.all = this.all.filter((s) => s.builtin || s.name !== name);
		this.#save();
	}

	toggle(name: string) {
		const hit = this.all.find((s) => s.name === name);
		if (!hit) return;
		hit.enabled = !hit.enabled;
		if (hit.enabled) this.#disabled.delete(name);
		else this.#disabled.add(name);
		this.#save();
	}
}

export const skills = new SkillLibrary();
