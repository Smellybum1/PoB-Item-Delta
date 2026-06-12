export type CurrentBuildStatus =
  | "ready"
  | "missing-settings"
  | "not-build-mode"
  | "missing-build-path"
  | "build-file-missing"
  | "parse-error";

export interface ImportantStat {
  key: string;
  label: string;
  value: number | string;
}

export interface EquippedSlotSummary {
  slot: string;
  itemId: string;
  itemName: string | null;
  baseType: string | null;
  rarity: string | null;
}

export interface CurrentBuildResponse {
  status: CurrentBuildStatus;
  message: string;
  settingsPath: string;
  mode: string | null;
  buildPath: string | null;
  buildName: string | null;
  fileName: string | null;
  lastModified: string | null;
  sizeBytes: number | null;
  character: {
    className: string | null;
    ascendClassName: string | null;
    level: number | null;
  } | null;
  selectedSkill: {
    mainSocketGroup: number | null;
    activeSkillSet: number | null;
    label: string | null;
  } | null;
  skillOptions: BuildSkillOption[];
  activeWeaponSet: BuildWeaponSet | null;
  stats: ImportantStat[];
  slots: EquippedSlotSummary[];
  warnings: string[];
}

export interface BuildSkillSelection {
  activeSkillSet: number;
  mainSocketGroup: number;
}

export interface BuildSkillOption extends BuildSkillSelection {
  label: string;
  enabled: boolean;
}

export type BuildWeaponSet = "primary" | "swap";

export interface TempEquipRequest {
  itemText: string;
  selectedSkill?: BuildSkillSelection;
  selectedWeaponSet?: BuildWeaponSet;
  slotName: string;
}

export interface CandidateItemSummary {
  itemClass: string | null;
  rarity: string | null;
  name: string | null;
  baseType: string | null;
  compatibleSlots: string[];
  clearsSlots: string[];
}

export interface ItemTextSnapshot {
  itemName: string | null;
  baseType: string | null;
  rarity: string | null;
  text: string | null;
}

export interface ItemTextComparison {
  slot: string;
  current: ItemTextSnapshot;
  candidate: ItemTextSnapshot;
}

export type DeltaCalculationStatus = "cached-xml-not-recalculated" | "pob-lua-recalculated";

export interface StatDeltaRow {
  key: string;
  label: string;
  before: number | string | null;
  after: number | string | null;
  delta: number | null;
  status: "available" | "missing";
  note: string;
}

export interface DeltaReport {
  calculationStatus: DeltaCalculationStatus;
  sourceLabel: string;
  selectedSkillLabel: string | null;
  rows: StatDeltaRow[];
  warnings: string[];
}

export interface TempEquipResponse {
  sourceBuildPath: string;
  tempBuildPath: string;
  selectedWeaponSet: BuildWeaponSet | null;
  candidateItemId: string;
  equippedSlot: string;
  clearedSlots: string[];
  candidate: CandidateItemSummary;
  itemComparison: ItemTextComparison;
  comparison: DeltaReport;
  warnings: string[];
}

export interface RecalculateTempBuildRequest {
  sourceBuildPath: string;
  selectedSkill?: BuildSkillSelection;
  selectedWeaponSet?: BuildWeaponSet;
  tempBuildPath: string;
}

export interface RecalculateTempBuildResponse {
  sourceBuildPath: string;
  tempBuildPath: string;
  comparison: DeltaReport;
  warnings: string[];
}

export interface SaveTempBuildRequest {
  sourceBuildPath: string;
  tempBuildPath: string;
  confirmOverwrite: boolean;
}

export interface SaveTempBuildResponse {
  sourceBuildPath: string;
  tempBuildPath: string;
  backupBuildPath: string;
  savedAt: string;
  bytesWritten: number;
  tempDeleted: boolean;
  warnings: string[];
  message: string;
}

export interface SaveTempBuildAsNewRequest {
  sourceBuildPath: string;
  tempBuildPath: string;
}

export interface SaveTempBuildAsNewResponse {
  sourceBuildPath: string;
  tempBuildPath: string;
  newBuildPath: string;
  savedAt: string;
  bytesWritten: number;
  warnings: string[];
  message: string;
}

export interface BuildBackupSummary {
  backupBuildPath: string;
  fileName: string;
  createdAt: string | null;
  lastModified: string;
  sizeBytes: number;
}

export interface ListBuildBackupsResponse {
  sourceBuildPath: string;
  backups: BuildBackupSummary[];
  warnings: string[];
}

export interface RestoreBuildBackupRequest {
  sourceBuildPath: string;
  backupBuildPath: string;
  confirmRestore: boolean;
}

export interface RestoreBuildBackupResponse {
  sourceBuildPath: string;
  backupBuildPath: string;
  preRestoreBackupBuildPath: string;
  restoredAt: string;
  bytesWritten: number;
  warnings: string[];
  message: string;
}

export interface OpenTempBuildInPobRequest {
  sourceBuildPath: string;
  tempBuildPath: string;
}

export interface OpenTempBuildInPobResponse {
  sourceBuildPath: string;
  tempBuildPath: string;
  pobCommand: string;
  processId: number | null;
  openedAt: string;
  warnings: string[];
  message: string;
}

export interface AppSettingsResponse {
  enableLuaBridge: boolean;
  pobInstallPath: string;
  pobSettingsPath: string;
  cocFrostModelProfiles: CocFrostModelProfile[];
  settingsPath: string;
  source: "default" | "file";
  warnings: string[];
}

export interface UpdateAppSettingsRequest {
  enableLuaBridge?: boolean;
  pobInstallPath?: string;
  pobSettingsPath?: string;
  cocFrostModelProfiles?: CocFrostModelProfile[];
}

export type LuaBridgeStatus =
  | "disabled"
  | "missing-command"
  | "missing-fork-path"
  | "missing-wrapper"
  | "runtime-mirror-failed"
  | "configured";

export interface LuaBridgeCheck {
  key: string;
  label: string;
  ok: boolean;
  message: string;
}

export interface LuaBridgeStatusResponse {
  status: LuaBridgeStatus;
  enabled: boolean;
  canAttemptStart: boolean;
  message: string;
  command: string;
  forkPath: string | null;
  wrapperPath: string | null;
  timeoutMs: number;
  checks: LuaBridgeCheck[];
  setupHints: string[];
}

export interface AppDiagnosticsResponse {
  appName: string;
  appVersion: string;
  generatedAt: string;
  localOnly: true;
  server: {
    host: string;
    port: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    webDistReady: boolean;
  };
  build: {
    status: CurrentBuildStatus;
    message: string;
    mode: string | null;
    buildDetected: boolean;
    buildFileName: string | null;
    buildName: string | null;
    characterSummary: string | null;
    selectedSkillLabel: string | null;
    activeWeaponSet: BuildWeaponSet | null;
    statCount: number;
    slotCount: number;
    warnings: string[];
  };
  settings: {
    source: "default" | "file";
    luaBridgeEnabled: boolean;
    pobInstallPathConfigured: boolean;
    pobSettingsPathConfigured: boolean;
    settingsFileConfigured: boolean;
    cocFrostModelProfileCount: number;
    warnings: string[];
  };
  luaBridge: {
    status: LuaBridgeStatus;
    canAttemptStart: boolean;
    checks: Array<{
      key: string;
      label: string;
      ok: boolean;
    }>;
  };
}

export interface BuildCoverageBuildRow {
  file: string;
  selectedSkill: string | null;
  activeSkillSet: number | null;
  mainSocketGroup: number | null;
  skillSetCount: number;
  enabledSkillCount: number;
  activeWeaponSet: BuildWeaponSet;
  hasPrimaryGear: boolean;
  hasSwapGear: boolean;
}

export interface BuildCoverageSkippedFile {
  file: string;
  error: string;
}

export interface BuildCoverageSummary {
  generatedAt: string;
  xmlFileCount: number;
  buildCount: number;
  parseFailureCount: number;
  buildsWithPrimaryGear: number;
  buildsWithSwapGear: number;
  buildsWithMultipleSkillSets: number;
  buildsWithSwapGearAndMultipleSkillSets: number;
  buildsUsingSecondWeaponSet: number;
  buildsWithSwapGearAndSecondWeaponSetActive: number;
  weaponSwapValidationCandidates: BuildCoverageBuildRow[];
  builds: BuildCoverageBuildRow[];
  failedBuilds: BuildCoverageSkippedFile[];
}

export interface BuildCoverageReportResponse {
  generatedAt: string;
  markdown: string;
  summary: BuildCoverageSummary;
  warnings: string[];
}

export type TargetSizeProfile = "small" | "medium" | "large";

export interface CocFrostModelAssumptions {
  frostboltCastsPerSecond: number;
  frostboltCritChancePercent: number;
  averageFrostboltCollisionsPerCast: number;
  averageFrostboltExplosionsHittingBoss: number;
  triggeredSpellTriggersPerSecond: number;
  targetSizeProfile: TargetSizeProfile;
}

export type CocFrostModelConfidence = "rough" | "validated" | "experimental";

export interface CocFrostModelProfile {
  buildPath: string;
  buildName: string | null;
  updatedAt: string;
  confidence: CocFrostModelConfidence;
  assumptions: CocFrostModelAssumptions;
}

export interface CocFrostModelInput {
  pobNativeDps: number | null;
  selectedSkillAverageHit: number | null;
  assumptions: CocFrostModelAssumptions;
}

export interface CocFrostModelResult {
  modelName: "CoC Frostbolt/Frost Wall";
  status: "ready" | "missing-average-hit";
  pobNativeDps: number | null;
  modeledDps: number | null;
  frostboltHitEventsPerSecond: number;
  critGatedTriggerEventsPerSecond: number;
  targetSizeMultiplier: number;
  assumptions: CocFrostModelAssumptions;
  formulaNotes: string[];
}

export const defaultCocFrostModelAssumptions: CocFrostModelAssumptions = {
  frostboltCastsPerSecond: 2.5,
  frostboltCritChancePercent: 90,
  averageFrostboltCollisionsPerCast: 1,
  averageFrostboltExplosionsHittingBoss: 1,
  triggeredSpellTriggersPerSecond: 2.5,
  targetSizeProfile: "medium"
};

const targetSizeMultipliers: Record<TargetSizeProfile, number> = {
  small: 0.75,
  medium: 1,
  large: 1.25
};

export function calculateCocFrostModel(input: CocFrostModelInput): CocFrostModelResult {
  const assumptions = normalizeCocAssumptions(input.assumptions);
  const targetSizeMultiplier = targetSizeMultipliers[assumptions.targetSizeProfile];
  const frostboltHitEventsPerSecond =
    assumptions.frostboltCastsPerSecond *
    (assumptions.averageFrostboltCollisionsPerCast + assumptions.averageFrostboltExplosionsHittingBoss * targetSizeMultiplier);
  const critGatedTriggerEventsPerSecond =
    assumptions.triggeredSpellTriggersPerSecond * (assumptions.frostboltCritChancePercent / 100);
  const selectedSkillAverageHit = normalizeOptionalNumber(input.selectedSkillAverageHit);
  const modeledDps =
    selectedSkillAverageHit === null ? null : selectedSkillAverageHit * (frostboltHitEventsPerSecond + critGatedTriggerEventsPerSecond);

  return {
    modelName: "CoC Frostbolt/Frost Wall",
    status: selectedSkillAverageHit === null ? "missing-average-hit" : "ready",
    pobNativeDps: normalizeOptionalNumber(input.pobNativeDps),
    modeledDps,
    frostboltHitEventsPerSecond,
    critGatedTriggerEventsPerSecond,
    targetSizeMultiplier,
    assumptions,
    formulaNotes: [
      "Assumption-driven rough model: average hit is multiplied by estimated Frostbolt hit events plus crit-gated triggered spell events.",
      "PoB average hit may already include crit scaling; the crit chance assumption gates trigger events only."
    ]
  };
}

export function normalizeCocAssumptions(assumptions: CocFrostModelAssumptions): CocFrostModelAssumptions {
  return {
    frostboltCastsPerSecond: nonNegative(assumptions.frostboltCastsPerSecond),
    frostboltCritChancePercent: clamp(nonNegative(assumptions.frostboltCritChancePercent), 0, 100),
    averageFrostboltCollisionsPerCast: nonNegative(assumptions.averageFrostboltCollisionsPerCast),
    averageFrostboltExplosionsHittingBoss: nonNegative(assumptions.averageFrostboltExplosionsHittingBoss),
    triggeredSpellTriggersPerSecond: nonNegative(assumptions.triggeredSpellTriggersPerSecond),
    targetSizeProfile: assumptions.targetSizeProfile in targetSizeMultipliers ? assumptions.targetSizeProfile : "medium"
  };
}

function normalizeOptionalNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
