import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getResearchKey, getResearchOptions, getUnlockedResearch, updateResearch } from "../ResearchUtil";
import { ResearchPlugin } from "../plugins/ResearchPlugin";
import { exportSave, loadSave } from "../SaveFile";
import { modernSave } from "./fixtures";

function researchSave(key = "UnlockedBuildings") {
  const save = modernSave();
  save.Singletons.FactionService = { Id: "Folktails" };
  save.Singletons.BuildingUnlockingService = {
    [key]: ["Forester.Folktails", "Mod.Research"], Unknown: { Keep: true },
  };
  save.Singletons.WorkplaceUnlockingService = { UnlockedWorkerTypes: [{ WorkplaceTemplateName: "Forester.Folktails", WorkerType: "Bot", Extra: 1 }] };
  if (key === "UnlockedBuildingIds") save.GameVersion = "v20210917-6e683a2-gw";
  return save;
}

describe("research editing", () => {
  it.each(["UnlockedBuildings", "UnlockedBuildingIds"])("round-trips %s while preserving everything else", async key => {
    const original = researchSave(key);
    const before = structuredClone(original);
    expect(updateResearch(original, getUnlockedResearch(original))).toEqual(original);
    const result = updateResearch(original, ["Mod.Research", "Platform.Folktails"]);
    const expected = structuredClone(before);
    expected.Singletons.BuildingUnlockingService[key] = ["Mod.Research", "Platform.Folktails"];
    expect(result).toEqual(expected);
    expect(original).toEqual(before);
    const reopened = await loadSave(await exportSave(result), original.__originalFilename);
    delete reopened.__archive;
    expect(reopened).toEqual(expected);
  });

  it("keeps catalogs separate by version and faction, and retains unknown saved IDs", () => {
    const save = researchSave();
    expect(getResearchOptions(save)).toContain("ZiplineStation.Folktails");
    expect(getResearchOptions(save)).not.toContain("WoodenStairs.Folktails");
    expect(getResearchOptions(researchSave("UnlockedBuildingIds"))).toContain("WoodenStairs.Folktails");
    expect(getResearchOptions(researchSave("UnlockedBuildingIds"))).not.toContain("ZiplineStation.Folktails");
    save.Singletons.FactionService.Id = "ModFaction";
    expect(getResearchOptions(save)).toEqual(["Forester.Folktails", "Mod.Research"]);
    save.Singletons.FactionService.Id = "Folktails";
    save.GameVersion = "0.6.0";
    expect(getResearchOptions(save)).toEqual(["Forester.Folktails", "Mod.Research"]);
  });

  it.each([undefined, {}, { UnlockedBuildings: null }, { UnlockedBuildings: [12] },
    { UnlockedBuildings: {}, UnlockedBuildingIds: [] }])("does not overwrite unsupported research data (%j)", service => {
    const save = modernSave();
    save.Singletons.BuildingUnlockingService = service;
    expect(getResearchKey(save)).toBeUndefined();
    expect(updateResearch.bind(null, save, [])).toThrow("no supported");
  });

  it("supports an empty research list and locking everything", () => {
    const save = researchSave();
    save.Singletons.BuildingUnlockingService.UnlockedBuildings = [];
    expect(getResearchKey(save)).toBe("UnlockedBuildings");
    expect(getResearchOptions(save)).toContain("Forester.Folktails");
    expect(getUnlockedResearch(updateResearch(researchSave(), []))).toEqual([]);
  });

  it("offers verified Iron Teeth research in an empty save and after locking and reopening", async () => {
    const save = researchSave();
    save.Singletons.FactionService.Id = "IronTeeth";
    save.Singletons.BuildingUnlockingService.UnlockedBuildings = [];
    const before = structuredClone(save);
    const options = getResearchOptions(save);
    expect(options).toContain("Forester.IronTeeth");
    expect(options).toContain("Numbercruncher.IronTeeth");
    expect(options).toContain("ImpermeableTubeway.IronTeeth");
    expect(options).toContain("ArchOfProgress.IronTeeth");
    expect(options.every(id => id.endsWith(".IronTeeth"))).toBe(true);
    for (const id of ["ScavengerFlag", "BreedingPod", "IndustrialLumberMill", "TeethGrindstone",
      "FluidDump", "DeepMechanicalFluidPump", "BadwaterDischarge", "Valve"]) {
      expect(options).not.toContain(`${id}.IronTeeth`);
    }
    for (const id of ["Discharge", "DeepMechanicalPump", "BadwaterPressurizer", "ThrottlingValve"]) {
      expect(options).toContain(`${id}.IronTeeth`);
    }
    const unlocked = updateResearch(save, ["Forester.IronTeeth"]);
    const reopened = await loadSave(await exportSave(unlocked), save.__originalFilename);
    expect(getUnlockedResearch(reopened)).toEqual(["Forester.IronTeeth"]);
    const locked = await loadSave(await exportSave(updateResearch(reopened, [])), save.__originalFilename);
    expect(getUnlockedResearch(locked)).toEqual([]);
    expect(getResearchOptions(locked)).toEqual(options);
    delete locked.__archive;
    expect(locked).toEqual(before);
    expect(save).toEqual(before);
  });

  it("toggles individual entries, limits bulk edits to search results and adds IDs without duplicates", async () => {
    const user = userEvent.setup();
    const save = researchSave();
    const before = structuredClone(save);
    const onSubmit = vi.fn();
    render(<ResearchPlugin.Editor initialData={save} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByLabelText("Forester.Folktails"));
    expect(screen.getByLabelText("Forester.Folktails")).not.toBeChecked();
    await user.type(screen.getByLabelText("Search research"), "zipline");
    await user.click(screen.getByRole("button", { name: "Unlock all shown" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Lock all shown" }));
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    await user.type(screen.getByLabelText("Building ID"), "NewMod.Building");
    await user.click(screen.getByRole("button", { name: "Add and unlock" }));
    expect(screen.getByLabelText("NewMod.Building")).toBeChecked();
    await user.type(screen.getByLabelText("Building ID"), "NewMod.Building");
    await user.click(screen.getByRole("button", { name: "Add and unlock" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(save).toEqual(before);
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));
    expect(onSubmit).toHaveBeenCalledWith(["Mod.Research", "NewMod.Building"]);
  });

  it("discards changes and rejects blank IDs", async () => {
    const user = userEvent.setup();
    const save = researchSave();
    const before = structuredClone(save);
    const onSubmit = vi.fn(); const onClose = vi.fn();
    render(<ResearchPlugin.Editor initialData={save} onClose={onClose} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Add and unlock" }));
    expect(screen.getByRole("alert")).toHaveTextContent("exact building ID");
    await user.click(screen.getByRole("button", { name: "Lock all shown" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(save).toEqual(before);
  });
});
