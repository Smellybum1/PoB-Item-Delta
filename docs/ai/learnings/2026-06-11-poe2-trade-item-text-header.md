---
date: 2026-06-11
topic: PoE2 trade item text can omit rarity labels
trigger: User pasted official trade-site staff text beginning with item name, base type, and item class, and the app rejected it for missing `Rarity:`.
evidence: `apps/server/src/pob/itemText.ts` now accepts header-only trade text such as `Corruption Pillar` / `Pyrophyte Staff` / `Staff`; `apps/server/src/__tests__/tempEquip.test.ts` covers temp equip from that format.
---

# Learning

- Official PoE2 trade-site copied text may omit both `Item Class:` and `Rarity:` labels.
- For this format, read the first line as item name, the second as base type, and a slot-like third line as item class.
- Drop the standalone class line before writing the temporary PoB item text, because PoB item text expects rarity, name, base, then item details.
- If rarity is missing but name/base are present, assume `RARE` and surface a warning instead of rejecting the paste.

# Guidance

- Parser errors should say what the user can fix, not expose internal required fields.
- Keep exact real-world pasted samples as regression fixtures whenever a user hits a trade-site parsing failure.
