# AGENTS.md

## Codex rules
- Use `$project-workflow` for non-trivial changes; if unavailable, follow `.agents/skills/project-workflow/SKILL.md` manually.
- Keep this file under 80 lines; move detail to `docs/ai/` or skills.
- Compound workflow is for bootstrap/hardening; once project facts, commands, and checks are known, use iteration mode by default.
- Inspect existing patterns before editing. Do not invent commands, architecture, or facts.
- For large diffs/logs/fixtures/repo inventories, inspect compact summaries first (`git diff --stat`, targeted `rg`, test summaries).
- Plan only when ambiguity, coordination cost, or blast radius justifies it. Ask only blocking questions.
- Hard stops require explicit approval: destructive operations, secrets, auth/security boundaries, migrations, production deploys, external writes, payments/trading/account/order actions, or irreversible data changes.
- Run the narrowest relevant checks first, then broader relevant checks before final.
- Update instructions only from validated evidence; record rejected/obsolete ideas in `docs/ai/rejected-edits.md`.
- For substantial work, final responses should name changed files, checks run/skipped, and known risks/follow-up.

## Project commands
- Install: `npm install`
- Dev: `npm run dev` (web `127.0.0.1:5173`, server `127.0.0.1:5174`)
- Test: `npm test`
- Lint/typecheck/build: `npm run lint`, `npm run typecheck`, `npm run build`

## Project facts
- Stack: npm workspaces, TypeScript, Express backend, Vite React frontend, shared API types.
- Key dirs: `apps/server`, `apps/web`, `packages/shared`, `.agents/`, `docs/ai/`.
- Risk areas: original build overwrite prevention, local-only file handling, PoB2 settings token secrecy, PoB2 calculation parity, custom DPS model assumptions.
