# CoC Frost Model Validation

The CoC Frostbolt/Frost Wall panel is optional and assumption-driven. Use it for directional checks until repeated observations show the assumptions match your build.

## Copy A Validation Report

1. Save your current build in PoB2 and refresh PoB Item Delta.
2. Create a temp copy for the item you want to compare.
3. Enable `CoC Frost Model`.
4. Enter the assumptions you want to test.
5. Click `Copy validation report`.
6. Paste it into notes or a GitHub build-validation issue.

The report includes safe build context, current assumptions, model output, formula notes, blank fields for observations, and repeat-sample result rows. It does not upload anything.

## Inspect A Saved Report

Save the copied report to a local `.md` file outside the repo, or under an ignored folder such as `fixtures/local/`.

Run:

```powershell
npm run inspect:coc-report -- <report.md>
```

The inspector checks whether the report still has TODO observation fields, whether the model profile can be parsed, whether the copied assumptions reproduce the copied modeled DPS, and whether any numeric expected/actual result is above or below the model. If repeat-sample rows are filled, it also summarizes completed sample count and an aggregate verdict. It prints formula-review verdicts:

- `missing-comparison`: numeric expected/actual results are not ready.
- `close-match`: observed result is within 10% of the model; keep collecting repeat samples before marking confidence validated.
- `moderate-difference`: observed result differs by 10-25%; recheck assumptions and collect more samples.
- `model-mismatch`: observed result differs by more than 25%; treat the model as rough and revise assumptions or formula notes.

Use `npm run inspect:coc-report -- --json <report.md>` for the full local inspection result.

The normal text output also includes a copyable GitHub issue snippet so repeatable model observations can be reported with the same fields each time.

Release zips include the built inspector. In a fresh source checkout, run `npm run build` before using the inspector if `apps/server/dist/` does not exist yet.

In the portable Windows zip, if `npm` is not on PATH, run the same command through the bundled runtime:

```powershell
.\runtime\node\npm.cmd run inspect:coc-report -- <report.md>
```

## What To Observe

Useful observations include:

- Frostbolt casts per second;
- Frostbolt crit chance;
- average Frostbolt collisions per cast;
- average Frostbolt explosions hitting the boss;
- triggered spell triggers per second;
- target or boss size/profile;
- measured DPS, kill time, or boss health movement.

Use repeatable tests where possible: same build, same item, same boss, same buffs, same PoB config, and multiple samples. Fill `Sample 1`, `Sample 2`, and `Sample 3` expected/actual rows when you have repeat runs; the inspector averages completed rows so one lucky or unlucky run does not drive the formula decision.

## Confidence Labels

- `Rough`: directional estimate; assumptions are player-entered and not yet checked.
- `Experimental`: formula or assumptions are being tested and may change.
- `Validated`: repeated observations support the assumptions closely enough for this build/profile.

Do not mark a profile as `Validated` after one run. Keep notes with the copied report so the formula can be revised when evidence disagrees.
