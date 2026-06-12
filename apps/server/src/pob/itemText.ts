export const equipmentSlots = [
  "Weapon 1",
  "Weapon 2",
  "Weapon 1 Swap",
  "Weapon 2 Swap",
  "Helmet",
  "Body Armour",
  "Gloves",
  "Boots",
  "Belt",
  "Ring 1",
  "Ring 2",
  "Amulet"
] as const;

export type EquipmentSlot = (typeof equipmentSlots)[number];

export interface ParsedItemText {
  itemClass: string | null;
  rarity: string | null;
  name: string | null;
  baseType: string | null;
  normalizedText: string;
  compatibleSlots: EquipmentSlot[];
  clearsSlots: EquipmentSlot[];
  warnings: string[];
}

interface ItemHeader {
  itemClass: string | null;
  rarity: string | null;
  name: string | null;
  baseType: string | null;
  itemClassLineIndex: number | null;
  assumedRarity: boolean;
}

const slotAliases = new Map<string, EquipmentSlot>([
  ["weapon1", "Weapon 1"],
  ["weapon 1", "Weapon 1"],
  ["main hand", "Weapon 1"],
  ["mainhand", "Weapon 1"],
  ["weapon2", "Weapon 2"],
  ["weapon 2", "Weapon 2"],
  ["off hand", "Weapon 2"],
  ["offhand", "Weapon 2"],
  ["shield", "Weapon 2"],
  ["focus", "Weapon 2"],
  ["quiver", "Weapon 2"],
  ["weapon1swap", "Weapon 1 Swap"],
  ["weapon 1 swap", "Weapon 1 Swap"],
  ["swap weapon 1", "Weapon 1 Swap"],
  ["main hand swap", "Weapon 1 Swap"],
  ["mainhand swap", "Weapon 1 Swap"],
  ["weapon2swap", "Weapon 2 Swap"],
  ["weapon 2 swap", "Weapon 2 Swap"],
  ["swap weapon 2", "Weapon 2 Swap"],
  ["off hand swap", "Weapon 2 Swap"],
  ["offhand swap", "Weapon 2 Swap"],
  ["shield swap", "Weapon 2 Swap"],
  ["focus swap", "Weapon 2 Swap"],
  ["quiver swap", "Weapon 2 Swap"],
  ["helm", "Helmet"],
  ["helmet", "Helmet"],
  ["body", "Body Armour"],
  ["body armour", "Body Armour"],
  ["chest", "Body Armour"],
  ["glove", "Gloves"],
  ["gloves", "Gloves"],
  ["boot", "Boots"],
  ["boots", "Boots"],
  ["belt", "Belt"],
  ["ring1", "Ring 1"],
  ["ring 1", "Ring 1"],
  ["left ring", "Ring 1"],
  ["ring2", "Ring 2"],
  ["ring 2", "Ring 2"],
  ["right ring", "Ring 2"],
  ["amulet", "Amulet"]
]);

export function importItemText(itemText: string): ParsedItemText {
  const lines = itemText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isSeparator(line));

  const header = readItemHeader(lines);
  const { itemClass, rarity, name, baseType } = header;
  const compatible = inferCompatibleSlots(itemClass, baseType);
  const clearsSlots = shouldClearOffhand(itemClass, baseType, compatible) ? (["Weapon 2", "Weapon 2 Swap"] satisfies EquipmentSlot[]) : [];
  const normalizedText = normalizeItemText(lines, header);
  const warnings: string[] = [];

  if (header.assumedRarity) {
    warnings.push("Trade text did not include rarity; assuming Rare for the temporary PoB item.");
  }
  if (clearsSlots.length > 0) {
    warnings.push("Two-handed weapon candidates clear the paired offhand when equipped in Weapon 1 or Weapon 1 Swap.");
  }
  if (compatible.length === 0) {
    warnings.push("Could not infer compatible equipment slots from item class or base type.");
  }

  return {
    itemClass,
    rarity,
    name,
    baseType,
    normalizedText,
    compatibleSlots: compatible,
    clearsSlots,
    warnings
  };
}

export function normalizeSlotName(slotName: string): EquipmentSlot | null {
  const normalized = slotName.trim().toLowerCase();
  return slotAliases.get(normalized) ?? equipmentSlots.find((slot) => slot.toLowerCase() === normalized) ?? null;
}

function readItemHeader(lines: string[]): ItemHeader {
  const prefixedItemClass = readPrefixedValue(lines, "Item Class:");
  const rarityIndex = lines.findIndex((line) => line.toLowerCase().startsWith("rarity:"));
  if (rarityIndex >= 0) {
    const name = readHeaderTextLine(lines[rarityIndex + 1] ?? null);
    const baseType = readHeaderTextLine(lines[rarityIndex + 2] ?? null);
    return {
      itemClass: prefixedItemClass,
      rarity: normalizeRarity(lines[rarityIndex] ?? ""),
      name,
      baseType,
      itemClassLineIndex: null,
      assumedRarity: false
    };
  }

  const headerLines = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => !entry.line.toLowerCase().startsWith("item class:"));
  const itemClassCandidate = headerLines[2]?.line ?? null;
  const itemClassFromHeader = itemClassCandidate && looksLikeItemClassLine(itemClassCandidate) ? itemClassCandidate : null;
  const name = readHeaderTextLine(headerLines[0]?.line ?? null);
  const baseType = readHeaderTextLine(headerLines[1]?.line ?? null);

  return {
    itemClass: prefixedItemClass ?? itemClassFromHeader,
    rarity: name && baseType ? "RARE" : null,
    name,
    baseType,
    itemClassLineIndex: itemClassFromHeader ? (headerLines[2]?.index ?? null) : null,
    assumedRarity: Boolean(name && baseType)
  };
}

function normalizeItemText(lines: string[], header: ItemHeader): string {
  const itemLines = lines.filter((line, index) => !line.toLowerCase().startsWith("item class:") && index !== header.itemClassLineIndex);
  if (header.rarity && !header.assumedRarity) {
    const adjustedRarityIndex = itemLines.findIndex((line) => line.toLowerCase().startsWith("rarity:"));
    if (adjustedRarityIndex >= 0) {
      itemLines[adjustedRarityIndex] = `Rarity: ${header.rarity}`;
    }
  }
  if (header.rarity && header.assumedRarity) {
    itemLines.unshift(`Rarity: ${header.rarity}`);
  }
  return itemLines.join("\n");
}

function inferCompatibleSlots(itemClass: string | null, baseType: string | null): EquipmentSlot[] {
  const haystack = `${itemClass ?? ""} ${baseType ?? ""}`.toLowerCase();

  if (/\bring(s)?\b/.test(haystack)) {
    return ["Ring 1", "Ring 2"];
  }
  if (/\bamulet(s)?\b/.test(haystack)) {
    return ["Amulet"];
  }
  if (/\bbelt(s)?\b/.test(haystack)) {
    return ["Belt"];
  }
  if (/\b(glove|gloves|bracer|bracers|gauntlet|gauntlets|mitt|mitts)\b/.test(haystack)) {
    return ["Gloves"];
  }
  if (/\b(boot|boots|sandal|sandals|shoe|shoes|greave|greaves)\b/.test(haystack)) {
    return ["Boots"];
  }
  if (/\b(helmet|helm|hood|mask|crown|tiara|circlet)\b/.test(haystack)) {
    return ["Helmet"];
  }
  if (/\b(body armour|body armours|armour|armor|raiment|robe|vestment|garb|jacket|coat|mail)\b/.test(haystack)) {
    return ["Body Armour"];
  }
  if (/\b(shield|shields|focus|foci|quiver|quivers)\b/.test(haystack)) {
    return ["Weapon 2", "Weapon 2 Swap"];
  }
  if (isWeaponText(haystack)) {
    return ["Weapon 1", "Weapon 1 Swap"];
  }

  return [];
}

function isWeaponText(haystack: string): boolean {
  return /\b(staff|staves|bow|bows|crossbow|crossbows|wand|wands|sceptre|sceptres|scepter|scepters|mace|maces|sword|swords|axe|axes|dagger|daggers|claw|claws|spear|spears|flail|flails|talisman|talismans|quarterstaff|quarterstaves|fishing\s*rod|fishing\s*rods|trap\s*tool|trap\s*tools|traptool|traptools|trap|traps)\b/.test(
    haystack
  );
}

function shouldClearOffhand(itemClass: string | null, baseType: string | null, compatibleSlots: EquipmentSlot[]): boolean {
  if (!compatibleSlots.includes("Weapon 1")) {
    return false;
  }
  const haystack = `${itemClass ?? ""} ${baseType ?? ""}`.toLowerCase();
  return /\b(two hand|two-hand|staff|staves|bow|bows|crossbow|crossbows|talisman|talismans|quarterstaff|quarterstaves|fishing\s*rod|fishing\s*rods|trap\s*tool|trap\s*tools|traptool|traptools|trap|traps)\b/.test(haystack);
}

function looksLikeItemClassLine(line: string): boolean {
  return !line.includes(":") && inferCompatibleSlots(line, null).length > 0;
}

function readPrefixedValue(lines: string[], prefix: string): string | null {
  const line = lines.find((candidate) => candidate.toLowerCase().startsWith(prefix.toLowerCase()));
  return line?.slice(prefix.length).trim() || null;
}

function readHeaderTextLine(line: string | null): string | null {
  if (!line || isMetadataLine(line)) {
    return null;
  }
  return line;
}

function isMetadataLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.includes(":") ||
    normalized === "corrupted" ||
    normalized === "mirrored" ||
    normalized === "unidentified" ||
    normalized.startsWith("forged by ")
  );
}

function normalizeRarity(line: string): string {
  return line.replace(/rarity:/i, "").trim().toUpperCase();
}

function isSeparator(line: string): boolean {
  return /^-+$/.test(line);
}
