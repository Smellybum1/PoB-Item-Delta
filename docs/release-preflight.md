# Release Preflight

Run this before sharing a zip or publishing a GitHub release.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1
```

The preflight is read-only. It checks:

- release-required docs, launchers, support scripts, and issue templates exist in the repo;
- the release zip exists;
- the zip includes built server/web assets, built support inspector entrypoints, built build-scan support, and required user docs;
- the zip manifest matches the package version and local URL;
- the candidate workspace and zip do not include obvious local/private files such as `.env`, logs, temp folders, PoB `Settings.xml`, or non-fixture XML builds;
- `node_modules` and `runtime/node` are accepted only when the release manifest marks them as intentional packaged runtime/dependency contents.

For CI or copyable notes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1 -Json
```

Before asking for publish approval, run the read-only GitHub release readiness helper too:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1
```

It checks the local release zips, preflight results, expected GitHub remote/tag state, remote tag availability, generated-path git visibility, a temp-only build coverage scanner smoke including path-sanitized Markdown output, release-notes preview assets/checksums, and lists the external writes that still need explicit approval. Use `-SkipRemote` only for offline dry-runs.

The GitHub `CI` workflow mirrors the local gate on Windows after push: install dependencies, run tests, build the app, build lean and portable release zips, run both preflights, run release readiness with `-SkipRemote`, print the asset summary, print the release notes preview, and print the publish approval packet with `-SkipRemote`. The readiness dry-run includes a synthetic build coverage scanner smoke with a nested fixture, an intentionally unreadable XML file, and Markdown output that must not expose the temp builds path. CI is not a publish step; commits, tags, and release assets still require explicit approval.

For a copyable release body with the latest checksum table:

```powershell
npm run release:notes
```

For a read-only approval packet with the exact publish handoff commands and release asset context:

```powershell
npm run release:packet
```

If it fails after a source/doc change, rebuild the app and regenerate the zip:

```powershell
npm run build
npm run release:zip -- -SkipBuild
npm run release:zip:portable -- -SkipBuild
```
