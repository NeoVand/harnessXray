# SIGReg live integration test

Tested locally on 19 September 2026 after pushing upgrade commit
`cc9f145824c563256d6fe3d76568bf3a57b41af9`. Real API requests used the
development environment credential; no credential is included in this report.

## Result

The application completed a SIGReg/LeJEPA report and three original images:
a mechanism infographic, an evidence timeline, and a conceptual cover.
The revised report covers the original LeJEPA paper and three 2026 follow-ups:
[Weak-SIGReg](https://arxiv.org/abs/2603.05924),
[UR–JEPA](https://arxiv.org/abs/2606.01443), and
[Regularize or Localize](https://arxiv.org/abs/2607.17019).

The run exercised paper-reader, report-writer, critic, and image-smith
delegation; outline approval; image approval and edit-before-approval;
paper retrieval; file writing; and persistence across a browser reload.

All five image requests used `gpt-image-2.5-flare` successfully: three
generations took 19.5, 20.1, and 17.1 seconds; two edits took 19.6 and 19.9
seconds. The final three assets are 1536 × 1024. Progressive frames arrived
during generation. The application meter recorded 124 text calls and five
image calls across the initial and corrective turns, estimating $2.70.
This is not a billing total: the meter explicitly leaves image input unpriced.

Local, ignored outputs are in `test-results/sigreg-live/`: `report.html`,
`paper/sigreg-report.md`, `figures/`, and compact `evidence.json`. The HTML
export uses local image files and KaTeX assets and requires no API key.

## Bugs fixed during the test

- OpenAlex searches filtered to `type:article`, excluding preprints. They now
  include `article|preprint`; the cache key changes too, so old article-only
  results cannot mask the fix. Six recorded demo search responses were refreshed.
- LaTeXML display equations outside paragraphs were dropped, and inline
  MathML could concatenate rendered symbols with TeX annotations. Extraction
  now preserves one TeX representation in reading order, including display math.
- LeJEPA's HTML page title contains a figure caption. The parser now recognizes
  its custom document title block before falling back to the page title.
- Author extraction now removes affiliation superscripts and rejects email
  addresses. This is a targeted improvement, not a complete metadata normalizer.

Four regression tests cover these cases. The resulting suite passes 219 tests
across 31 files; type checking reports no errors or warnings.

## Interventions and remaining limitations

This was a supervised integration test, not an autonomous research benchmark.
The first report missed recent follow-ups. After repairing search, the test
supplied three primary paper IDs and requested a revised report. Coverage remains
targeted and non-exhaustive.

The first delegation dropped the instruction not to extract publisher figures;
readers extracted them and the critic requested their inclusion. The corrective
turn repeated the constraint in each delegation. The final report contains
exactly the three original generated visuals. Per-task constraints need reliable
propagation before adding more dynamic delegation.

The first timeline edit returned successfully but omitted UR–JEPA. Visual
inspection caught this, and a second corrective edit through the application's
image-edit function restored all seven requested timeline entries. A successful
image API response does not establish completeness or factual accuracy.

Malformed source author metadata produced bad citations in an intermediate
draft; the final writer/critic pass corrected the report's references. The final
report is about 1,915 whitespace-delimited words, below the test prompt's
2,000–2,500-word target despite its completion claim. Completion needs checks
against explicit requirements, beyond the critic's `CLEAN` response.

The test driver initially imported a second development session module, then
switched to the application's existing session and restored the test images to
the active thread. This was a test setup issue. Final report and image persistence
were verified after reload using the application's actual session.

The next research features should therefore prioritize inherited task constraints,
an evidence ledger and coverage checks, and image verification. Dynamic subagents
can support those workflows, but adding more workers alone will not fix them.
