import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  FileSearch,
  HelpCircle,
  Info,
  RefreshCcw,
  Save,
  ShieldCheck,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  calculateCocFrostModel,
  defaultCocFrostModelAssumptions,
  normalizeCocAssumptions,
  type AppSettingsResponse,
  type AppDiagnosticsResponse,
  type BuildBackupSummary,
  type BuildCoverageReportResponse,
  type BuildSkillOption,
  type BuildSkillSelection,
  type BuildWeaponSet,
  type CocFrostModelAssumptions,
  type CocFrostModelConfidence,
  type CocFrostModelProfile,
  type CocFrostModelResult,
  type CurrentBuildResponse,
  type DeltaReport,
  type EquippedSlotSummary,
  type ImportantStat,
  type ListBuildBackupsResponse,
  type LuaBridgeStatusResponse,
  type OpenTempBuildInPobResponse,
  type RecalculateTempBuildResponse,
  type RestoreBuildBackupResponse,
  type SaveTempBuildAsNewResponse,
  type SaveTempBuildResponse,
  type StatDeltaRow,
  type TargetSizeProfile,
  type TempEquipResponse,
  type UpdateAppSettingsRequest
} from "@pob-item-delta/shared";

const slotOptions = [
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
];
const meaningfulDeltaThreshold = 0.000001;
const pobInstallPathExample = "D:\\Games\\Path of Building Community (PoE2)";
const pobSettingsPathExample = "C:\\Users\\YourName\\Documents\\Path of Building (PoE2)\\Settings.xml";
const deltaFilterOptions = [
  { key: "all", label: "All" },
  { key: "changed", label: "Changed" },
  { key: "damage", label: "Damage" },
  { key: "defence", label: "Defence" },
  { key: "sustain", label: "Sustain" }
] as const;
const comparePriorityOptions = [
  { key: "overall", label: "Overall" },
  { key: "dps", label: "DPS" },
  { key: "sustain", label: "Sustain" },
  { key: "defence", label: "ES / Life" },
  { key: "resists", label: "Resists" },
  { key: "attributes", label: "Attributes" },
  { key: "spirit", label: "Spirit" }
] as const;
const damageStatKeys = new Set(["CombinedDPS", "TotalDPS", "AverageHit", "CritChance", "Speed"]);
const defenceStatKeys = new Set(["EnergyShield", "Life", "FireResist", "ColdResist", "LightningResist", "ChaosResist"]);
const sustainStatKeys = new Set(["ManaCost", "ManaPerSecondCost", "ManaRegenRecovery", "Spirit", "SpiritUnreserved"]);
const resistanceStatKeys = ["FireResist", "ColdResist", "LightningResist", "ChaosResist"] as const;
const attributeStatKeys = ["Str", "Dex", "Int"] as const;

type AttributeKey = (typeof attributeStatKeys)[number];

const attributeLabels: Record<AttributeKey, string> = {
  Dex: "Dexterity",
  Int: "Intelligence",
  Str: "Strength"
};

type DeltaFilterKey = (typeof deltaFilterOptions)[number]["key"];
type ComparePriorityKey = (typeof comparePriorityOptions)[number]["key"];

interface CandidateCompareEntry {
  createdAt: string;
  id: string;
  itemText: string;
  result: TempEquipResponse;
  selectedSkill: BuildSkillOption | null;
  slotName: string;
}

const emptyState: CurrentBuildResponse = {
  status: "missing-settings",
  message: "Loading PoB build status...",
  settingsPath: "",
  mode: null,
  buildPath: null,
  buildName: null,
  fileName: null,
  lastModified: null,
  sizeBytes: null,
  character: null,
  selectedSkill: null,
  skillOptions: [],
  activeWeaponSet: null,
  stats: [],
  slots: [],
  warnings: []
};

export default function App() {
  const [build, setBuild] = useState<CurrentBuildResponse>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidateText, setCandidateText] = useState("");
  const [slotName, setSlotName] = useState("Weapon 1");
  const [tempEquip, setTempEquip] = useState<TempEquipResponse | null>(null);
  const [tempEquipError, setTempEquipError] = useState<string | null>(null);
  const [parserReportMessage, setParserReportMessage] = useState<string | null>(null);
  const [creatingTemp, setCreatingTemp] = useState(false);
  const [recalculatingTemp, setRecalculatingTemp] = useState(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [recalculateMessage, setRecalculateMessage] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveTempBuildResponse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingTemp, setSavingTemp] = useState(false);
  const [saveAsNewResult, setSaveAsNewResult] = useState<SaveTempBuildAsNewResponse | null>(null);
  const [saveAsNewError, setSaveAsNewError] = useState<string | null>(null);
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [openInPobResult, setOpenInPobResult] = useState<OpenTempBuildInPobResponse | null>(null);
  const [openInPobError, setOpenInPobError] = useState<string | null>(null);
  const [openingInPob, setOpeningInPob] = useState(false);
  const [candidateCompareEntries, setCandidateCompareEntries] = useState<CandidateCompareEntry[]>([]);
  const [comparePriority, setComparePriority] = useState<ComparePriorityKey>("overall");
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [showCocModel, setShowCocModel] = useState(false);
  const [cocAssumptions, setCocAssumptions] = useState<CocFrostModelAssumptions>(defaultCocFrostModelAssumptions);
  const [cocConfidence, setCocConfidence] = useState<CocFrostModelConfidence>("rough");
  const [cocProfileJson, setCocProfileJson] = useState("");
  const [cocProfileMessage, setCocProfileMessage] = useState<string | null>(null);
  const [cocProfileError, setCocProfileError] = useState<string | null>(null);
  const [cocValidationMessage, setCocValidationMessage] = useState<string | null>(null);
  const [cocValidationError, setCocValidationError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [luaBridge, setLuaBridge] = useState<LuaBridgeStatusResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<AppDiagnosticsResponse | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [buildReportMessage, setBuildReportMessage] = useState<string | null>(null);
  const [buildReportError, setBuildReportError] = useState<string | null>(null);
  const [buildCoverageReportMessage, setBuildCoverageReportMessage] = useState<string | null>(null);
  const [buildCoverageReportError, setBuildCoverageReportError] = useState<string | null>(null);

  async function refreshBuild() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/current-build");
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setBuild((await response.json()) as CurrentBuildResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to read current build");
    } finally {
      setLoading(false);
    }
  }

  async function refreshLuaBridge() {
    try {
      const response = await fetch("/api/lua-bridge/status");
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setLuaBridge((await response.json()) as LuaBridgeStatusResponse);
    } catch {
      setLuaBridge(null);
    }
  }

  async function refreshAppSettings() {
    setSettingsError(null);
    try {
      const response = await fetch("/api/app-settings");
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setAppSettings((await response.json()) as AppSettingsResponse);
    } catch (requestError) {
      setSettingsError(requestError instanceof Error ? requestError.message : "Unable to read app settings");
    }
  }

  async function refreshDiagnostics() {
    setDiagnosticsError(null);
    setDiagnosticsCopied(false);
    setBuildReportMessage(null);
    setBuildReportError(null);
    try {
      const response = await fetch("/api/diagnostics");
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setDiagnostics((await response.json()) as AppDiagnosticsResponse);
    } catch (requestError) {
      setDiagnosticsError(requestError instanceof Error ? requestError.message : "Unable to read app diagnostics");
    }
  }

  async function updateAppSettingsPatch(
    patch: UpdateAppSettingsRequest,
    options: { refreshLocalSetup?: boolean } = {}
  ): Promise<AppSettingsResponse | null> {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const response = await fetch("/api/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = (await response.json()) as AppSettingsResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      const updatedSettings = payload as AppSettingsResponse;
      setAppSettings(updatedSettings);
      if (options.refreshLocalSetup ?? true) {
        await refreshBuild();
        await refreshLuaBridge();
        await refreshDiagnostics();
      }
      return updatedSettings;
    } catch (requestError) {
      setSettingsError(requestError instanceof Error ? requestError.message : "Unable to update app settings");
      return null;
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    void refreshBuild();
    void refreshAppSettings();
    void refreshLuaBridge();
    void refreshDiagnostics();
  }, []);

  const statusTone = build.status === "ready" ? "ready" : "attention";
  const characterLine = useMemo(() => {
    if (!build.character) {
      return "Character unavailable";
    }
    const parts = [build.character.ascendClassName, build.character.className, build.character.level ? `level ${build.character.level}` : null];
    return parts.filter(Boolean).join(" ");
  }, [build.character]);
  const cocModel = useMemo(
    () =>
      calculateCocFrostModel({
        pobNativeDps: numericStat(build.stats, "CombinedDPS") ?? numericStat(build.stats, "TotalDPS"),
        selectedSkillAverageHit: numericStat(build.stats, "AverageHit"),
        assumptions: cocAssumptions
      }),
    [build.stats, cocAssumptions]
  );
  const selectedSkillOption = useMemo(
    () => build.skillOptions.find((option) => skillOptionKey(option) === selectedSkillKey) ?? null,
    [build.skillOptions, selectedSkillKey]
  );
  const savedCocProfile = useMemo(
    () => findCocFrostModelProfile(appSettings?.cocFrostModelProfiles ?? [], build.buildPath),
    [appSettings?.cocFrostModelProfiles, build.buildPath]
  );

  useEffect(() => {
    if (build.skillOptions.length === 0) {
      if (selectedSkillKey !== null) {
        setSelectedSkillKey(null);
      }
      return;
    }

    if (selectedSkillKey && build.skillOptions.some((option) => skillOptionKey(option) === selectedSkillKey)) {
      return;
    }

    const savedSkill = build.skillOptions.find(
      (option) => option.activeSkillSet === build.selectedSkill?.activeSkillSet && option.mainSocketGroup === build.selectedSkill?.mainSocketGroup
    );
    const firstSkill = build.skillOptions[0];
    if (firstSkill) {
      setSelectedSkillKey(skillOptionKey(savedSkill ?? firstSkill));
    }
  }, [build.selectedSkill?.activeSkillSet, build.selectedSkill?.mainSocketGroup, build.skillOptions, selectedSkillKey]);

  useEffect(() => {
    if (build.status !== "ready" || !build.buildPath) {
      return;
    }

    if (savedCocProfile) {
      setCocAssumptions(savedCocProfile.assumptions);
      setCocConfidence(savedCocProfile.confidence);
    } else {
      setCocAssumptions(defaultCocFrostModelAssumptions);
      setCocConfidence("rough");
    }
    setCocProfileJson("");
    setCocProfileMessage(null);
    setCocProfileError(null);
    setCocValidationMessage(null);
    setCocValidationError(null);
  }, [build.buildPath, build.status, savedCocProfile]);

  function updateCocAssumption(key: keyof CocFrostModelAssumptions, value: number | TargetSizeProfile) {
    setCocAssumptions((current) => ({
      ...current,
      [key]: value
    }));
    setCocProfileMessage(null);
    setCocProfileError(null);
    setCocValidationMessage(null);
    setCocValidationError(null);
  }

  async function saveCocProfile() {
    if (build.status !== "ready" || !build.buildPath) {
      setCocProfileError("Load a saved PoB build before saving model assumptions.");
      return;
    }
    if (!appSettings) {
      setCocProfileError("App settings are still loading; try again in a moment.");
      return;
    }

    setCocProfileError(null);
    setCocProfileMessage(null);
    const profile = buildCocFrostModelProfile({
      assumptions: cocAssumptions,
      buildName: build.buildName,
      buildPath: build.buildPath,
      confidence: cocConfidence
    });
    const profiles = upsertCocFrostModelProfile(appSettings.cocFrostModelProfiles, profile);
    const updatedSettings = await updateAppSettingsPatch({ cocFrostModelProfiles: profiles }, { refreshLocalSetup: false });
    if (!updatedSettings) {
      setCocProfileError("Unable to save the model profile.");
      return;
    }
    setCocProfileMessage(`Saved profile for ${build.buildName ?? fileName(build.buildPath)}.`);
  }

  function exportCocProfile() {
    if (build.status !== "ready" || !build.buildPath) {
      setCocProfileError("Load a saved PoB build before exporting model assumptions.");
      return;
    }

    const profile = buildCocFrostModelProfile({
      assumptions: cocAssumptions,
      buildName: build.buildName,
      buildPath: build.buildPath,
      confidence: cocConfidence
    });
    setCocProfileJson(
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          profile
        },
        null,
        2
      )
    );
    setCocProfileError(null);
    setCocProfileMessage("Profile JSON ready to copy.");
  }

  function applyCocProfileJson() {
    try {
      const importedProfile = readImportedCocProfile(cocProfileJson);
      setCocAssumptions(importedProfile.assumptions);
      setCocConfidence(importedProfile.confidence);
      setCocProfileError(null);
      setCocProfileMessage("Imported assumptions applied. Save the profile to keep them for this build.");
    } catch (importError) {
      setCocProfileMessage(null);
      setCocProfileError(importError instanceof Error ? importError.message : "Unable to import profile JSON.");
    }
  }

  async function copyCocValidationReport() {
    if (build.status !== "ready" || !build.buildPath) {
      setCocValidationMessage(null);
      setCocValidationError("Load a saved PoB build before copying a validation report.");
      return;
    }

    setCocValidationMessage(null);
    setCocValidationError(null);
    const copied = await copyText(
      buildCocModelValidationReport({
        assumptions: cocAssumptions,
        build,
        confidence: cocConfidence,
        result: cocModel,
        selectedSkill: selectedSkillOption,
        tempResult: tempEquip
      })
    );
    if (copied) {
      setCocValidationMessage("Validation report copied.");
    } else {
      setCocValidationError("Unable to copy validation report in this browser.");
    }
  }

  async function createTempCopy() {
    setCreatingTemp(true);
    setTempEquip(null);
    setTempEquipError(null);
    setParserReportMessage(null);
    setRecalculateError(null);
    setRecalculateMessage(null);
    setSaveResult(null);
    setSaveError(null);
    setSaveAsNewResult(null);
    setSaveAsNewError(null);
    setOpenInPobResult(null);
    setOpenInPobError(null);
    try {
      const response = await fetch("/api/temp-equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemText: candidateText,
          selectedSkill: selectedSkillOption ? skillSelectionPayload(selectedSkillOption) : undefined,
          selectedWeaponSet: weaponSetForSlotName(slotName) ?? build.activeWeaponSet ?? undefined,
          slotName
        })
      });
      const payload = (await response.json()) as TempEquipResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      const tempResult = payload as TempEquipResponse;
      setTempEquip(tempResult);
      setCandidateCompareEntries((current) => [
        buildCandidateCompareEntry(tempResult, candidateText, slotName, selectedSkillOption),
        ...current.filter((entry) => entry.result.tempBuildPath !== tempResult.tempBuildPath)
      ].slice(0, 20));
      window.setTimeout(() => {
        document.getElementById("candidate-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (requestError) {
      setTempEquipError(requestError instanceof Error ? requestError.message : "Unable to create temp build copy");
    } finally {
      setCreatingTemp(false);
    }
  }

  function updateCandidateText(value: string) {
    setCandidateText(value);
    setTempEquipError(null);
    setParserReportMessage(null);
  }

  function updateSelectedSlot(value: string) {
    setSlotName(value);
    setTempEquipError(null);
    setParserReportMessage(null);
  }

  async function copyItemTextReport() {
    const copied = await copyText(
      buildItemTextReport({
        build,
        candidateText,
        error: tempEquipError,
        slotName
      })
    );
    setParserReportMessage(copied ? "Item report copied." : "Unable to copy item report in this browser.");
  }

  async function recalculateTempCopy() {
    if (!tempEquip) {
      return;
    }

    setRecalculatingTemp(true);
    setRecalculateError(null);
    setRecalculateMessage(null);
    setSaveAsNewResult(null);
    setSaveAsNewError(null);
    setOpenInPobResult(null);
    setOpenInPobError(null);
    try {
      const response = await fetch("/api/recalculate-temp-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBuildPath: tempEquip.sourceBuildPath,
          selectedSkill: selectedSkillOption ? skillSelectionPayload(selectedSkillOption) : undefined,
          selectedWeaponSet: tempEquip.selectedWeaponSet ?? weaponSetForSlotName(tempEquip.equippedSlot) ?? build.activeWeaponSet ?? undefined,
          tempBuildPath: tempEquip.tempBuildPath
        })
      });
      const payload = (await response.json()) as RecalculateTempBuildResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      const recalculated = payload as RecalculateTempBuildResponse;
      const updatedResult: TempEquipResponse = {
        ...tempEquip,
        sourceBuildPath: recalculated.sourceBuildPath,
        tempBuildPath: recalculated.tempBuildPath,
        comparison: recalculated.comparison
      };
      setTempEquip(updatedResult);
      setCandidateCompareEntries((current) =>
        current.map((entry) =>
          entry.result.tempBuildPath === tempEquip.tempBuildPath
            ? {
                ...entry,
                id: updatedResult.tempBuildPath,
                result: updatedResult
              }
            : entry
        )
      );
      setRecalculateMessage("Latest temp copy recalculated.");
    } catch (requestError) {
      setRecalculateError(requestError instanceof Error ? requestError.message : "Unable to recalculate temp build");
    } finally {
      setRecalculatingTemp(false);
    }
  }

  async function openTempCopyInPob() {
    if (!tempEquip) {
      return;
    }

    setOpeningInPob(true);
    setOpenInPobResult(null);
    setOpenInPobError(null);
    setSaveError(null);
    setSaveAsNewError(null);
    setRecalculateError(null);
    setRecalculateMessage(null);
    try {
      const response = await fetch("/api/open-temp-build-in-pob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBuildPath: tempEquip.sourceBuildPath,
          tempBuildPath: tempEquip.tempBuildPath
        })
      });
      const payload = (await response.json()) as OpenTempBuildInPobResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      setOpenInPobResult(payload as OpenTempBuildInPobResponse);
    } catch (requestError) {
      setOpenInPobError(requestError instanceof Error ? requestError.message : "Unable to open temporary build in PoB");
    } finally {
      setOpeningInPob(false);
    }
  }

  async function saveTempCopy() {
    if (!tempEquip) {
      return;
    }

    const confirmed = window.confirm(
      "Save this temporary build over the original PoB build? A backup will be created first, but this changes the saved build file."
    );
    if (!confirmed) {
      return;
    }

    setSavingTemp(true);
    setSaveResult(null);
    setSaveError(null);
    setRecalculateError(null);
    setRecalculateMessage(null);
    try {
      const response = await fetch("/api/save-temp-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBuildPath: tempEquip.sourceBuildPath,
          tempBuildPath: tempEquip.tempBuildPath,
          confirmOverwrite: true
        })
      });
      const payload = (await response.json()) as SaveTempBuildResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      setSaveResult(payload as SaveTempBuildResponse);
      setSaveAsNewResult(null);
      void refreshBuild();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Unable to save over original build");
    } finally {
      setSavingTemp(false);
    }
  }

  async function saveTempCopyAsNew() {
    if (!tempEquip) {
      return;
    }

    setSavingAsNew(true);
    setSaveAsNewResult(null);
    setSaveAsNewError(null);
    setSaveError(null);
    setRecalculateError(null);
    setRecalculateMessage(null);
    try {
      const response = await fetch("/api/save-temp-build-as-new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBuildPath: tempEquip.sourceBuildPath,
          tempBuildPath: tempEquip.tempBuildPath
        })
      });
      const payload = (await response.json()) as SaveTempBuildAsNewResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      setSaveAsNewResult(payload as SaveTempBuildAsNewResponse);
    } catch (requestError) {
      setSaveAsNewError(requestError instanceof Error ? requestError.message : "Unable to save as a new build");
    } finally {
      setSavingAsNew(false);
    }
  }

  function selectCandidateCompareEntry(entry: CandidateCompareEntry) {
    setTempEquip(entry.result);
    setCandidateText(entry.itemText);
    setSlotName(entry.slotName);
    setSelectedSkillKey(entry.selectedSkill ? skillOptionKey(entry.selectedSkill) : null);
    setTempEquipError(null);
    setRecalculateError(null);
    setRecalculateMessage(null);
    setSaveResult(null);
    setSaveError(null);
    setSaveAsNewResult(null);
    setSaveAsNewError(null);
    setOpenInPobResult(null);
    setOpenInPobError(null);
    window.setTimeout(() => {
      document.getElementById("candidate-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function removeCandidateCompareEntry(entryId: string) {
    setCandidateCompareEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  async function copyDiagnostics() {
    if (!diagnostics) {
      return;
    }

    setDiagnosticsCopied(false);
    setBuildReportMessage(null);
    setBuildReportError(null);
    const copied = await copyText(JSON.stringify(diagnostics, null, 2));
    setDiagnosticsCopied(copied);
    if (!copied) {
      setDiagnosticsError("Unable to copy diagnostics in this browser.");
    }
  }

  async function copyBuildValidationReport() {
    setDiagnosticsCopied(false);
    setBuildReportMessage(null);
    setBuildReportError(null);
    setBuildCoverageReportMessage(null);
    setBuildCoverageReportError(null);
    const copied = await copyText(
      buildBuildValidationReport({
        build,
        candidateEntries: candidateCompareEntries,
        diagnostics,
        selectedSkill: selectedSkillOption,
        selectedSlot: slotName,
        tempResult: tempEquip
      })
    );
    if (copied) {
      setBuildReportMessage("Build report copied.");
    } else {
      setBuildReportError("Unable to copy build report in this browser.");
    }
  }

  async function copyBuildCoverageReport() {
    setDiagnosticsCopied(false);
    setBuildReportMessage(null);
    setBuildReportError(null);
    setBuildCoverageReportMessage(null);
    setBuildCoverageReportError(null);
    try {
      const response = await fetch("/api/build-coverage-report");
      const payload = (await response.json()) as BuildCoverageReportResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      const report = payload as BuildCoverageReportResponse;
      const copied = await copyText(report.markdown);
      if (copied) {
        setBuildCoverageReportMessage(`Build scan copied. ${report.summary.buildsWithSwapGearAndMultipleSkillSets} validation candidate(s).`);
      } else {
        setBuildCoverageReportError("Unable to copy build scan in this browser.");
      }
    } catch (requestError) {
      setBuildCoverageReportError(requestError instanceof Error ? requestError.message : "Unable to create build scan.");
    }
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">PoB Item Delta{diagnostics?.appVersion ? ` v${diagnostics.appVersion}` : ""}</p>
          <h1>Current Saved Build</h1>
        </div>
        <button
          className="iconButton"
          type="button"
          onClick={() => {
            void refreshBuild();
            void refreshLuaBridge();
            void refreshDiagnostics();
          }}
          disabled={loading}
          aria-label="Refresh current build"
        >
          <RefreshCcw size={18} />
        </button>
      </header>

      <section className={`statusBand ${statusTone}`}>
        <div className="statusIcon" aria-hidden="true">
          {build.status === "ready" ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div>
          <div className="statusTitle">
            <strong>{error ?? build.message}</strong>
            <Tooltip text="XML-first mode reads the build file PoB last saved. Save in PoB before refreshing if you changed gear, skills, or config." />
          </div>
          <span>{build.status === "ready" ? "Generic build readout. Custom models stay optional." : "Current saved build is not ready yet."}</span>
        </div>
      </section>

      <HelpDiagnosticsPanel
        buildCoverageReportError={buildCoverageReportError}
        buildCoverageReportMessage={buildCoverageReportMessage}
        buildReportError={buildReportError}
        buildReportMessage={buildReportMessage}
        copyBuildReport={() => void copyBuildValidationReport()}
        copyBuildCoverageReport={() => void copyBuildCoverageReport()}
        copied={diagnosticsCopied}
        diagnostics={diagnostics}
        error={diagnosticsError}
        refresh={() => void refreshDiagnostics()}
        copy={() => void copyDiagnostics()}
      />

      <section className="grid">
        <BuildPanel build={build} characterLine={characterLine} />
        <SkillPanel build={build} selectedSkillKey={selectedSkillKey} setSelectedSkillKey={setSelectedSkillKey} />
      </section>

      <LuaBridgePanel
        bridge={luaBridge}
        error={settingsError}
        saving={savingSettings}
        settings={appSettings}
        updateSettings={(patch) => void updateAppSettingsPatch(patch)}
      />

      <CandidatePanel
        candidateText={candidateText}
        copyItemTextReport={() => void copyItemTextReport()}
        creating={creatingTemp}
        error={tempEquipError}
        parserReportMessage={parserReportMessage}
        result={tempEquip}
        openInPob={openTempCopyInPob}
        openInPobError={openInPobError}
        openInPobResult={openInPobResult}
        openingInPob={openingInPob}
        saveAsNew={saveTempCopyAsNew}
        saveAsNewError={saveAsNewError}
        saveAsNewResult={saveAsNewResult}
        saveError={saveError}
        saveResult={saveResult}
        savingAsNew={savingAsNew}
        saving={savingTemp}
        recalculate={recalculateTempCopy}
        recalculateError={recalculateError}
        recalculateMessage={recalculateMessage}
        recalculating={recalculatingTemp}
        selectedSlot={slotName}
        setCandidateText={updateCandidateText}
        setSelectedSlot={updateSelectedSlot}
        save={saveTempCopy}
        submit={createTempCopy}
      />

      <CandidateCompareListPanel
        activeTempBuildPath={tempEquip?.tempBuildPath ?? null}
        entries={candidateCompareEntries}
        priority={comparePriority}
        removeEntry={removeCandidateCompareEntry}
        selectEntry={selectCandidateCompareEntry}
        setPriority={setComparePriority}
        clearEntries={() => setCandidateCompareEntries([])}
      />

      <BackupPanel build={build} onRestored={() => void refreshBuild()} />

      {tempEquip && <DeltaReportPanel result={tempEquip} />}

      {tempEquip && (
        <CocModelPanel
          assumptions={cocAssumptions}
          buildPath={build.buildPath}
          confidence={cocConfidence}
          enabled={showCocModel}
          exportProfile={exportCocProfile}
          importProfile={applyCocProfileJson}
          copyValidationReport={() => void copyCocValidationReport()}
          profileError={cocProfileError}
          profileJson={cocProfileJson}
          profileMessage={cocProfileMessage}
          result={cocModel}
          savedProfile={savedCocProfile}
          saveProfile={() => void saveCocProfile()}
          savingProfile={savingSettings}
          setConfidence={(value) => {
            setCocConfidence(value);
            setCocProfileMessage(null);
            setCocProfileError(null);
            setCocValidationMessage(null);
            setCocValidationError(null);
          }}
          setEnabled={setShowCocModel}
          setProfileJson={setCocProfileJson}
          settingsReady={Boolean(appSettings)}
          updateAssumption={updateCocAssumption}
          validationError={cocValidationError}
          validationMessage={cocValidationMessage}
        />
      )}

      <section className="statsSection">
        <div className="sectionHeader">
          <HeadingWithTooltip
            title="Cached Stats"
            tooltip="These are stats already saved in the PoB XML. Full recalculation after item swaps comes later through the PoB/Lua integration."
          />
          <span>{build.stats.length} values</span>
        </div>
        <StatsGrid stats={build.stats} />
      </section>

      <section className="slotsSection">
        <div className="sectionHeader">
          <HeadingWithTooltip
            title="Equipped Slots"
            tooltip="Slots are read from the active item set in the saved build. Empty slots stay visible so replacement behavior is clear."
          />
          <span>{build.slots.filter((slot) => slot.itemId !== "0").length} equipped</span>
        </div>
        <SlotTable slots={build.slots} />
      </section>

      {build.warnings.length > 0 && (
        <section className="warningList" aria-label="Warnings">
          {build.warnings.map((warning) => (
            <div key={warning}>
              <ShieldCheck size={16} />
              <span>{warning}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function HelpDiagnosticsPanel({
  buildCoverageReportError,
  buildCoverageReportMessage,
  buildReportError,
  buildReportMessage,
  copied,
  copy,
  copyBuildCoverageReport,
  copyBuildReport,
  diagnostics,
  error,
  refresh
}: {
  buildCoverageReportError: string | null;
  buildCoverageReportMessage: string | null;
  buildReportError: string | null;
  buildReportMessage: string | null;
  copied: boolean;
  copy: () => void;
  copyBuildCoverageReport: () => void;
  copyBuildReport: () => void;
  diagnostics: AppDiagnosticsResponse | null;
  error: string | null;
  refresh: () => void;
}) {
  return (
    <section className="helpSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="Help & Diagnostics"
          tooltip="Support diagnostics are safe to copy: they include statuses, counts, version, and readiness checks, not full local build paths."
        />
        <span>{diagnostics ? `v${diagnostics.appVersion}` : "Checking"}</span>
      </div>
      <div className="helpGrid">
        <article className="helpBlock">
          <div className="helpBlockTitle">
            <HelpCircle size={18} aria-hidden="true" />
            <h3>Copy Item Text</h3>
          </div>
          <ol className="helpList">
            <li>Save your build in PoB, then refresh this app.</li>
            <li>Copy the full trade item block so it includes item name and base type.</li>
            <li>Paste it into Trade item text and choose the slot you want to test.</li>
            <li>Create a temp copy first; save only after reviewing the delta report.</li>
          </ol>
        </article>
        <article className="helpBlock">
          <div className="helpBlockTitle">
            <Clipboard size={18} aria-hidden="true" />
            <h3>Support Diagnostics</h3>
          </div>
          {diagnostics ? (
            <dl className="diagnosticGrid">
              <div>
                <dt>Build</dt>
                <dd>{diagnostics.build.status}</dd>
              </div>
              <div>
                <dt>Bridge</dt>
                <dd>{diagnostics.luaBridge.status}</dd>
              </div>
              <div>
                <dt>Stats</dt>
                <dd>{diagnostics.build.statCount}</dd>
              </div>
              <div>
                <dt>Slots</dt>
                <dd>{diagnostics.build.slotCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="emptyText">Diagnostics are loading.</p>
          )}
          <div className="helpActions">
            <button className="secondaryButton" type="button" onClick={refresh}>
              <RefreshCcw size={16} aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button className="secondaryButton" type="button" onClick={copy} disabled={!diagnostics}>
              <Clipboard size={16} aria-hidden="true" />
              <span>Copy diagnostics</span>
            </button>
            <button className="secondaryButton" type="button" onClick={copyBuildReport}>
              <FileSearch size={16} aria-hidden="true" />
              <span>Copy build report</span>
            </button>
            <button className="secondaryButton" type="button" onClick={copyBuildCoverageReport} disabled={diagnostics?.build.status !== "ready"}>
              <FileSearch size={16} aria-hidden="true" />
              <span>Copy build scan</span>
            </button>
          </div>
          {copied && <span className="successText">Diagnostics copied.</span>}
          {buildReportMessage && <span className="successText">{buildReportMessage}</span>}
          {buildCoverageReportMessage && <span className="successText">{buildCoverageReportMessage}</span>}
          {error && <span className="errorText">{error}</span>}
          {buildReportError && <span className="errorText">{buildReportError}</span>}
          {buildCoverageReportError && <span className="errorText">{buildCoverageReportError}</span>}
          <p className="privacyNote">Local only: build files and pasted item text stay on this computer.</p>
        </article>
      </div>
      <details className="walkthroughDetails">
        <summary>Visual walkthrough</summary>
        <div className="walkthroughGrid">
          <figure className="walkthroughFigure">
            <img src="/help/overview.png" alt="PoB Item Delta ready build screen with setup and diagnostics panels" loading="lazy" />
            <figcaption>Start with a saved PoB build, setup readiness, and diagnostics.</figcaption>
          </figure>
          <figure className="walkthroughFigure">
            <img src="/help/delta-report.png" alt="PoB Item Delta delta report showing before and after item comparison stats" loading="lazy" />
            <figcaption>Review the delta report before using any save action.</figcaption>
          </figure>
        </div>
      </details>
    </section>
  );
}

function DeltaReportPanel({ result }: { result: TempEquipResponse }) {
  const report = result.comparison;
  const [activeFilter, setActiveFilter] = useState<DeltaFilterKey>("all");
  const isLuaReport = report.calculationStatus === "pob-lua-recalculated";
  const summary = summarizeDeltaReport(result);
  const filteredRows = useMemo(() => filterDeltaRows(report.rows, activeFilter), [activeFilter, report.rows]);
  return (
    <section className="deltaSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="Delta Report"
          tooltip={
            isLuaReport
              ? "This report compares stats recalculated through the optional PoB Lua bridge."
              : "This XML-first report compares cached stats from the original build and temporary build. It does not recalculate PoB yet."
          }
        />
        <span>{report.sourceLabel}</span>
      </div>
      <div className="deltaNotice">
        <strong>{report.selectedSkillLabel ? `${report.selectedSkillLabel} stats` : "Selected skill stats"}</strong>
        {report.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </div>
      <DeltaSummary summary={summary} />
      <div className="deltaFilterBar" role="group" aria-label="Delta report filters">
        {deltaFilterOptions.map((option) => (
          <button
            aria-pressed={activeFilter === option.key}
            className={activeFilter === option.key ? "filterButton active" : "filterButton"}
            key={option.key}
            onClick={() => setActiveFilter(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {filteredRows.length > 0 ? (
        <div className="tableWrap">
          <table className="deltaTable">
            <thead>
              <tr>
                <th>Stat</th>
                <th>Before</th>
                <th>After</th>
                <th>Delta</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <DeltaRow key={row.key} row={row} sourceLabel={report.sourceLabel} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="emptyText">No stats match this filter.</p>
      )}
    </section>
  );
}

function DeltaSummary({ summary }: { summary: DeltaSummaryView }) {
  return (
    <div className={`deltaSummary ${summary.tone}`}>
      <div className="summaryVerdict">
        <span>{summary.badge}</span>
        <strong>{summary.title}</strong>
        <em>{summary.detail}</em>
      </div>
      <div className="summaryMetrics" aria-label="Key deltas">
        {summary.metrics.map((metric) => (
          <div className="summaryMetric" key={metric.label}>
            <span>{metric.label}</span>
            <strong className={metric.tone}>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="priorityGrid" aria-label="Decision priorities">
        {summary.priorities.map((priority) => (
          <div className={`priorityCard ${priority.tone}`} key={priority.label}>
            <span>{priority.label}</span>
            <strong>{priority.status}</strong>
            <em>{priority.detail}</em>
            <small>{readPriorityWeightLabel(priority.weight)}</small>
          </div>
        ))}
      </div>
      {(summary.gains.length > 0 || summary.losses.length > 0) && (
        <div className="summaryLists">
          <ChangeList title="Biggest gains" changes={summary.gains} emptyText="No gains" />
          <ChangeList title="Biggest losses" changes={summary.losses} emptyText="No losses" />
        </div>
      )}
      {summary.explanations.length > 0 && (
        <div className="whyList" aria-label="Why this changed">
          <strong>Why this changed</strong>
          {summary.explanations.map((explanation) => (
            <span className={explanation.tone} key={explanation.title}>
              {explanation.title}: <em>{explanation.detail}</em>
            </span>
          ))}
        </div>
      )}
      {summary.warnings.length > 0 && (
        <div className="summaryWarnings" aria-label="Checks before saving">
          {summary.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeList({ changes, emptyText, title }: { changes: SummaryChange[]; emptyText: string; title: string }) {
  return (
    <div className="summaryList">
      <strong>{title}</strong>
      {changes.length > 0 ? (
        changes.map((change) => (
          <span key={change.label}>
            {change.label} <em className={change.tone}>{change.value}</em>
          </span>
        ))
      ) : (
        <span>{emptyText}</span>
      )}
    </div>
  );
}

function DeltaRow({ row, sourceLabel }: { row: StatDeltaRow; sourceLabel: string }) {
  return (
    <tr>
      <td data-label="Stat">{row.label}</td>
      <td data-label="Before">{formatNullableStat(row.before)}</td>
      <td data-label="After">{formatNullableStat(row.after)}</td>
      <td className={deltaClassName(row.delta)} data-label="Delta">
        {formatDelta(row.delta)}
      </td>
      <td data-label="Source" title={row.note}>
        {row.status === "available" ? sourceLabel : "Missing"}
      </td>
    </tr>
  );
}

function filterDeltaRows(rows: StatDeltaRow[], filter: DeltaFilterKey): StatDeltaRow[] {
  switch (filter) {
    case "changed":
      return rows.filter(hasMeaningfulDelta);
    case "damage":
      return rows.filter((row) => damageStatKeys.has(row.key));
    case "defence":
      return rows.filter((row) => defenceStatKeys.has(row.key));
    case "sustain":
      return rows.filter((row) => sustainStatKeys.has(row.key));
    case "all":
      return rows;
  }
}

function hasMeaningfulDelta(row: StatDeltaRow): boolean {
  return typeof row.delta === "number" && Math.abs(row.delta) > meaningfulDeltaThreshold;
}

type SummaryTone = "positive" | "negative" | "mixed" | "neutral";

interface SummaryChange {
  label: string;
  value: string;
  tone: "deltaPositive" | "deltaNegative";
}

interface SummaryMetric {
  label: string;
  value: string;
  tone: "deltaPositive" | "deltaNegative" | "deltaNeutral";
}

interface PriorityCheck {
  detail: string;
  label: string;
  status: string;
  tone: SummaryTone;
  weight: number;
}

interface WhyExplanation {
  detail: string;
  title: string;
  tone: SummaryTone;
}

interface DeltaSummaryView {
  badge: string;
  detail: string;
  explanations: WhyExplanation[];
  gains: SummaryChange[];
  losses: SummaryChange[];
  metrics: SummaryMetric[];
  priorities: PriorityCheck[];
  title: string;
  tone: SummaryTone;
  warnings: string[];
}

function summarizeDeltaReport(result: TempEquipResponse): DeltaSummaryView {
  const report = result.comparison;
  const dps = findDeltaRow(report.rows, "CombinedDPS") ?? findDeltaRow(report.rows, "TotalDPS");
  const averageHit = findDeltaRow(report.rows, "AverageHit");
  const critChance = findDeltaRow(report.rows, "CritChance");
  const manaCostPerSecond = findDeltaRow(report.rows, "ManaPerSecondCost");
  const manaRegen = findDeltaRow(report.rows, "ManaRegenRecovery");
  const changedRows = report.rows.filter((row) => typeof row.delta === "number" && Math.abs(row.delta) > meaningfulDeltaThreshold);
  const gains = changedRows
    .filter((row) => (row.delta ?? 0) > 0)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))
    .slice(0, 3)
    .map((row) => summaryChange(row, "deltaPositive"));
  const losses = changedRows
    .filter((row) => (row.delta ?? 0) < 0)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))
    .slice(0, 3)
    .map((row) => summaryChange(row, "deltaNegative"));
  const warnings = buildDeltaSummaryWarnings(result);
  const priorities = buildPriorityChecks(report.rows);
  const explanations = buildWhyExplanations(result);
  const dpsDelta = typeof dps?.delta === "number" ? dps.delta : 0;
  const tone = readSummaryTone(dpsDelta, gains.length, losses.length, warnings.length);
  const dpsPercent = percentDelta(dps);

  return {
    badge: readSummaryBadge(tone),
    detail: readSummaryDetail({ averageHit, dps, dpsPercent, manaCostPerSecond, manaRegen, warnings }),
    explanations,
    gains,
    losses,
    metrics: [
      summaryMetric("DPS", dps),
      summaryMetric("Average hit", averageHit),
      summaryMetric("Crit chance", critChance),
      summaryMetric("Mana/sec", manaCostPerSecond),
      summaryMetric("Mana regen", manaRegen)
    ],
    priorities,
    title: readSummaryTitle(tone),
    tone,
    warnings
  };
}

function findDeltaRow(rows: StatDeltaRow[], key: string): StatDeltaRow | null {
  return rows.find((row) => row.key === key) ?? null;
}

function summaryChange(row: StatDeltaRow, tone: SummaryChange["tone"]): SummaryChange {
  return {
    label: row.label,
    value: formatDelta(row.delta),
    tone
  };
}

function summaryMetric(label: string, row: StatDeltaRow | null): SummaryMetric {
  return {
    label,
    value: row ? formatDelta(row.delta) : "-",
    tone: deltaClassName(row?.delta ?? null)
  };
}

interface PriorityInput {
  direction: 1 | -1;
  row: StatDeltaRow | null;
}

interface PriorityOptions {
  primaryDominates?: boolean;
}

function buildPriorityChecks(rows: StatDeltaRow[]): PriorityCheck[] {
  return [
    buildPriorityCheck("DPS", 5, [
      { row: findDeltaRow(rows, "CombinedDPS") ?? findDeltaRow(rows, "TotalDPS"), direction: 1 },
      { row: findDeltaRow(rows, "AverageHit"), direction: 1 },
      { row: findDeltaRow(rows, "CritChance"), direction: 1 },
      { row: findDeltaRow(rows, "Speed"), direction: 1 }
    ], { primaryDominates: true }),
    buildPriorityCheck("Sustain", 4, [
      { row: findDeltaRow(rows, "ManaCost"), direction: -1 },
      { row: findDeltaRow(rows, "ManaPerSecondCost"), direction: -1 },
      { row: findDeltaRow(rows, "ManaRegenRecovery"), direction: 1 }
    ]),
    buildPriorityCheck("ES / Life", 3, [
      { row: findDeltaRow(rows, "EnergyShield"), direction: 1 },
      { row: findDeltaRow(rows, "Life"), direction: 1 }
    ]),
    buildPriorityCheck(
      "Resists",
      4,
      resistanceStatKeys.map((key) => ({ row: findDeltaRow(rows, key), direction: 1 }))
    ),
    buildPriorityCheck(
      "Attributes",
      2,
      attributeStatKeys.map((key) => ({ row: findDeltaRow(rows, key), direction: 1 }))
    ),
    buildPriorityCheck("Spirit / Reservation", 3, [
      { row: findDeltaRow(rows, "Spirit"), direction: 1 },
      { row: findDeltaRow(rows, "SpiritUnreserved"), direction: 1 }
    ])
  ];
}

function buildPriorityCheck(label: string, weight: number, inputs: PriorityInput[], options: PriorityOptions = {}): PriorityCheck {
  const changedInputs = inputs.filter((input) => input.row && hasMeaningfulDelta(input.row));
  const positive = changedInputs.filter((input) => readFavorableDelta(input) > meaningfulDeltaThreshold);
  const negative = changedInputs.filter((input) => readFavorableDelta(input) < -meaningfulDeltaThreshold);
  const primary = inputs[0];
  const primaryTone = options.primaryDominates && primary?.row && hasMeaningfulDelta(primary.row) ? favorableDeltaTone(readFavorableDelta(primary)) : null;
  const tone = primaryTone ?? (positive.length > 0 && negative.length > 0 ? "mixed" : negative.length > 0 ? "negative" : positive.length > 0 ? "positive" : "neutral");
  const status = readPriorityStatus(tone);
  const detail = changedInputs.length > 0 ? changedInputs.slice(0, 3).map(({ row }) => `${row?.label} ${formatDelta(row?.delta ?? null)}`).join(", ") : "No tracked movement.";

  return {
    detail,
    label,
    status,
    tone,
    weight
  };
}

function readFavorableDelta(input: PriorityInput): number {
  return typeof input.row?.delta === "number" ? input.row.delta * input.direction : 0;
}

function favorableDeltaTone(delta: number): SummaryTone {
  if (delta > meaningfulDeltaThreshold) {
    return "positive";
  }
  if (delta < -meaningfulDeltaThreshold) {
    return "negative";
  }
  return "neutral";
}

function readPriorityStatus(tone: SummaryTone): string {
  switch (tone) {
    case "positive":
      return "Gain";
    case "negative":
      return "Risk";
    case "mixed":
      return "Mixed";
    case "neutral":
      return "Stable";
  }
}

function readPriorityWeightLabel(weight: number): string {
  if (weight >= 5) {
    return "Top priority";
  }
  if (weight >= 4) {
    return "High priority";
  }
  if (weight >= 3) {
    return "Medium priority";
  }
  return "Lower priority";
}

function skillOptionKey(option: BuildSkillOption): string {
  return `${option.activeSkillSet}:${option.mainSocketGroup}`;
}

function skillSelectionPayload(option: BuildSkillOption): BuildSkillSelection {
  return {
    activeSkillSet: option.activeSkillSet,
    mainSocketGroup: option.mainSocketGroup
  };
}

function weaponSetForSlotName(slotName: string): BuildWeaponSet | null {
  if (slotName === "Weapon 1" || slotName === "Weapon 2") {
    return "primary";
  }
  if (slotName === "Weapon 1 Swap" || slotName === "Weapon 2 Swap") {
    return "swap";
  }
  return null;
}

function weaponSetLabel(weaponSet: BuildWeaponSet | null | undefined): string {
  if (weaponSet === "primary") {
    return "Weapon set I";
  }
  if (weaponSet === "swap") {
    return "Weapon set II";
  }
  return "Unavailable";
}

function buildCandidateCompareEntry(
  result: TempEquipResponse,
  itemText: string,
  slotName: string,
  selectedSkill: BuildSkillOption | null
): CandidateCompareEntry {
  return {
    createdAt: new Date().toISOString(),
    id: result.tempBuildPath,
    itemText,
    result,
    selectedSkill,
    slotName
  };
}

function rankCandidateCompareEntries(entries: CandidateCompareEntry[], priority: ComparePriorityKey): CandidateCompareEntry[] {
  return [...entries].sort((left, right) => {
    const scoreDelta = compareCandidateScore(right.result, priority) - compareCandidateScore(left.result, priority);
    if (Math.abs(scoreDelta) > meaningfulDeltaThreshold) {
      return scoreDelta;
    }

    const dpsDelta = compareDpsDelta(right.result) - compareDpsDelta(left.result);
    if (Math.abs(dpsDelta) > meaningfulDeltaThreshold) {
      return dpsDelta;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

interface ComparePriorityReadout {
  detail: string;
  label: string;
  status: string;
  tone: SummaryTone;
}

function readComparePriorityReadout(result: TempEquipResponse, priority: ComparePriorityKey): ComparePriorityReadout {
  const summary = summarizeDeltaReport(result);
  if (priority === "overall") {
    return {
      detail: summary.detail,
      label: "Overall",
      status: summary.badge,
      tone: summary.tone
    };
  }

  const priorityLabel = comparePriorityLabel(priority);
  const check = summary.priorities.find((candidate) => candidate.label === priorityLabel);
  return {
    detail: check?.detail ?? "No tracked movement.",
    label: priorityLabel,
    status: check?.status ?? "Stable",
    tone: check?.tone ?? "neutral"
  };
}

function compareCandidateScore(result: TempEquipResponse, priority: ComparePriorityKey): number {
  const summary = summarizeDeltaReport(result);
  if (priority === "overall") {
    return summary.priorities.reduce((score, check) => score + compareToneScore(check.tone) * check.weight, 0);
  }

  const priorityLabel = comparePriorityLabel(priority);
  const check = summary.priorities.find((candidate) => candidate.label === priorityLabel);
  return check ? compareToneScore(check.tone) * check.weight : 0;
}

function comparePriorityLabel(priority: Exclude<ComparePriorityKey, "overall">): string {
  switch (priority) {
    case "dps":
      return "DPS";
    case "sustain":
      return "Sustain";
    case "defence":
      return "ES / Life";
    case "resists":
      return "Resists";
    case "attributes":
      return "Attributes";
    case "spirit":
      return "Spirit / Reservation";
  }
}

function compareToneScore(tone: SummaryTone): number {
  switch (tone) {
    case "positive":
      return 1;
    case "mixed":
      return 0.25;
    case "neutral":
      return 0;
    case "negative":
      return -1;
  }
}

function compareDpsDelta(result: TempEquipResponse): number {
  const dps = findDeltaRow(result.comparison.rows, "CombinedDPS") ?? findDeltaRow(result.comparison.rows, "TotalDPS");
  return typeof dps?.delta === "number" ? dps.delta : 0;
}

function buildWhyExplanations(result: TempEquipResponse): WhyExplanation[] {
  const rows = result.comparison.rows;
  const explanations: WhyExplanation[] = [];
  const dps = findDeltaRow(rows, "CombinedDPS") ?? findDeltaRow(rows, "TotalDPS");
  const damageDrivers = [findDeltaRow(rows, "AverageHit"), findDeltaRow(rows, "CritChance"), findDeltaRow(rows, "Speed")].filter(isChangedRow);
  const sustainDrivers = [findDeltaRow(rows, "ManaCost"), findDeltaRow(rows, "ManaPerSecondCost"), findDeltaRow(rows, "ManaRegenRecovery")].filter(isChangedRow);
  const defenceDrivers = [findDeltaRow(rows, "EnergyShield"), findDeltaRow(rows, "Life"), ...resistanceStatKeys.map((key) => findDeltaRow(rows, key))].filter(isChangedRow);
  const attributeDrivers = attributeStatKeys.map((key) => findDeltaRow(rows, key)).filter(isChangedRow);
  const spiritDrivers = [findDeltaRow(rows, "Spirit"), findDeltaRow(rows, "SpiritUnreserved")].filter(isChangedRow);

  if (isChangedRow(dps) || damageDrivers.length > 0) {
    explanations.push({
      title: "Damage",
      detail: [dps ? `DPS ${formatDelta(dps.delta)}` : null, ...damageDrivers.map((row) => `${row.label} ${formatDelta(row.delta)}`)].filter(Boolean).join(", "),
      tone: deltaTone(dps?.delta ?? damageDrivers[0]?.delta ?? null)
    });
  }
  if (sustainDrivers.length > 0) {
    explanations.push({
      title: "Sustain",
      detail: sustainDrivers.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", "),
      tone: priorityTone(buildPriorityCheck("Sustain", 4, sustainDrivers.map((row) => ({ row, direction: row.key === "ManaRegenRecovery" ? 1 : -1 }))))
    });
  }
  if (defenceDrivers.length > 0) {
    explanations.push({
      title: "Defences",
      detail: defenceDrivers.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", "),
      tone: rowsTone(defenceDrivers)
    });
  }
  if (attributeDrivers.length > 0) {
    explanations.push({
      title: "Attributes",
      detail: attributeDrivers.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", "),
      tone: rowsTone(attributeDrivers)
    });
  }
  if (spiritDrivers.length > 0) {
    explanations.push({
      title: "Spirit",
      detail: spiritDrivers.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", "),
      tone: rowsTone(spiritDrivers)
    });
  }
  if (result.clearedSlots.length > 0) {
    explanations.push({
      title: "Equipment",
      detail: `${result.candidate.name ?? "Candidate item"} cleared ${result.clearedSlots.join(", ")}.`,
      tone: "mixed"
    });
  }

  return explanations.slice(0, 5);
}

function priorityTone(priority: PriorityCheck): SummaryTone {
  return priority.tone;
}

function rowsTone(rows: StatDeltaRow[]): SummaryTone {
  const positives = rows.filter((row) => typeof row.delta === "number" && row.delta > meaningfulDeltaThreshold).length;
  const negatives = rows.filter((row) => typeof row.delta === "number" && row.delta < -meaningfulDeltaThreshold).length;
  if (positives > 0 && negatives > 0) {
    return "mixed";
  }
  if (negatives > 0) {
    return "negative";
  }
  if (positives > 0) {
    return "positive";
  }
  return "neutral";
}

function deltaTone(delta: number | null): SummaryTone {
  if (delta === null || Math.abs(delta) <= meaningfulDeltaThreshold) {
    return "neutral";
  }
  return delta > 0 ? "positive" : "negative";
}

function isChangedRow(row: StatDeltaRow | null): row is StatDeltaRow {
  return !!row && hasMeaningfulDelta(row);
}

function buildDeltaSummaryWarnings(result: TempEquipResponse): string[] {
  const rows = result.comparison.rows;
  const warnings: string[] = [];
  const manaCostPerSecond = findDeltaRow(rows, "ManaPerSecondCost");
  const manaRegen = findDeltaRow(rows, "ManaRegenRecovery");
  const costDelta = manaCostPerSecond?.delta;
  const regenDelta = manaRegen?.delta;
  const costWorse = typeof costDelta === "number" && costDelta > meaningfulDeltaThreshold;
  const regenWorse = typeof regenDelta === "number" && regenDelta < -meaningfulDeltaThreshold;
  const afterCost = readNumber(manaCostPerSecond?.after);
  const afterRegen = readNumber(manaRegen?.after);

  if (costWorse || regenWorse) {
    const parts = [
      costWorse ? `mana cost/sec ${formatDelta(costDelta)}` : null,
      regenWorse ? `mana regen ${formatDelta(regenDelta)}` : null
    ].filter(Boolean);
    warnings.push(`Check sustain before saving: ${parts.join(", ")}.`);
  }
  if (afterCost !== null && afterRegen !== null && afterCost > afterRegen + meaningfulDeltaThreshold) {
    warnings.push(`Mana sustain risk: cost/sec ${formatStat(afterCost)} is above regen ${formatStat(afterRegen)}.`);
  }

  const resistanceLosses = resistanceStatKeys.map((key) => findDeltaRow(rows, key)).filter((row): row is StatDeltaRow => !!row && typeof row.delta === "number" && row.delta < -meaningfulDeltaThreshold);
  if (resistanceLosses.length > 0) {
    warnings.push(`Resistance loss: ${resistanceLosses.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", ")}.`);
  }

  const attributeLosses = attributeStatKeys.map((key) => findDeltaRow(rows, key)).filter((row): row is StatDeltaRow => !!row && typeof row.delta === "number" && row.delta < -meaningfulDeltaThreshold);
  const requirementWarnings = buildRequirementWarnings(result.itemComparison.candidate.text, rows);
  warnings.push(...requirementWarnings);
  if (attributeLosses.length > 0) {
    warnings.push(`Attribute loss may break gear or gem requirements: ${attributeLosses.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", ")}.`);
  }

  const spirit = findDeltaRow(rows, "Spirit");
  const unreservedSpirit = findDeltaRow(rows, "SpiritUnreserved");
  const spiritLosses = [spirit, unreservedSpirit].filter((row): row is StatDeltaRow => !!row && typeof row.delta === "number" && row.delta < -meaningfulDeltaThreshold);
  const afterUnreserved = readNumber(unreservedSpirit?.after);
  if (spiritLosses.length > 0 || (afterUnreserved !== null && afterUnreserved <= 0)) {
    warnings.push(`Spirit/reservation check: ${spiritLosses.length > 0 ? spiritLosses.map((row) => `${row.label} ${formatDelta(row.delta)}`).join(", ") : `unreserved spirit is ${formatStat(afterUnreserved ?? 0)}`}.`);
  }

  if (result.clearedSlots.length > 0) {
    warnings.push(`Offhand changed: ${result.clearedSlots.join(", ")} was cleared by the candidate item.`);
  }

  return [...new Set(warnings)];
}

interface AttributeRequirement {
  key: AttributeKey;
  label: string;
  value: number;
}

function buildRequirementWarnings(candidateText: string | null, rows: StatDeltaRow[]): string[] {
  const requirements = readAttributeRequirements(candidateText);
  return requirements.flatMap((requirement) => {
    const after = readNumber(findDeltaRow(rows, requirement.key)?.after);
    if (after !== null && after + meaningfulDeltaThreshold < requirement.value) {
      return [`Requirement risk: candidate asks for ${requirement.value} ${requirement.label}, but after stats show ${formatStat(after)}.`];
    }
    return [];
  });
}

function readAttributeRequirements(text: string | null): AttributeRequirement[] {
  if (!text) {
    return [];
  }

  const byKey = new Map<AttributeRequirement["key"], AttributeRequirement>();
  for (const match of text.matchAll(/(\d+)\s*(Str|Strength|Dex|Dexterity|Int|Intelligence)\b/gi)) {
    const [, rawValue, rawAttribute] = match;
    const key = rawAttribute ? normalizeAttributeKey(rawAttribute) : null;
    if (!key) {
      continue;
    }
    const value = Number(rawValue);
    const current = byKey.get(key);
    if (Number.isFinite(value) && (!current || value > current.value)) {
      byKey.set(key, {
        key,
        label: attributeLabels[key],
        value
      });
    }
  }
  return [...byKey.values()];
}

function normalizeAttributeKey(value: string): AttributeRequirement["key"] | null {
  const normalized = value.toLowerCase();
  if (normalized === "str" || normalized === "strength") {
    return "Str";
  }
  if (normalized === "dex" || normalized === "dexterity") {
    return "Dex";
  }
  if (normalized === "int" || normalized === "intelligence") {
    return "Int";
  }
  return null;
}

function readSummaryTone(dpsDelta: number, gainCount: number, lossCount: number, warningCount: number): SummaryTone {
  if (dpsDelta > meaningfulDeltaThreshold && warningCount > 0) {
    return "mixed";
  }
  if (dpsDelta > meaningfulDeltaThreshold) {
    return "positive";
  }
  if (dpsDelta < -meaningfulDeltaThreshold) {
    return "negative";
  }
  if (gainCount > 0 && lossCount > 0) {
    return "mixed";
  }
  return "neutral";
}

function readSummaryBadge(tone: SummaryTone): string {
  switch (tone) {
    case "positive":
      return "Likely upgrade";
    case "negative":
      return "Likely downgrade";
    case "mixed":
      return "Upgrade with checks";
    case "neutral":
      return "No clear change";
  }
}

function readSummaryTitle(tone: SummaryTone): string {
  switch (tone) {
    case "positive":
      return "Looks better for the selected skill.";
    case "negative":
      return "Looks worse for the selected skill.";
    case "mixed":
      return "More damage, but check the trade-offs.";
    case "neutral":
      return "No meaningful stat movement detected.";
  }
}

function readSummaryDetail({
  averageHit,
  dps,
  dpsPercent,
  manaCostPerSecond,
  manaRegen,
  warnings
}: {
  averageHit: StatDeltaRow | null;
  dps: StatDeltaRow | null;
  dpsPercent: number | null;
  manaCostPerSecond: StatDeltaRow | null;
  manaRegen: StatDeltaRow | null;
  warnings: string[];
}): string {
  const parts = [
    dps ? `DPS ${formatDelta(dps.delta)}${dpsPercent === null ? "" : ` (${formatSignedPercent(dpsPercent)})`}` : null,
    averageHit ? `average hit ${formatDelta(averageHit.delta)}` : null
  ].filter(Boolean);

  if (warnings.length > 0) {
    const sustainParts = [
      manaCostPerSecond ? `cost/sec ${formatDelta(manaCostPerSecond.delta)}` : null,
      manaRegen ? `regen ${formatDelta(manaRegen.delta)}` : null
    ].filter(Boolean);
    parts.push(`sustain ${sustainParts.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "The candidate did not move the tracked stats.";
}

function LuaBridgePanel({
  bridge,
  error,
  saving,
  settings,
  updateSettings
}: {
  bridge: LuaBridgeStatusResponse | null;
  error: string | null;
  saving: boolean;
  settings: AppSettingsResponse | null;
  updateSettings: (patch: UpdateAppSettingsRequest) => void;
}) {
  const configured = bridge?.status === "configured";
  const enabled = settings?.enableLuaBridge ?? bridge?.enabled ?? false;
  const setupReadout = bridgeSetupReadout(bridge, enabled);
  const [pobInstallPath, setPobInstallPath] = useState("");
  const [pobSettingsPath, setPobSettingsPath] = useState("");

  useEffect(() => {
    setPobInstallPath(settings?.pobInstallPath ?? "");
    setPobSettingsPath(settings?.pobSettingsPath ?? "");
  }, [settings?.pobInstallPath, settings?.pobSettingsPath]);

  return (
    <section className={`nativeCalcSection ${configured ? "ready" : "attention"}`}>
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="PoB Native Calculation"
          tooltip="This checks whether the optional Lua bridge can use PoB's own calculation engine. XML comparison remains available when it is not configured."
        />
        <span>{enabled ? (configured ? "Bridge configured" : "Needs setup") : "Off"}</span>
      </div>
      <div className="nativeCalcBody">
        <label className="toggleRow nativeToggle">
          <input
            checked={enabled}
            disabled={saving || !settings}
            onChange={(event) => updateSettings({ enableLuaBridge: event.currentTarget.checked })}
            type="checkbox"
          />
          <span>{saving ? "Saving setting..." : "Use PoB-native recalculation"}</span>
        </label>
        {settings && <span className="settingsPath" title={settings.settingsPath}>Setting saved at {fileName(settings.settingsPath)}</span>}
        {error && <span className="errorText">{error}</span>}
        <div className={`setupReadout ${setupReadout.tone}`}>
          <span>{setupReadout.badge}</span>
          <strong>{setupReadout.title}</strong>
          <em>{setupReadout.detail}</em>
        </div>
        <div className="setupFields" aria-label="PoB setup paths">
          <label className="fieldLabel">
            <span className="labelWithTooltip">
              PoB install folder
              <Tooltip text="Use the folder that contains Path of Building-PoE2.exe plus Classes, Modules, Data, TreeData, and lua." />
            </span>
            <input
              disabled={saving || !settings}
              onChange={(event) => setPobInstallPath(event.currentTarget.value)}
              placeholder={pobInstallPathExample}
              value={pobInstallPath}
            />
          </label>
          <label className="fieldLabel">
            <span className="labelWithTooltip">
              PoB Settings.xml
              <Tooltip text="This file tells the app which build PoB currently has loaded. Save in PoB, then refresh here." />
            </span>
            <input
              disabled={saving || !settings}
              onChange={(event) => setPobSettingsPath(event.currentTarget.value)}
              placeholder={pobSettingsPathExample}
              value={pobSettingsPath}
            />
          </label>
          <button
            className="secondaryButton"
            disabled={saving || !settings || !pobInstallPath.trim() || !pobSettingsPath.trim()}
            onClick={() =>
              updateSettings({
                pobInstallPath,
                pobSettingsPath
              })
            }
            type="button"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{saving ? "Saving..." : "Save setup"}</span>
          </button>
          <div className="pathExamples">
            <span>
              Install example: <code>{pobInstallPathExample}</code>
            </span>
            <span>
              Settings example: <code>{pobSettingsPathExample}</code>
            </span>
          </div>
        </div>
        <strong>{bridge?.message ?? "Bridge status unavailable."}</strong>
        {bridge && (
          <>
            <div className="bridgeChecks" aria-label="Lua bridge checks">
              {bridge.checks.map((check) => (
                <div key={check.key} className={check.ok ? "checkOk" : "checkMissing"}>
                  <span>{check.label}</span>
                  <em>{check.message}</em>
                </div>
              ))}
            </div>
            <dl className="bridgeDetails">
              <div>
                <dt>Command</dt>
                <dd>{bridge.command}</dd>
              </div>
              <div>
                <dt>Bridge folder</dt>
                <dd title={bridge.forkPath ?? undefined}>{bridge.forkPath ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Wrapper</dt>
                <dd title={bridge.wrapperPath ?? undefined}>{bridge.wrapperPath ? fileName(bridge.wrapperPath) : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Timeout</dt>
                <dd>{bridge.timeoutMs} ms</dd>
              </div>
            </dl>
            {bridge.setupHints.length > 0 && (
              <div className="setupHints">
                {bridge.setupHints.map((hint) => (
                  <span key={hint}>{hint}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function bridgeSetupReadout(
  bridge: LuaBridgeStatusResponse | null,
  enabled: boolean
): { tone: "ready" | "attention" | "off"; badge: string; title: string; detail: string } {
  if (!enabled) {
    return {
      tone: "off",
      badge: "Off",
      title: "XML fallback only",
      detail: "Turn on PoB-native recalculation when you want live PoB stats."
    };
  }

  switch (bridge?.status) {
    case "configured":
      return {
        tone: "ready",
        badge: "Ready",
        title: "Native recalculation ready",
        detail: "The app can prepare its temporary runtime mirror and use PoB stats for comparisons."
      };
    case "missing-command":
      return {
        tone: "attention",
        badge: "Setup",
        title: "PoB launcher missing",
        detail: "Check that the install folder contains Path of Building-PoE2.exe."
      };
    case "missing-fork-path":
      return {
        tone: "attention",
        badge: "Setup",
        title: "PoB install folder missing",
        detail: "Choose the full PoB install folder, not the Builds or Documents folder."
      };
    case "missing-wrapper":
      return {
        tone: "attention",
        badge: "Setup",
        title: "Bridge wrapper missing",
        detail: "The app could not find tools/pob-lua/HeadlessWrapper.lua in this project."
      };
    case "runtime-mirror-failed":
      return {
        tone: "attention",
        badge: "Setup",
        title: "Runtime mirror check failed",
        detail: "The install folder needs Classes, Modules, Data, TreeData, and lua so PoB modules can load."
      };
    case "disabled":
      return {
        tone: "off",
        badge: "Off",
        title: "XML fallback only",
        detail: "Turn on PoB-native recalculation when you want live PoB stats."
      };
    default:
      return {
        tone: "attention",
        badge: "Checking",
        title: "Reading local setup",
        detail: "Bridge status will appear after the app checks the saved paths."
      };
  }
}

function CocModelPanel({
  assumptions,
  buildPath,
  confidence,
  copyValidationReport,
  enabled,
  exportProfile,
  importProfile,
  profileError,
  profileJson,
  profileMessage,
  result,
  savedProfile,
  saveProfile,
  savingProfile,
  setConfidence,
  setEnabled,
  setProfileJson,
  settingsReady,
  updateAssumption,
  validationError,
  validationMessage
}: {
  assumptions: CocFrostModelAssumptions;
  buildPath: string | null;
  confidence: CocFrostModelConfidence;
  copyValidationReport: () => void;
  enabled: boolean;
  exportProfile: () => void;
  importProfile: () => void;
  profileError: string | null;
  profileJson: string;
  profileMessage: string | null;
  result: CocFrostModelResult;
  savedProfile: CocFrostModelProfile | null;
  saveProfile: () => void;
  savingProfile: boolean;
  setConfidence: (value: CocFrostModelConfidence) => void;
  setEnabled: (value: boolean) => void;
  setProfileJson: (value: string) => void;
  settingsReady: boolean;
  updateAssumption: (key: keyof CocFrostModelAssumptions, value: number | TargetSizeProfile) => void;
  validationError: string | null;
  validationMessage: string | null;
}) {
  const confidenceReadout = cocConfidenceReadout(confidence);
  const savedProfileLabel = !buildPath ? "Build not ready" : savedProfile ? `Saved ${formatDate(savedProfile.updatedAt)}` : "Not saved for this build";
  const savedProfileDetail = savedProfile
    ? "These assumptions auto-load when this build is active."
    : "Save when these assumptions match this build.";

  return (
    <section className="modelSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="CoC Frost Model"
          tooltip="Optional profile for Frostbolt/Frost Wall assumptions. The generic item comparison does not depend on this model."
        />
        <label className="toggleRow">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Enable profile</span>
        </label>
      </div>
      {enabled && (
        <>
          <div className="modelNotice">
            <div className="modelNoticeHeader">
              <strong>Assumption-driven model</strong>
              <span className={`confidenceBadge ${confidence}`}>{confidenceReadout.label}</span>
            </div>
            <span>{result.formulaNotes[0]}</span>
            <span>{result.formulaNotes[1]}</span>
            <span>{confidenceReadout.detail}</span>
          </div>
          <div className="modelProfileBar">
            <div className="profileStatus">
              <strong>{savedProfileLabel}</strong>
              <span>{savedProfileDetail}</span>
            </div>
            <label className="fieldLabel compactField">
              <span>Confidence</span>
              <select value={confidence} onChange={(event) => setConfidence(event.currentTarget.value as CocFrostModelConfidence)}>
                <option value="rough">Rough</option>
                <option value="validated">Validated</option>
                <option value="experimental">Experimental</option>
              </select>
            </label>
            <div className="modelProfileActions">
              <button className="secondaryButton" type="button" onClick={saveProfile} disabled={!buildPath || !settingsReady || savingProfile}>
                <Save size={16} aria-hidden="true" />
                <span>{savingProfile ? "Saving..." : "Save profile"}</span>
              </button>
              <button className="secondaryButton" type="button" onClick={exportProfile} disabled={!buildPath}>
                <Download size={16} aria-hidden="true" />
                <span>Export JSON</span>
              </button>
              <button className="secondaryButton" type="button" onClick={importProfile} disabled={!profileJson.trim()}>
                <Upload size={16} aria-hidden="true" />
                <span>Apply JSON</span>
              </button>
              <button className="secondaryButton" type="button" onClick={copyValidationReport} disabled={!buildPath}>
                <Clipboard size={16} aria-hidden="true" />
                <span>Copy validation report</span>
              </button>
            </div>
            {profileMessage && <span className="successText">{profileMessage}</span>}
            {profileError && <span className="errorText">{profileError}</span>}
            {validationMessage && <span className="successText">{validationMessage}</span>}
            {validationError && <span className="errorText">{validationError}</span>}
          </div>
          <div className="modelControls">
            <ModelNumberField
              label="Frostbolt casts/sec"
              min={0}
              step={0.1}
              value={assumptions.frostboltCastsPerSecond}
              onChange={(value) => updateAssumption("frostboltCastsPerSecond", value)}
            />
            <ModelNumberField
              label="Frostbolt crit chance"
              max={100}
              min={0}
              step={0.1}
              suffix="%"
              value={assumptions.frostboltCritChancePercent}
              onChange={(value) => updateAssumption("frostboltCritChancePercent", value)}
            />
            <ModelNumberField
              label="Collisions/cast"
              min={0}
              step={0.1}
              value={assumptions.averageFrostboltCollisionsPerCast}
              onChange={(value) => updateAssumption("averageFrostboltCollisionsPerCast", value)}
            />
            <ModelNumberField
              label="Explosions hitting boss"
              min={0}
              step={0.1}
              value={assumptions.averageFrostboltExplosionsHittingBoss}
              onChange={(value) => updateAssumption("averageFrostboltExplosionsHittingBoss", value)}
            />
            <ModelNumberField
              label="Triggered spells/sec"
              min={0}
              step={0.1}
              value={assumptions.triggeredSpellTriggersPerSecond}
              onChange={(value) => updateAssumption("triggeredSpellTriggersPerSecond", value)}
            />
            <label className="fieldLabel">
              <span>Target size</span>
              <select value={assumptions.targetSizeProfile} onChange={(event) => updateAssumption("targetSizeProfile", event.target.value as TargetSizeProfile)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
          </div>
          <label className="fieldLabel profileJsonField">
            <span>Profile JSON</span>
            <textarea
              onChange={(event) => setProfileJson(event.currentTarget.value)}
              placeholder="Export this profile here, or paste shared CoC Frost model JSON and apply it."
              value={profileJson}
            />
          </label>
          <div className="modelMetrics">
            <ModelMetric label="PoB-native DPS" value={formatNullableStat(result.pobNativeDps)} />
            <ModelMetric label="Custom modeled DPS" value={formatNullableStat(result.modeledDps)} />
            <ModelMetric label="Frostbolt events/sec" value={formatModelNumber(result.frostboltHitEventsPerSecond)} />
            <ModelMetric label="Crit-gated triggers/sec" value={formatModelNumber(result.critGatedTriggerEventsPerSecond)} />
          </div>
          {result.status !== "ready" && <p className="errorText">Average hit is unavailable in the current cached PoB stats.</p>}
        </>
      )}
    </section>
  );
}

function ModelNumberField({
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="fieldLabel modelNumberField">
      <span>{label}</span>
      <span className={`numberInputWrap${suffix ? " hasSuffix" : ""}`}>
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(readInputNumber(event.currentTarget.value))}
          step={step}
          type="number"
          value={value}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

function ModelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="modelMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CandidateCompareListPanel({
  activeTempBuildPath,
  clearEntries,
  entries,
  priority,
  removeEntry,
  selectEntry,
  setPriority
}: {
  activeTempBuildPath: string | null;
  clearEntries: () => void;
  entries: CandidateCompareEntry[];
  priority: ComparePriorityKey;
  removeEntry: (entryId: string) => void;
  selectEntry: (entry: CandidateCompareEntry) => void;
  setPriority: (priority: ComparePriorityKey) => void;
}) {
  const rankedEntries = useMemo(() => rankCandidateCompareEntries(entries, priority), [entries, priority]);
  const selectedPriorityLabel = comparePriorityOptions.find((option) => option.key === priority)?.label ?? "Overall";

  return (
    <section className="compareSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="Compare List"
          tooltip="Keeps this session's temp-copy results so you can rank multiple pasted candidates without saving them."
        />
        <span>{entries.length} candidates</span>
      </div>
      <div className="compareToolbar">
        <label className="fieldLabel compactField">
          <span>Rank by</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as ComparePriorityKey)}>
            {comparePriorityOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondaryButton" type="button" onClick={clearEntries} disabled={entries.length === 0}>
          Clear list
        </button>
      </div>
      {rankedEntries.length === 0 ? (
        <p className="emptyText">Create temp copies to compare multiple candidates in this session.</p>
      ) : (
        <div className="tableWrap">
          <table className="compareTable">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate</th>
                <th>Verdict</th>
                <th>{selectedPriorityLabel}</th>
                <th>DPS delta</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rankedEntries.map((entry, index) => (
                <CandidateCompareRow
                  active={entry.result.tempBuildPath === activeTempBuildPath}
                  entry={entry}
                  index={index}
                  key={entry.id}
                  priority={priority}
                  removeEntry={removeEntry}
                  selectEntry={selectEntry}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CandidateCompareRow({
  active,
  entry,
  index,
  priority,
  removeEntry,
  selectEntry
}: {
  active: boolean;
  entry: CandidateCompareEntry;
  index: number;
  priority: ComparePriorityKey;
  removeEntry: (entryId: string) => void;
  selectEntry: (entry: CandidateCompareEntry) => void;
}) {
  const summary = summarizeDeltaReport(entry.result);
  const priorityReadout = readComparePriorityReadout(entry.result, priority);
  const dps = findDeltaRow(entry.result.comparison.rows, "CombinedDPS") ?? findDeltaRow(entry.result.comparison.rows, "TotalDPS");
  const candidateName = entry.result.candidate.name ?? "Candidate item";
  const baseType = entry.result.candidate.baseType ?? "Unknown base";

  return (
    <tr className={active ? "activeCompareRow" : undefined}>
      <td data-label="Rank">{index + 1}</td>
      <td data-label="Candidate">
        <div className="compareCandidateCell">
          <strong>{candidateName}</strong>
          <span>
            {baseType} in {entry.result.equippedSlot}
          </span>
          <small>{formatDate(entry.createdAt)}</small>
        </div>
      </td>
      <td data-label="Verdict">
        <span className={`compareBadge ${summary.tone}`}>{summary.badge}</span>
        <small>{summary.title}</small>
      </td>
      <td data-label={priorityReadout.label}>
        <span className={`compareBadge ${priorityReadout.tone}`}>{priorityReadout.status}</span>
        <small>{priorityReadout.detail}</small>
      </td>
      <td className={deltaClassName(dps?.delta ?? null)} data-label="DPS delta">
        {formatDelta(dps?.delta ?? null)}
      </td>
      <td data-label="Actions">
        <div className="compareActions">
          <button className="secondaryButton" type="button" onClick={() => selectEntry(entry)}>
            {active ? "Viewing" : "View"}
          </button>
          <button className="secondaryButton" type="button" onClick={() => removeEntry(entry.id)}>
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function BackupPanel({ build, onRestored }: { build: CurrentBuildResponse; onRestored: () => void }) {
  const [backups, setBackups] = useState<ListBuildBackupsResponse | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreBuildBackupResponse | null>(null);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const currentBuildPath = build.status === "ready" ? build.buildPath : null;

  useEffect(() => {
    setBackups(null);
    setBackupError(null);
    setRestoreResult(null);
    if (currentBuildPath) {
      void refreshBackups(currentBuildPath);
    }
  }, [currentBuildPath]);

  async function refreshBackups(sourceBuildPath = currentBuildPath) {
    if (!sourceBuildPath) {
      return;
    }

    setLoadingBackups(true);
    setBackupError(null);
    try {
      const response = await fetch(`/api/build-backups?sourceBuildPath=${encodeURIComponent(sourceBuildPath)}`);
      const payload = (await response.json()) as ListBuildBackupsResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      setBackups(payload as ListBuildBackupsResponse);
    } catch (requestError) {
      setBackupError(requestError instanceof Error ? requestError.message : "Unable to load build backups");
    } finally {
      setLoadingBackups(false);
    }
  }

  async function restoreBackup(backup: BuildBackupSummary) {
    if (!currentBuildPath) {
      return;
    }

    const confirmed = window.confirm(
      `Restore ${backup.fileName} over the current saved build? A fresh backup of the current build will be created first.`
    );
    if (!confirmed) {
      return;
    }

    setRestoringPath(backup.backupBuildPath);
    setBackupError(null);
    setRestoreResult(null);
    try {
      const response = await fetch("/api/restore-build-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBuildPath: currentBuildPath,
          backupBuildPath: backup.backupBuildPath,
          confirmRestore: true
        })
      });
      const payload = (await response.json()) as RestoreBuildBackupResponse | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : `Request failed with ${response.status}`);
      }
      setRestoreResult(payload as RestoreBuildBackupResponse);
      await refreshBackups(currentBuildPath);
      onRestored();
    } catch (requestError) {
      setBackupError(requestError instanceof Error ? requestError.message : "Unable to restore build backup");
    } finally {
      setRestoringPath(null);
    }
  }

  return (
    <section className="backupSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="Build Backups"
          tooltip="Backups are local sibling XML files created before overwrite or restore actions."
        />
        <span>{backups ? `${backups.backups.length} backups` : "Current build"}</span>
      </div>
      <div className="backupToolbar">
        <button className="secondaryButton" type="button" onClick={() => void refreshBackups()} disabled={!currentBuildPath || loadingBackups}>
          <RefreshCcw size={16} aria-hidden="true" />
          <span>{loadingBackups ? "Loading..." : "Refresh backups"}</span>
        </button>
        {currentBuildPath && <span title={currentBuildPath}>{fileName(currentBuildPath)}</span>}
      </div>
      {!currentBuildPath && <p className="emptyText">Current saved build is not ready.</p>}
      {backupError && <span className="errorText">{backupError}</span>}
      {restoreResult && (
        <div className="saveResult">
          <strong>{restoreResult.message}</strong>
          <span title={restoreResult.preRestoreBackupBuildPath}>Pre-restore backup: {restoreResult.preRestoreBackupBuildPath}</span>
        </div>
      )}
      {currentBuildPath && backups && backups.backups.length === 0 && <p className="emptyText">No backups found for this build yet.</p>}
      {backups && backups.backups.length > 0 && (
        <div className="tableWrap">
          <table className="backupTable">
            <thead>
              <tr>
                <th>Backup</th>
                <th>Created</th>
                <th>Size</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.backups.map((backup) => (
                <tr key={backup.backupBuildPath}>
                  <td title={backup.backupBuildPath}>{backup.fileName}</td>
                  <td>{formatDate(backup.createdAt ?? backup.lastModified)}</td>
                  <td>{formatBytes(backup.sizeBytes)}</td>
                  <td>
                    <button
                      className="secondaryButton dangerButton"
                      type="button"
                      onClick={() => void restoreBackup(backup)}
                      disabled={Boolean(restoringPath)}
                    >
                      {restoringPath === backup.backupBuildPath ? "Restoring..." : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CandidatePanel({
  candidateText,
  copyItemTextReport,
  creating,
  error,
  parserReportMessage,
  recalculate,
  recalculateError,
  recalculateMessage,
  recalculating,
  result,
  openInPob,
  openInPobError,
  openInPobResult,
  openingInPob,
  save,
  saveAsNew,
  saveAsNewError,
  saveAsNewResult,
  saveError,
  saveResult,
  savingAsNew,
  saving,
  selectedSlot,
  setCandidateText,
  setSelectedSlot,
  submit
}: {
  candidateText: string;
  copyItemTextReport: () => void;
  creating: boolean;
  error: string | null;
  parserReportMessage: string | null;
  recalculate: () => void;
  recalculateError: string | null;
  recalculateMessage: string | null;
  recalculating: boolean;
  result: TempEquipResponse | null;
  openInPob: () => void;
  openInPobError: string | null;
  openInPobResult: OpenTempBuildInPobResponse | null;
  openingInPob: boolean;
  save: () => void;
  saveAsNew: () => void;
  saveAsNewError: string | null;
  saveAsNewResult: SaveTempBuildAsNewResponse | null;
  saveError: string | null;
  saveResult: SaveTempBuildResponse | null;
  savingAsNew: boolean;
  saving: boolean;
  selectedSlot: string;
  setCandidateText: (value: string) => void;
  setSelectedSlot: (value: string) => void;
  submit: () => void;
}) {
  return (
    <section className="candidateSection">
      <div className="sectionHeader">
        <HeadingWithTooltip
          title="Candidate Item"
          tooltip="Creates a temporary build copy with this item equipped. The original saved build is not changed."
        />
        <span>Temp copy only</span>
      </div>
      <div className="candidateGrid">
        <label className="fieldLabel">
          <span>Slot</span>
          <select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)}>
            {slotOptions.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
        <label className="fieldLabel itemTextField">
          <span>Trade item text</span>
          <textarea value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} />
        </label>
      </div>
      <div className="actionRow">
        <button className="primaryButton" type="button" onClick={() => void submit()} disabled={creating || !candidateText.trim()}>
          {creating ? "Creating..." : "Create temp copy"}
        </button>
        <button
          className="secondaryButton"
          type="button"
          onClick={copyItemTextReport}
          disabled={!candidateText.trim()}
          title="Copy the selected slot and exact pasted item text for fixture or support follow-up."
        >
          <Clipboard size={16} aria-hidden="true" />
          <span>Copy item report</span>
        </button>
        {parserReportMessage && (
          <span className={parserReportMessage.startsWith("Unable") ? "errorText" : "successText"}>{parserReportMessage}</span>
        )}
        {result && !error && <span className="successText">Temp copy created. Review the delta report below.</span>}
        {error && (
          <span className="parserReportActions">
            <span className="errorText">{error}</span>
          </span>
        )}
      </div>
      {result && (
        <div className="resultBox" id="candidate-result" role="status" aria-live="polite">
          <strong>Temp copy ready: {result.candidate.name ?? "Candidate item"} equipped in {result.equippedSlot}</strong>
          <span>Calculated with {weaponSetLabel(result.selectedWeaponSet)}.</span>
          <span>Original build is unchanged until you choose Save over original.</span>
          <span title={result.tempBuildPath}>{result.tempBuildPath}</span>
          {result.clearedSlots.length > 0 && <em>Cleared: {result.clearedSlots.join(", ")}</em>}
          {result.warnings.map((warning) => (
            <em key={warning}>{warning}</em>
          ))}
          <SavePreview result={result} />
          <ItemTextComparisonView comparison={result.itemComparison} />
          {recalculateMessage && <span className="successText">{recalculateMessage}</span>}
          {!saveResult && (
            <div className="resultActions">
              <button className="secondaryButton" type="button" onClick={() => void recalculate()} disabled={recalculating || saving || savingAsNew || openingInPob}>
                <RefreshCcw size={16} aria-hidden="true" />
                <span>{recalculating ? "Recalculating..." : "Recalculate"}</span>
              </button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => void openInPob()}
                disabled={openingInPob || recalculating || saving || savingAsNew}
              >
                <ExternalLink size={16} aria-hidden="true" />
                <span>{openingInPob ? "Opening..." : "Open in PoB"}</span>
              </button>
              <button className="secondaryButton" type="button" onClick={() => void saveAsNew()} disabled={savingAsNew || saving || recalculating || openingInPob}>
                {savingAsNew ? "Saving..." : "Save as new build"}
              </button>
              <button className="secondaryButton dangerButton" type="button" onClick={() => void save()} disabled={saving || savingAsNew || recalculating || openingInPob}>
                {saving ? "Saving..." : "Save over original"}
              </button>
            </div>
          )}
          {recalculateError && <span className="errorText">{recalculateError}</span>}
          {openInPobError && <span className="errorText">{openInPobError}</span>}
          {saveAsNewError && <span className="errorText">{saveAsNewError}</span>}
          {saveError && <span className="errorText">{saveError}</span>}
          {openInPobResult && (
            <div className="saveResult">
              <strong>{openInPobResult.message}</strong>
              <span title={openInPobResult.tempBuildPath}>Preview build: {openInPobResult.tempBuildPath}</span>
              {openInPobResult.warnings.map((warning) => (
                <em key={warning}>{warning}</em>
              ))}
            </div>
          )}
          {saveAsNewResult && (
            <div className="saveResult">
              <strong>{saveAsNewResult.message}</strong>
              <span title={saveAsNewResult.newBuildPath}>New build: {saveAsNewResult.newBuildPath}</span>
            </div>
          )}
          {saveResult && (
            <div className="saveResult">
              <strong>{saveResult.message}</strong>
              <span title={saveResult.backupBuildPath}>Backup: {saveResult.backupBuildPath}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SavePreview({ result }: { result: TempEquipResponse }) {
  const currentName = result.itemComparison.current.itemName ?? "Empty slot";
  const candidateName = result.itemComparison.candidate.itemName ?? result.candidate.name ?? "Candidate item";
  return (
    <dl className="savePreview" aria-label="Save preview">
      <div>
        <dt>Original</dt>
        <dd title={result.sourceBuildPath}>{result.sourceBuildPath}</dd>
      </div>
      <div>
        <dt>Temp copy</dt>
        <dd title={result.tempBuildPath}>{result.tempBuildPath}</dd>
      </div>
      <div>
        <dt>Replacement</dt>
        <dd>
          {result.equippedSlot}: {currentName} to {candidateName}
        </dd>
      </div>
      <div>
        <dt>Slots cleared</dt>
        <dd>{result.clearedSlots.length > 0 ? result.clearedSlots.join(", ") : "None"}</dd>
      </div>
      <div>
        <dt>Overwrite safety</dt>
        <dd>Backup created beside the original before overwrite.</dd>
      </div>
      <div>
        <dt>New build safety</dt>
        <dd>Writes a separate build beside the original and leaves the original unchanged.</dd>
      </div>
    </dl>
  );
}

function ItemTextComparisonView({ comparison }: { comparison: TempEquipResponse["itemComparison"] }) {
  return (
    <div className="itemTextComparison" aria-label="Current item and candidate item">
      <ItemTextBlock emptyText="Empty slot" snapshot={comparison.current} title={`Current ${comparison.slot}`} />
      <ItemTextBlock emptyText="Candidate text unavailable" snapshot={comparison.candidate} title="Candidate" />
    </div>
  );
}

function ItemTextBlock({
  emptyText,
  snapshot,
  title
}: {
  emptyText: string;
  snapshot: TempEquipResponse["itemComparison"]["current"];
  title: string;
}) {
  const detail = [snapshot.itemName, snapshot.baseType].filter(Boolean).join(" / ");
  return (
    <div className="itemTextPane">
      <div className="itemTextHeader">
        <strong>{title}</strong>
        <span>{detail || emptyText}</span>
      </div>
      {snapshot.text ? <pre>{snapshot.text}</pre> : <p className="emptyText">{emptyText}</p>}
    </div>
  );
}

function BuildPanel({ build, characterLine }: { build: CurrentBuildResponse; characterLine: string }) {
  return (
    <article className="panel">
      <div className="panelTitle">
        <FileSearch size={18} />
        <HeadingWithTooltip title="Build Source" tooltip="The app detects the current saved build path from local PoB settings and never uploads it." />
      </div>
      <dl className="detailList">
        <div>
          <dt>Name</dt>
          <dd>{build.buildName ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Character</dt>
          <dd>{characterLine}</dd>
        </div>
        <div>
          <dt>File</dt>
          <dd title={build.buildPath ?? undefined}>{build.fileName ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDate(build.lastModified)}</dd>
        </div>
      </dl>
    </article>
  );
}

function SkillPanel({
  build,
  selectedSkillKey,
  setSelectedSkillKey
}: {
  build: CurrentBuildResponse;
  selectedSkillKey: string | null;
  setSelectedSkillKey: (value: string | null) => void;
}) {
  const selectedOption = build.skillOptions.find((option) => skillOptionKey(option) === selectedSkillKey) ?? null;

  return (
    <article className="panel">
      <div className="panelTitle">
        <ShieldCheck size={18} />
        <HeadingWithTooltip title="Target Skill" tooltip="Choose which saved PoB skill group the comparison should calculate against. Temp copies apply this selection without changing the original build." />
      </div>
      <label className="fieldLabel skillSelectField">
        <span>Skill to compare</span>
        <select
          disabled={build.skillOptions.length === 0}
          onChange={(event) => setSelectedSkillKey(event.currentTarget.value || null)}
          value={selectedSkillKey ?? ""}
        >
          {build.skillOptions.length === 0 ? (
            <option value="">Unavailable</option>
          ) : (
            build.skillOptions.map((option) => (
              <option key={skillOptionKey(option)} value={skillOptionKey(option)}>
                {option.label}
                {option.enabled ? "" : " (disabled)"}
              </option>
            ))
          )}
        </select>
      </label>
      <dl className="detailList compact">
        <div>
          <dt>Target</dt>
          <dd>{selectedOption?.label ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Socket group</dt>
          <dd>{selectedOption?.mainSocketGroup ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Skill set</dt>
          <dd>{selectedOption?.activeSkillSet ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Saved in PoB</dt>
          <dd>{build.selectedSkill?.label ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Weapon set</dt>
          <dd>{weaponSetLabel(build.activeWeaponSet)}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{build.mode ?? "Unavailable"}</dd>
        </div>
      </dl>
    </article>
  );
}

function HeadingWithTooltip({ title, tooltip }: { title: string; tooltip: string }) {
  return (
    <div className="headingWithTooltip">
      <h2>{title}</h2>
      <Tooltip text={tooltip} />
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="tooltipWrap">
      <button className="tooltipButton" type="button" aria-label={text}>
        <Info size={14} aria-hidden="true" />
      </button>
      <span className="tooltipBubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function StatsGrid({ stats }: { stats: ImportantStat[] }) {
  if (stats.length === 0) {
    return <p className="emptyText">No cached stats available.</p>;
  }

  return (
    <div className="statsGrid">
      {stats.map((stat) => (
        <div className="statTile" key={stat.key}>
          <span>{stat.label}</span>
          <strong>{formatStat(stat.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function SlotTable({ slots }: { slots: EquippedSlotSummary[] }) {
  if (slots.length === 0) {
    return <p className="emptyText">No supported equipment slots found.</p>;
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Slot</th>
            <th>Item</th>
            <th>Base</th>
            <th>Rarity</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.slot}>
              <td>{slot.slot}</td>
              <td>{slot.itemName ?? "Empty"}</td>
              <td>{slot.baseType ?? "-"}</td>
              <td>{slot.rarity ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function findCocFrostModelProfile(profiles: CocFrostModelProfile[], buildPath: string | null): CocFrostModelProfile | null {
  if (!buildPath) {
    return null;
  }
  const activePathKey = browserPathKey(buildPath);
  return profiles.find((profile) => browserPathKey(profile.buildPath) === activePathKey) ?? null;
}

function upsertCocFrostModelProfile(profiles: CocFrostModelProfile[], profile: CocFrostModelProfile): CocFrostModelProfile[] {
  const targetPathKey = browserPathKey(profile.buildPath);
  let replaced = false;
  const nextProfiles = profiles.map((currentProfile) => {
    if (browserPathKey(currentProfile.buildPath) !== targetPathKey) {
      return currentProfile;
    }
    replaced = true;
    return profile;
  });
  return replaced ? nextProfiles : [...nextProfiles, profile];
}

function buildCocFrostModelProfile({
  assumptions,
  buildName,
  buildPath,
  confidence
}: {
  assumptions: CocFrostModelAssumptions;
  buildName: string | null;
  buildPath: string;
  confidence: CocFrostModelConfidence;
}): CocFrostModelProfile {
  return {
    buildPath,
    buildName,
    updatedAt: new Date().toISOString(),
    confidence,
    assumptions: normalizeCocAssumptions(assumptions)
  };
}

function readImportedCocProfile(jsonText: string): Pick<CocFrostModelProfile, "assumptions" | "confidence"> {
  if (!jsonText.trim()) {
    throw new Error("Paste exported model JSON before applying it.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Profile JSON is not valid JSON.");
  }

  const profileRecord = unwrapImportedProfile(parsed);
  const assumptionsRecord = isRecord(profileRecord.assumptions) ? profileRecord.assumptions : profileRecord;
  if (!hasAnyCocAssumption(assumptionsRecord)) {
    throw new Error("Profile JSON must include CoC Frost model assumptions.");
  }

  return {
    assumptions: readImportedCocAssumptions(assumptionsRecord),
    confidence: readImportedConfidence(profileRecord.confidence)
  };
}

function unwrapImportedProfile(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Profile JSON must be an object.");
  }
  if (isRecord(value.profile)) {
    return value.profile;
  }
  return value;
}

function readImportedCocAssumptions(value: Record<string, unknown>): CocFrostModelAssumptions {
  return normalizeCocAssumptions({
    frostboltCastsPerSecond: readImportedNumber(value.frostboltCastsPerSecond, defaultCocFrostModelAssumptions.frostboltCastsPerSecond),
    frostboltCritChancePercent: readImportedNumber(value.frostboltCritChancePercent, defaultCocFrostModelAssumptions.frostboltCritChancePercent),
    averageFrostboltCollisionsPerCast: readImportedNumber(
      value.averageFrostboltCollisionsPerCast,
      defaultCocFrostModelAssumptions.averageFrostboltCollisionsPerCast
    ),
    averageFrostboltExplosionsHittingBoss: readImportedNumber(
      value.averageFrostboltExplosionsHittingBoss,
      defaultCocFrostModelAssumptions.averageFrostboltExplosionsHittingBoss
    ),
    triggeredSpellTriggersPerSecond: readImportedNumber(
      value.triggeredSpellTriggersPerSecond,
      defaultCocFrostModelAssumptions.triggeredSpellTriggersPerSecond
    ),
    targetSizeProfile: readImportedTargetSize(value.targetSizeProfile)
  });
}

function hasAnyCocAssumption(value: Record<string, unknown>): boolean {
  return [
    "frostboltCastsPerSecond",
    "frostboltCritChancePercent",
    "averageFrostboltCollisionsPerCast",
    "averageFrostboltExplosionsHittingBoss",
    "triggeredSpellTriggersPerSecond",
    "targetSizeProfile"
  ].some((key) => key in value);
}

function readImportedNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function readImportedTargetSize(value: unknown): TargetSizeProfile {
  return value === "small" || value === "medium" || value === "large" ? value : defaultCocFrostModelAssumptions.targetSizeProfile;
}

function readImportedConfidence(value: unknown): CocFrostModelConfidence {
  return value === "validated" || value === "experimental" ? value : "rough";
}

function cocConfidenceReadout(confidence: CocFrostModelConfidence): { label: string; detail: string } {
  switch (confidence) {
    case "validated":
      return {
        label: "Validated",
        detail: "Confidence: assumptions were checked against repeatable gameplay or PoB observations."
      };
    case "experimental":
      return {
        label: "Experimental",
        detail: "Confidence: formula or assumptions are being tested and may move after more evidence."
      };
    case "rough":
      return {
        label: "Rough",
        detail: "Confidence: useful for direction, but still based on player-entered estimates."
      };
  }
}

function browserPathKey(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function buildItemTextReport({
  build,
  candidateText,
  error,
  slotName
}: {
  build: CurrentBuildResponse;
  candidateText: string;
  error: string | null;
  slotName: string;
}): string {
  const parserLines = error
    ? ["## Parser error", "", error]
    : [
        "## Parser note",
        "",
        "No parser error was shown when this report was copied. Inspect this exact text before turning it into a fixture."
      ];

  return [
    "# PoB Item Delta parser report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "Local-only note: this report is copied to your clipboard only. It is not uploaded by the app.",
    "",
    "## Context",
    "",
    `Build status: ${build.status}`,
    `Build name: ${build.buildName ?? "-"}`,
    `Build file: ${build.fileName ?? "-"}`,
    `Selected skill: ${build.selectedSkill?.label ?? "-"}`,
    `Active weapon set: ${weaponSetLabel(build.activeWeaponSet)}`,
    `Selected slot: ${slotName}`,
    "",
    ...parserLines,
    "",
    "## Pasted item text",
    "",
    "```text",
    candidateText.trimEnd(),
    "```"
  ].join("\n");
}

function buildBuildValidationReport({
  build,
  candidateEntries,
  diagnostics,
  selectedSkill,
  selectedSlot,
  tempResult
}: {
  build: CurrentBuildResponse;
  candidateEntries: CandidateCompareEntry[];
  diagnostics: AppDiagnosticsResponse | null;
  selectedSkill: BuildSkillOption | null;
  selectedSlot: string;
  tempResult: TempEquipResponse | null;
}): string {
  const skillLines =
    build.skillOptions.length > 0
      ? build.skillOptions.map(
          (option) =>
            `- ${option.label || "Unnamed skill"} (set ${option.activeSkillSet}, group ${option.mainSocketGroup}, ${option.enabled ? "enabled" : "disabled"})`
        )
      : ["- No skill options detected."];
  const slotLines = build.slots.length > 0 ? build.slots.map(formatBuildReportSlot) : ["- No supported equipment slots detected."];
  const tempComparisonLines = tempResult ? buildTempComparisonReportLines(tempResult) : ["No temp comparison has been created in this browser session."];
  const deltaLines = tempResult ? buildImportantDeltaReportLines(tempResult.comparison.rows) : ["- No temp comparison deltas available."];
  const compareListLines =
    candidateEntries.length > 0
      ? candidateEntries.slice(0, 5).map((entry, index) => {
          const candidate = entry.result.candidate.name ?? entry.result.candidate.baseType ?? "Unnamed candidate";
          const dpsDelta = compareDpsDelta(entry.result);
          return `- #${index + 1}: ${candidate} into ${entry.slotName}; DPS ${formatDelta(dpsDelta)}; source ${entry.result.comparison.sourceLabel}`;
        })
      : ["- No saved candidate comparisons in this browser session."];

  return [
    "# PoB Item Delta build validation report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "Local-only note: this report is copied to your clipboard only. It is not uploaded by the app.",
    "Path safety: this report includes build filenames and item names, but not full local paths or raw pasted item text.",
    "",
    "## App diagnostics",
    "",
    `App version: ${diagnostics?.appVersion ?? "-"}`,
    `Build status: ${diagnostics?.build.status ?? build.status}`,
    `PoB Lua bridge: ${diagnostics?.luaBridge.status ?? "-"}`,
    `Lua bridge can start: ${diagnostics ? String(diagnostics.luaBridge.canAttemptStart) : "-"}`,
    `Detected stats/slots: ${diagnostics ? `${diagnostics.build.statCount}/${diagnostics.build.slotCount}` : `${build.stats.length}/${build.slots.length}`}`,
    "",
    "## Build context",
    "",
    `Build name: ${build.buildName ?? "-"}`,
    `Build file: ${build.fileName ?? "-"}`,
    `Character: ${formatBuildReportCharacter(build)}`,
    `Last modified: ${build.lastModified ? formatDate(build.lastModified) : "-"}`,
    `Saved active weapon set: ${weaponSetLabel(build.activeWeaponSet)}`,
    "",
    "## Skill selection",
    "",
    `Saved selected skill: ${build.selectedSkill?.label ?? "-"}`,
    `Current report target skill: ${selectedSkill?.label ?? build.selectedSkill?.label ?? "-"}`,
    `Target skill set/group: ${selectedSkill ? `${selectedSkill.activeSkillSet}/${selectedSkill.mainSocketGroup}` : "-"}`,
    "",
    "Available skill options:",
    ...skillLines,
    "",
    "## Current slot selection",
    "",
    `Selected UI slot: ${selectedSlot}`,
    `Selected UI slot weapon set: ${weaponSetLabel(weaponSetForSlotName(selectedSlot))}`,
    "",
    "Equipped slots:",
    ...slotLines,
    "",
    "## Latest temp comparison",
    "",
    ...tempComparisonLines,
    "",
    "## High-signal deltas",
    "",
    ...deltaLines,
    "",
    "## Compare list",
    "",
    `Candidate comparisons kept in session: ${candidateEntries.length}`,
    ...compareListLines,
    "",
    "## Observation fields",
    "",
    "Expected active skill in PoB: TODO",
    "Actual active skill shown/calculated: TODO",
    "Expected weapon set: TODO",
    "Actual weapon set shown/calculated: TODO",
    "Expected equipped slot/item replacement: TODO",
    "Actual equipped slot/item replacement: TODO",
    "PoB-native recalculation matched the app report: TODO",
    "Save/backup behavior looked correct: TODO",
    "Anything confusing in the UI: TODO",
    "Screenshots or notes: TODO"
  ].join("\n");
}

function formatBuildReportCharacter(build: CurrentBuildResponse): string {
  if (!build.character) {
    return "-";
  }
  return [build.character.ascendClassName, build.character.className, build.character.level ? `level ${build.character.level}` : null]
    .filter(Boolean)
    .join(" ") || "-";
}

function formatBuildReportSlot(slot: EquippedSlotSummary): string {
  const item = slot.itemName ?? "Empty";
  const base = slot.baseType ? ` (${slot.baseType})` : "";
  const rarity = slot.rarity ? ` [${slot.rarity}]` : "";
  return `- ${slot.slot}: ${item}${base}${rarity}`;
}

function buildTempComparisonReportLines(result: TempEquipResponse): string[] {
  return [
    `Candidate item: ${result.candidate.name ?? "-"}`,
    `Candidate base/class: ${result.candidate.baseType ?? "-"} / ${result.candidate.itemClass ?? "-"}`,
    `Equipped slot: ${result.equippedSlot}`,
    `Selected comparison weapon set: ${weaponSetLabel(result.selectedWeaponSet)}`,
    `Cleared slots: ${result.clearedSlots.length > 0 ? result.clearedSlots.join(", ") : "None"}`,
    `Comparison source: ${result.comparison.sourceLabel}`,
    `Comparison status: ${result.comparison.calculationStatus}`,
    `Comparison skill: ${result.comparison.selectedSkillLabel ?? "-"}`,
    `Warnings: ${[...result.warnings, ...result.comparison.warnings].length > 0 ? [...result.warnings, ...result.comparison.warnings].join(" | ") : "None"}`
  ];
}

function buildImportantDeltaReportLines(rows: StatDeltaRow[]): string[] {
  const keys = [
    "CombinedDPS",
    "TotalDPS",
    "AverageHit",
    "CritChance",
    "Speed",
    "ManaPerSecondCost",
    "ManaRegenRecovery",
    "EnergyShield",
    "Life",
    "SpiritUnreserved"
  ];
  const lines = keys
    .map((key) => findDeltaRow(rows, key))
    .filter((row): row is StatDeltaRow => Boolean(row))
    .map((row) => `- ${row.label}: ${formatNullableStat(row.before)} -> ${formatNullableStat(row.after)} (${formatDelta(row.delta)})`);
  return lines.length > 0 ? lines : ["- No tracked deltas available."];
}

function buildCocModelValidationReport({
  assumptions,
  build,
  confidence,
  result,
  selectedSkill,
  tempResult
}: {
  assumptions: CocFrostModelAssumptions;
  build: CurrentBuildResponse;
  confidence: CocFrostModelConfidence;
  result: CocFrostModelResult;
  selectedSkill: BuildSkillOption | null;
  tempResult: TempEquipResponse | null;
}): string {
  const normalizedAssumptions = normalizeCocAssumptions(assumptions);
  const currentAverageHit = numericStat(build.stats, "AverageHit");
  const currentCombinedDps = numericStat(build.stats, "CombinedDPS") ?? numericStat(build.stats, "TotalDPS");

  return [
    "# PoB Item Delta CoC Frost model validation report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "Local-only note: this report is copied to your clipboard only. It is not uploaded by the app.",
    "",
    "## Build context",
    "",
    `Build status: ${build.status}`,
    `Build name: ${build.buildName ?? "-"}`,
    `Build file: ${build.fileName ?? "-"}`,
    `Saved selected skill: ${build.selectedSkill?.label ?? "-"}`,
    `Report target skill: ${selectedSkill?.label ?? build.selectedSkill?.label ?? "-"}`,
    `Target skill set/group: ${selectedSkill ? `${selectedSkill.activeSkillSet}/${selectedSkill.mainSocketGroup}` : "-"}`,
    `Active weapon set: ${weaponSetLabel(build.activeWeaponSet)}`,
    "",
    "## Latest temp comparison",
    "",
    `Candidate item: ${tempResult?.candidate.name ?? "-"}`,
    `Equipped slot: ${tempResult?.equippedSlot ?? "-"}`,
    `Comparison source: ${tempResult?.comparison.sourceLabel ?? "-"}`,
    `Comparison skill: ${tempResult?.comparison.selectedSkillLabel ?? "-"}`,
    "",
    "## Model profile",
    "",
    `Confidence: ${confidence}`,
    `Frostbolt casts/sec: ${normalizedAssumptions.frostboltCastsPerSecond}`,
    `Frostbolt crit chance: ${normalizedAssumptions.frostboltCritChancePercent}%`,
    `Collisions/cast: ${normalizedAssumptions.averageFrostboltCollisionsPerCast}`,
    `Explosions hitting boss: ${normalizedAssumptions.averageFrostboltExplosionsHittingBoss}`,
    `Triggered spells/sec: ${normalizedAssumptions.triggeredSpellTriggersPerSecond}`,
    `Target size profile: ${normalizedAssumptions.targetSizeProfile}`,
    "",
    "## Current model output",
    "",
    `Current PoB DPS: ${formatNullableStat(currentCombinedDps)}`,
    `Current average hit: ${formatNullableStat(currentAverageHit)}`,
    `Model status: ${result.status}`,
    `PoB-native DPS used by model: ${formatNullableStat(result.pobNativeDps)}`,
    `Custom modeled DPS: ${formatNullableStat(result.modeledDps)}`,
    `Frostbolt events/sec: ${formatModelNumber(result.frostboltHitEventsPerSecond)}`,
    `Crit-gated triggers/sec: ${formatModelNumber(result.critGatedTriggerEventsPerSecond)}`,
    "",
    "## Formula notes",
    "",
    ...result.formulaNotes.map((note) => `- ${note}`),
    "",
    "## Repeatable observation fields",
    "",
    "Observation source: TODO (PoB screen, gameplay test, video, or notes)",
    "Target/boss: TODO",
    "Test duration or sample count: TODO",
    "Observed Frostbolt casts/sec: TODO",
    "Observed Frostbolt crit chance: TODO",
    "Observed collisions/cast: TODO",
    "Observed explosions hitting boss: TODO",
    "Observed triggered spells/sec: TODO",
    "Observed DPS, kill time, or health movement: TODO",
    "Expected result from model: TODO",
    "Actual result observed: TODO",
    "",
    "## Repeat sample results",
    "",
    "Sample 1 expected result from model: TODO",
    "Sample 1 actual result observed: TODO",
    "Sample 2 expected result from model: TODO",
    "Sample 2 actual result observed: TODO",
    "Sample 3 expected result from model: TODO",
    "Sample 3 actual result observed: TODO",
    "",
    "## Decision",
    "",
    "Keep confidence rough/experimental until repeated observations match the assumptions closely enough to trust."
  ].join("\n");
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea copy path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1024 * 1024 ? 1 : 0,
    style: "unit",
    unit: value >= 1024 * 1024 ? "megabyte" : "kilobyte",
    unitDisplay: "short"
  }).format(value >= 1024 * 1024 ? value / (1024 * 1024) : Math.max(1, value / 1024));
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function formatStat(value: number | string): string {
  if (typeof value === "string") {
    return value;
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatNullableStat(value: number | string | null): string {
  return value === null ? "-" : formatStat(value);
}

function formatDelta(value: number | null): string {
  if (value === null) {
    return "-";
  }
  if (Math.abs(value) < 0.000001) {
    return "0";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatStat(Math.abs(value))}`;
}

function percentDelta(row: StatDeltaRow | null): number | null {
  if (!row || typeof row.before !== "number" || typeof row.delta !== "number" || Math.abs(row.before) < meaningfulDeltaThreshold) {
    return null;
  }
  return (row.delta / row.before) * 100;
}

function formatSignedPercent(value: number): string {
  if (Math.abs(value) < meaningfulDeltaThreshold) {
    return "0%";
  }
  const sign = value > 0 ? "+" : "-";
  return `${sign}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Math.abs(value))}%`;
}

function deltaClassName(value: number | null): "deltaNeutral" | "deltaPositive" | "deltaNegative" {
  if (value === null || Math.abs(value) < 0.000001) {
    return "deltaNeutral";
  }
  return value > 0 ? "deltaPositive" : "deltaNegative";
}

function formatModelNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2
  }).format(value);
}

function numericStat(stats: ImportantStat[], key: string): number | null {
  const value = stats.find((stat) => stat.key === key)?.value;
  return typeof value === "number" ? value : null;
}

function readNumber(value: number | string | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInputNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
