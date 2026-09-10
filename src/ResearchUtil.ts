import type { DemoSave } from "./DemoSave";
import { researchCatalog } from "./ResearchCatalog";

type ResearchKey = "UnlockedBuildings" | "UnlockedBuildingIds";

export function getResearchKey(save: DemoSave): ResearchKey | undefined {
  const service = save.Singletons.BuildingUnlockingService;
  // Do not fall back to a stale legacy field if a modern field is present but invalid.
  const key = service && Object.hasOwn(service, "UnlockedBuildings") ? "UnlockedBuildings" : "UnlockedBuildingIds";
  const ids: unknown = service?.[key];
  return Array.isArray(ids) && ids.every(id => typeof id === "string") ? key : undefined;
}

export function getUnlockedResearch(save: DemoSave): string[] {
  const key = getResearchKey(save);
  return key ? [...save.Singletons.BuildingUnlockingService[key]] : [];
}

export function getResearchOptions(save: DemoSave): string[] {
  const schema = getResearchKey(save) === "UnlockedBuildings" ? "modern" : "legacy";
  const faction = save.Singletons.FactionService?.Id;
  const knownVersion = schema === "modern" ? /^1\.1(?:\.|-|$)/.test(save.GameVersion) : /^v20210917-/.test(save.GameVersion);
  return [...new Set([
    ...(knownVersion ? researchCatalog[schema]?.[faction] ?? [] : []),
    ...getUnlockedResearch(save),
  ])].sort();
}

export function updateResearch(save: DemoSave, unlocked: string[]): DemoSave {
  const key = getResearchKey(save);
  if (!key) throw new Error("This save has no supported building research list.");
  if (!unlocked.every(id => typeof id === "string" && id.trim().length > 0)) {
    throw new Error("Enter a non-empty building ID.");
  }
  return {
    ...save,
    Singletons: {
      ...save.Singletons,
      BuildingUnlockingService: { ...save.Singletons.BuildingUnlockingService, [key]: [...unlocked] },
    },
  };
}
