# Slot Family Audit - 2026-06-12

Purpose: reduce Phase 5 slot-rule risk by checking PoB2 base-family data against the parser's weapon/offhand inference.

Source inspected: `D:\Games\Path of Building Community (PoE2)\Data\Bases`.

Command shape:

```powershell
$baseRoot = 'D:\Games\Path of Building Community (PoE2)\Data\Bases'
Get-ChildItem -LiteralPath $baseRoot -File | ForEach-Object {
  $text = Get-Content -LiteralPath $_.FullName -Raw
  $types = [regex]::Matches($text, 'type\s*=\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  $weaponCount = ([regex]::Matches($text, 'weapon\s*=\s*\{')).Count
  $twohandCount = ([regex]::Matches($text, 'twohand\s*=\s*true')).Count
  $offhandCount = ([regex]::Matches($text, '(shield|focus|quiver)\s*=\s*true')).Count
  [pscustomobject]@{ File=$_.Name; Types=($types -join ', '); WeaponEntries=$weaponCount; TwoHandTags=$twohandCount; OffhandTags=$offhandCount }
}
```

Findings:
- `talisman.lua` has type `Talisman`, 31 weapon entries, and 31 `twohand = true` tags.
- `fishing.lua` has type `Fishing Rod`, 1 weapon entry, and 1 `twohand = true` tag; the base is also tagged `not_for_sale`.
- Existing supported offhand families remain `Shield`, `Focus`, and `Quiver`.
- `incursionlimb.lua`, `flask.lua`, and `jewel.lua` are not currently equipment slots in the app's supported comparison scope.

Action taken:
- Added parser recognition for `Talisman`, `Talismans`, `Fishing Rod`, and `Fishing Rods` as Weapon 1 / Weapon 1 Swap candidates.
- Added two-handed offhand-clearing behavior for those families.
- Added representative fixture coverage for prefixed item class text and trade-site-style talisman text.

Remaining TODO:
- Replace or supplement representative talisman/fishing rod samples with exact copied trade/game text if users report formatting differences.
