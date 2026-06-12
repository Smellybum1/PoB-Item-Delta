# Portable Runtime QA: 0.1.0

Date: 2026-06-12

Scope: verify the larger Windows portable zip can run without Node.js or npm on `PATH`.

## Official Runtime

- Source: official Node.js distribution archive from `https://nodejs.org/dist/v24.16.0/`.
- Runtime archive: `node-v24.16.0-win-x64.zip`.
- SHA256 verified against official `SHASUMS256.txt`.
- Verified SHA256: `edaca9bd58ec8e92037dac4e877d52f6b8f430b81c18b57e264b4e2fb111cd56`.

## Artifact

- Portable zip: `output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip`.
- Build command: `npm run release:zip:portable -- -SkipBuild`.
- Includes portable Node runtime: yes.
- Includes staged npm dependencies: yes.
- Preflight status: pass.

## Clean Extraction Smoke

- Extracted the final portable zip to `output/portable-final-smoke`.
- Confirmed extracted files include:
  - `runtime/node/node.exe`,
  - `runtime/node/npm.cmd`,
  - `node_modules/express/package.json`,
  - `tools/windows/Start-PoB-Item-Delta.cmd`.
- Started from the clean extraction with `PATH` limited to Windows and PowerShell folders, so Node/npm were not available from PATH.
- Started on `127.0.0.1:5199`.
- Passed: `/api/health` returned `{"status":"ok"}`.
- Passed: `/` returned HTTP 200 and contained the PoB Item Delta UI.
- Passed: stop helper stopped the server and the health endpoint stopped responding.

## Result

Status: pass.

The portable Windows zip can be treated as the easiest friend-facing artifact. The lean zip remains available for users who already have Node.js LTS installed.
