---
name: project-workflow
description: Use for non-trivial features, bugs, refactors, tests, reviews, PR prep, or fuzzy work. Bootstrap/harden when repo facts or risk are unclear; otherwise iterate fast with targeted validation and narrow hard stops.
---

# Project Workflow

## Modes
- Bootstrap/hardening: use while repo facts, commands, checks, or risks are unclear.
- Iteration: default once the repo is coherent; inspect, edit, focused check, diff review, final.
- Hard stop: pause only for explicit approval triggers.

## Iteration default
- Non-trivial means inspect and validate more carefully, not automatic ceremony.
- Prefer repo evidence: code, tests, docs, `docs/ai/project.md`, and current git state.
- Use compact views first: targeted `rg`, `git diff --stat`, test summaries, and short file reads.
- Plan in chat or a saved file only when it reduces ambiguity, coordination cost, or blast radius.
- Validate with the narrowest useful checks first; broaden only when the change touches shared contracts or risky behavior.
- For UI, check real flows, empty/loading/error states, copy, responsiveness, and obvious visual glitches.
- Do not create routine reviewer packets, saved plans, or learning files just because work happened.

## Hard stops
- Get explicit approval before destructive operations, secrets, auth/security boundary changes, migrations, production deploys, external writes, payments, trading/account/order actions, or irreversible data changes.
- If ordinary iteration touches a hard stop, pause only that item and continue the safe remainder.

## Instruction updates
- Treat `AGENTS.md` and this skill as compact trainable state.
- Update only from validated evidence: repeated failure, confirmed review issue, discovered command, validated pattern, or repeated user preference.
- Prefer tests/scripts/checks/docs over manual burden.
- Keep `AGENTS.md` under 80 lines and this skill under 160 lines.
- Put reusable lessons in `docs/ai/learnings/YYYY-MM-DD-topic.md`; record rejected/obsolete edits in `docs/ai/rejected-edits.md`.

## Final response
- Substantial work: summary, files changed, checks run/skipped, risks/open items.
- Tiny work: be concise.
- Mention learning captured only when one was added.
