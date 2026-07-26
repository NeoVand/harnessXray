# harnessXray

**A lab for seeing how an AI agent actually works.**

Most agent frameworks are a black box with a chat window bolted to the front. You
type, something happens, text comes back. What was in the prompt? Which of those
tools did you write? Where did the model's memory go? How much of that bill was
re-sending the same conversation for the fifth time?

harnessXray runs a real [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview)
harness — planning, tools, virtual filesystem, memory, subagents, skills,
human-in-the-loop — entirely in your browser, and takes it apart while it runs.

The left pane is a working agent that searches arXiv, reads papers and writes a
cited review. The right pane is every plane of what it just did.

<br>

## The one design rule

**The agent is unmodified and unaware it is observed.** Nothing is passed *into*
the harness to make the X-ray work.

Everything you see is read from what LangGraph already publishes — `messages` for
token and tool-call deltas, `updates` for each node's committed state — plus the
literal bytes, captured by tee'ing the `fetch` the OpenAI SDK was given. That is
why the todo list, the virtual filesystem and the harness's own summarization all
appear without the agent cooperating.

This constraint is the whole pedagogy. A diagram of what *should* happen teaches
much less than a readout of what did.

<br>

## What you can see

| | |
|---|---|
| **Wire** | The exact request body and every raw SSE frame, as they went out and came back. |
| **Context** | The outgoing request decomposed. The assembled system prompt split back into the bands each middleware contributed — yours, the base prompt, plan, filesystem, subagents, skills, memory — with every tool schema itemised and every row's cost apportioned from the tokens the provider actually billed. |
| **Timeline** | Every event in the run, filterable by kind, with the raw payload one click away. |
| **Graph** | The compiled LangGraph topology the agent is running on. |
| **Files & memory** | The virtual filesystem (a checkpointed state channel) and the long-term store (which is not), side by side — so the difference in lifetime is visible rather than asserted. |
| **Plan & skills** | `write_todos` as the agent maintains it, and which skills are loaded versus actually read. |
| **Run** | What it cost, and how much of the input was a cache hit. |

<br>

## Things worth playing with

**Skills.** A skill is one markdown file at `/skills/<name>/SKILL.md` in the
agent's own filesystem. The prompt carries only names and descriptions; the agent
opens one with an ordinary `read_file` when it decides the skill applies. The
panel shows both numbers side by side — that gap is the entire argument for
progressive disclosure. Write your own, or have the agent write one.

**Human-in-the-loop.** Image generation pauses for approval before it spends
anything. You can approve, reject with a reason, or edit the tool call the model
proposed — before it runs.

**Compaction.** Watch the context fill, then fold it. The summary replaces the
older half *for the model* while the transcript stays whole for you, and the
original messages are archived to `/conversation_history/`.

**Rewind.** Edit any earlier message and re-run from there. This forks the thread
at the checkpoint that turn started from — the turns that followed are not
deleted, they become an orphan branch the checkpointer still holds.

<br>

## Running it

There is no server. Your OpenAI key is held in your browser and sent only to
`api.openai.com`.

```sh
npm install
npm run dev
```

Open the app, click the gear, paste a key. For development you can instead put it
in a gitignored `.env`:

```sh
echo 'VITE_OPENAI_API_KEY=sk-...' > .env
```

That path is read only through `import.meta.env.DEV`, so it constant-folds out of
a production build.

```sh
npm run check    # svelte-check
npm run build    # static output, adapter-static
```

<br>

## How it is put together

| Path | What lives there |
|---|---|
| `src/lib/agent/` | The agent itself — tools, subagents, skills, retrieval, compaction, persistence. |
| `src/lib/xray/` | The observation layer — event bus, wire capture, context reconstruction, usage accounting. |
| `src/lib/components/xray/` | The panels. |
| `src/lib/components/chat/` | The app half. |
| `docs/PLAN.md` | The build plan, with what was proven and when. |

A few decisions that are load-bearing rather than incidental, and are commented
where they live:

- **Wire capture** hooks `configuration.fetch` on `ChatOpenAI` rather than
  patching `window.fetch`, which would also swallow the arXiv and OpenAlex
  traffic and make the capture impossible to reason about.
- **The event log** is a plain array with a single reactive version counter. A
  run emits thousands of frames; proxying each one would cost more than rendering
  them.
- **Binary assets** live in IndexedDB addressed by path, not in the graph state —
  a 1024×1024 PNG is ~950KB of base64, and state is serialized into every
  checkpoint.
- **`AsyncLocalStorage`** does not exist in a browser, and LangGraph's
  `interrupt()` reads its config from one. The shim deliberately never unwinds.

<br>

## Built by

[Neo Mohsenvand](https://github.com/NeoVand) · [LinkedIn](https://www.linkedin.com/in/mohsenvand/)
