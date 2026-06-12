import type { DeltaCalculationStatus, DeltaReport, ImportantStat, StatDeltaRow } from "@pob-item-delta/shared";

interface CompareStatsOptions {
  beforeStats: ImportantStat[];
  afterStats: ImportantStat[];
  selectedSkillLabel: string | null;
  calculationStatus?: DeltaCalculationStatus;
  sourceLabel?: string;
  valueNote?: string;
  warnings?: string[];
}

const cachedXmlNote =
  "XML-first mode cannot recalculate PoB after equipping yet; this after value is copied from cached stats in the temporary build XML.";
const cachedXmlWarnings = [
  "PoB-native recalculation is not available in the XML-first MVP. Deltas stay zero unless the saved XML already contains changed cached stats."
];

export function compareStats(options: CompareStatsOptions): DeltaReport {
  const beforeByKey = mapStats(options.beforeStats);
  const afterByKey = mapStats(options.afterStats);
  const orderedKeys = [...beforeByKey.keys(), ...[...afterByKey.keys()].filter((key) => !beforeByKey.has(key))];
  const valueNote = options.valueNote ?? cachedXmlNote;

  const rows: StatDeltaRow[] = orderedKeys.map((key) => {
    const before = beforeByKey.get(key);
    const after = afterByKey.get(key);
    const beforeValue = before?.value ?? null;
    const afterValue = after?.value ?? null;

    return {
      key,
      label: before?.label ?? after?.label ?? key,
      before: beforeValue,
      after: afterValue,
      delta: numericDelta(beforeValue, afterValue),
      status: before && after ? "available" : "missing",
      note: before && after ? valueNote : "This stat was missing from one side of the comparison."
    };
  });

  return {
    calculationStatus: options.calculationStatus ?? "cached-xml-not-recalculated",
    sourceLabel: options.sourceLabel ?? "Cached XML stats",
    selectedSkillLabel: options.selectedSkillLabel,
    rows,
    warnings: options.warnings ?? cachedXmlWarnings
  };
}

function mapStats(stats: ImportantStat[]): Map<string, ImportantStat> {
  return new Map(stats.map((stat) => [stat.key, stat]));
}

function numericDelta(before: number | string | null, after: number | string | null): number | null {
  if (typeof before !== "number" || typeof after !== "number") {
    return null;
  }

  return after - before;
}
