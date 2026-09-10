# PROMPTS

AI assistance was used throughout this repository, per the brief's request to show
how. No AI service was consulted for the business rules: the Meridian `$semantics`
block, the vendor SDK behaviour, and the latency/resilience contracts were
implemented strictly from `Task.pdf` and `starter/`.

## How it was used

- **Planning**: the entire feature was driven through the Spec Kit workflow —
  specification (`spec.md`), plan with technical research (`research.md`, including
  the SSE-over-POST decision, seed-ordering trap, deadline-budget arithmetic, and
  per-component FX conversion), and a task list (`tasks.md`).
- **Implementation**: each task was executed top-down against the plan: the NestJS
  API, Prisma schema and seed, shared Zod schemas, the Meridian pricing engine,
  the SwiftPost/Atlas adapters, the streaming controller, the React/RHF/Tailwind
  frontend, the bench script, and the docker-compose delivery.
- **Exactness tests**: boundary cases were hand-computed from the rate card and
  written as tests first; where a computed expectation disagreed with the engine
  (one transit date, one handling-fee case), the engine's result was re-derived by
  hand against `$semantics` and the test corrected only when the engine proved
  right.
- **Debugging**: the sandbox had no Docker, so the stack was validated against the
  stakeholder's hosted PostgreSQL (Aiven) with the real compiled server; the AI
  diagnosed duplicate-React resolution, tsx's missing decorator metadata, Vite
  CJS-export interop, the per-worker seed-import trap, and the latency regression
  caused by awaiting remote-DB writes before streaming (fixed by running
  persistence behind the stream).

## Files where AI wrote the majority of the code

`apps/api/src/**` (auth, carriers, meridian, quotes, common), `apps/web/src/**`,
`packages/shared/src/schemas.ts`, `scripts/bench.ts`, `docker-compose.yml`,
`README.md`, and the specification documents under `specs/001-quick-quote-engine/`.

## Human review

Every decision above was reviewed for correctness against the brief before landing;
the AI was treated as a pair programmer whose output is checked, not trusted.