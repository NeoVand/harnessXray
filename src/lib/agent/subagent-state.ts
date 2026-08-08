/**
 * What crosses the boundary when a subagent is dispatched.
 *
 * `task` hands the child a filtered copy of the parent's state. deepagents keeps
 * the list in `EXCLUDED_STATE_KEYS` and drops every key in it, so the child
 * starts with the parent's FILES and essentially nothing else — no messages, no
 * plan, no skills metadata, no long-term memory contents.
 *
 * Two things this app already says in prose follow directly from that list, and
 * both are more convincing as a readout on the lane than as a claim in a book
 * chapter. Subagents coordinate through the filesystem because the filesystem is
 * the only thing they are given. And a custom subagent has no skills section at
 * all unless it names its own skills directory, because `skillsMetadata` is
 * filtered out on the way in — which is why ours went weeks unable to re-read a
 * manual it had been told to follow.
 *
 * Mirrored from deepagents@1.11.1. It is a short, stable list and copying it
 * costs a line; reaching into the package's internals to read it would couple
 * the timeline to a private constant for no gain.
 */

/** Parent state keys the harness withholds from a subagent, in plain words. */
export const NOT_INHERITED = ['messages', 'todos', 'skills', 'memory'] as const;

export const INHERITANCE_HELP =
	'A subagent is handed a filtered copy of the parent state: the files, and little else. ' +
	'Not the conversation, not the plan, not the skills index, not the long-term store. ' +
	'That is why these agents coordinate by writing files — and why a custom subagent has ' +
	'no skills at all unless it names its own skills directory.';
