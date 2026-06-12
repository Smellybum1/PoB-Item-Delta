# Real Item Sample Workflow

Use this when a pasted PoE2 trade item does not parse, equips into the wrong slot, produces confusing replacement behavior, or should be preserved as an exact real-world fixture sample.

## From The App

1. Paste the exact copied item text into Trade item text.
2. Choose the intended slot.
3. Click Copy item report if you only need to preserve the exact pasted sample.
4. Click Create temp copy if you also need to check equip/replacement behavior.
5. If parsing fails or the successful parse should become fixture evidence, click Copy item report.
6. Save the copied report as a local note or paste it into the issue/thread.

The report includes:

- build status, build name, build file name, selected skill, active weapon set, and selected slot,
- the player-facing parser error when one was shown, or a note that no parser error was shown,
- the exact pasted item text.

The app does not upload the report. It only copies text to the local clipboard.

## Turning A Report Into A Fixture

1. Save the copied report to a local `.md` file outside the repo, or under an ignored folder such as `fixtures/local/`.
2. Inspect it with `npm run inspect:item-report -- <report.md>`.
3. Use the inspector's copyable GitHub issue snippet if the sample should be reported before it becomes a fixture.
4. Use the inspector's copyable fixture entry as the starting point for `apps/server/src/__fixtures__/itemTextSamples.ts`.
5. Use the inspector's copyable test case hint as the starting point for a focused parser/slot test in `apps/server/src/__tests__/tempEquip.test.ts`.
6. If the paste reveals a new item family, update `apps/server/src/pob/itemText.ts` with the smallest compatible rule.
7. Run `npm test`.
8. Update `ROADMAP.md` only when coverage changes materially.

The inspector accepts either a full Copy item report or raw copied item text. It prints the parsed item name, base type, compatible slots, offhand-clearing behavior, warnings, a suggested fixture key, a copyable fixture entry, a copyable test-case hint, and a copyable GitHub issue snippet. Use `npm run inspect:item-report -- --json <report.md>` if you need the full local inspection result, including the exact item text.

Release zips include the built inspector. In a fresh source checkout, run `npm run build` before using the inspector if `apps/server/dist/` does not exist yet.

In the portable Windows zip, if `npm` is not on PATH, run the same command through the bundled runtime:

```powershell
.\runtime\node\npm.cmd run inspect:item-report -- <report.md>
```

## Privacy Notes

- Keep account names, character names, and full local filesystem paths out of committed fixtures unless they are essential to the bug.
- Do keep the item text exact when the parser issue depends on formatting, separators, metadata order, or unusual modifiers.
