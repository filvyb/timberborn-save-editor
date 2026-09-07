import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportSave, loadSave, serializeSave } from "../SaveFile";
import { StockpileUtil } from "../StockpileUtil";
import { BeaverUtil } from "../BeaverUtil";
import { ConstructionUtil } from "../ConstructionUtil";
import { getPropertyFields, updateProperties } from "../PropertiesUtil";
import { readMapData } from "../MapData";
import { createTerrainGeometry } from "../TerrainGeometry";
import { modernSave, storage } from "./fixtures";

async function archive() {
  const zip = new JSZip();
  zip.file("save_metadata.json", JSON.stringify({ Cycle: 17, Day: 14, Mods: [{ Name: "Example" }] }));
  zip.file("save_thumbnail.jpg", new Uint8Array([255, 216, 255, 217]));
  zip.file("version.txt", "1.1.2.4-52e959e-sw\r\n");
  zip.file("unknown.bin", new Uint8Array([0, 1, 128, 255]));
  zip.file("world.json", serializeSave(modernSave()));
  return zip.generateAsync({ type: "uint8array" });
}

describe("save archives", () => {
  it("reads world.json regardless of ZIP entry order and preserves every entry", async () => {
    const bytes = await archive();
    const save = await loadSave(bytes, "EXAMPLE.TIMBER");
    expect(save.GameVersion).toBe("1.1.2.4-52e959e-sw");
    const original = await JSZip.loadAsync(bytes);
    const exported = await JSZip.loadAsync(await exportSave(save));
    expect(Object.keys(exported.files)).toEqual(Object.keys(original.files));
    for (const name of Object.keys(original.files)) {
      expect(await exported.file(name)!.async("uint8array")).toEqual(await original.file(name)!.async("uint8array"));
    }
  });
  it("preserves unknown fields and version while updating save-list cycle metadata", async () => {
    const save = await loadSave(await archive(), "example.timber");
    save.Singletons.GameCycleService.CycleDay = 15;
    const exported = await JSZip.loadAsync(await exportSave(save));
    expect(JSON.parse(await exported.file("save_metadata.json")!.async("string"))).toEqual({ Cycle: 17, Day: 15, Mods: [{ Name: "Example" }] });
    const world = JSON.parse(await exported.file("world.json")!.async("string"));
    expect(world.GameVersion).toBe(save.GameVersion);
    expect(world.__archive).toBeUndefined();
    expect(world.__originalFilename).toBeUndefined();
    expect(world.Singletons.UnknownService).toEqual(save.Singletons.UnknownService);
  });
  it("loads JSON and exports it as a world archive", async () => {
    const save = await loadSave(new TextEncoder().encode(serializeSave(modernSave())), "example.JSON");
    expect((await loadSave(await exportSave(save), "example.timber")).Entities).toEqual(save.Entities);
  });
  it("rejects metadata masquerading as a save", async () => {
    await expect(loadSave(new TextEncoder().encode('{"Cycle":1}'), "metadata.json")).rejects.toThrow("world save");
  });
  it("rejects missing world.json and corrupt ZIP files", async () => {
    const zip = new JSZip().file("metadata.json", "{}");
    await expect(loadSave(await zip.generateAsync({ type: "uint8array" }), "bad.timber")).rejects.toThrow("world.json");
    await expect(loadSave(new Uint8Array([1,2,3]), "bad.timber")).rejects.toThrow();
  });
  it("refuses to serialize non-finite numbers", () => {
    const save = modernSave(); save.Singletons.ScienceService.SciencePoints = NaN;
    expect(() => serializeSave(save)).toThrow("invalid number");
  });
});

describe("inventories", () => {
  it.each(["Log", { Id: "Log" }])("preserves the goods encoding and unknown inventory fields (%j)", good => {
    const original = storage(good);
    const updated = StockpileUtil.setGoods(original, { Log: 10 });
    expect(StockpileUtil.countGoods(updated)).toEqual({ Log: 10 });
    expect(updated.Components["Inventory:Stockpile"].Storage.Goods[0]).toEqual({ Good: good, Amount: 10, Extra: "retain" });
    expect(updated.Components["Inventory:Stockpile"].Storage.UnknownStorageField).toBe(12);
    expect(StockpileUtil.countGoods(original)).toEqual({ Log: 3 });
  });
  it("distinguishes old and new small warehouse capacities", () => {
    expect(StockpileUtil.getCapacity(storage("Log", "SmallWarehouse.Folktails"))).toBe(30);
    expect(StockpileUtil.getCapacity(storage({ Id: "Log" }, "SmallWarehouse.Folktails"))).toBe(200);
  });
  it("recognizes empty current storages without a serialized inventory", () => {
    const entity = storage(); delete entity.Components["Inventory:Stockpile"];
    const save = modernSave(); save.Entities = [entity];
    expect(StockpileUtil.getStockpiles(save)).toEqual([entity]);
    expect(StockpileUtil.countGoods(StockpileUtil.setGoods(entity, { Log: 20 }))).toEqual({ Log: 20 });
  });
  it("restricts bulk edits to matching allowed goods", () => {
    expect(StockpileUtil.canApplyTo(storage("Log"), storage("Plank"))).toBe(false);
    expect(StockpileUtil.canApplyTo(storage("Log"), storage("Log"))).toBe(true);
  });
  it.each([-1, NaN, Infinity, 0.5, 21])("rejects invalid or over-capacity amount %s", amount => {
    expect(() => StockpileUtil.setGoods(storage(), { Log: amount })).toThrow();
  });
  it("rejects increasing disallowed goods", () => {
    expect(() => StockpileUtil.setGoods(storage(), { Water: 10 })).toThrow("does not allow");
  });
});

describe("beavers and construction", () => {
  it("clones without mutating the donor or retaining task, home, work and reservation references", () => {
    const save = modernSave(); const source = save.Entities[2]; const before = structuredClone(source);
    const clone = BeaverUtil.copy(save, source);
    expect(source).toEqual(before);
    expect(clone.Id).not.toBe(source.Id);
    expect(BeaverUtil.getName(clone)).toBe("New name");
    expect(clone.Components.Character.DayOfBirth).toBe(327);
    expect(clone.Components.Character.Name).toBeUndefined();
    expect(clone.Components.LifeProgressor.LifeProgress).toBe(0);
    for (const key of ["Worker", "Dweller", "GoodCarrier", "GoodReserver", "Walker", "WalkToAccessibleExecutor"]) expect(clone.Components[key]).toBeUndefined();
    expect(clone.Components.BehaviorManager.RunningBehavior).toBe(`${clone.Id}:WanderRootBehavior`);
    expect(clone.Components.Citizen).toEqual(source.Components.Citizen);
    expect(clone.Components.UnknownComponent).toEqual(source.Components.UnknownComponent);
  });
  it("reads and renames legacy Beaver and Character components", () => {
    for (const key of ["Beaver", "Character"]) {
      const beaver = { Id: "old", Template: "BeaverAdult", Components: { [key]: { Name: "Before" } } };
      BeaverUtil.setName(beaver, "After"); expect(BeaverUtil.getName(beaver)).toBe("After");
    }
  });
  it("finishes new sites and retains delivered goods", () => {
    const save = modernSave(); const site = save.Entities[1];
    const goods = structuredClone(site.Components["Inventory:ConstructionSite"]);
    expect(ConstructionUtil.getConstructionSites(save)).toHaveLength(1);
    ConstructionUtil.finishAllConstruction(save);
    expect(ConstructionUtil.getConstructionSites(save)).toHaveLength(0);
    expect(site.Components.BlockObjectState).toEqual({ Finished: true, Unknown: true });
    expect(site.Components.ConstructionSite).toBeUndefined();
    expect(site.Components["Inventory:ConstructionSite"]).toEqual(goods);
    expect(site.Components.Constructible).toBeUndefined();
  });
  it("supports old Constructible fields", () => {
    const entity = { Id: "old", Template: "Platform", Components: { Constructible: { Finished: false }, ConstructionSite: { BuildTimeProgressInHoursKey: 0 } } };
    ConstructionUtil.finishConstruction(entity);
    expect(entity.Components.Constructible.Finished).toBe(true);
    expect(entity.Components.ConstructionSite.BuildTimeProgressInHoursKey).toBe(1);
  });
});

describe("properties and maps", () => {
  it("edits only existing weather fields, preserving unknown services", () => {
    const original = modernSave().Singletons;
    expect(getPropertyFields(original).some(field => field.service === "BadtideWeather")).toBe(true);
    const updated = updateProperties(original, { "ScienceService.SciencePoints": "5000", "WeatherService.Cycle": "100" });
    expect(updated.ScienceService.SciencePoints).toBe(5000);
    expect(updated.WeatherService).toBeUndefined();
    expect(updated.UnknownService).toEqual(original.UnknownService);
    expect(original.ScienceService.SciencePoints).toBe(4170);
  });
  it.each(["", "NaN", "Infinity", "-1", "1.2"])("rejects invalid science %j", value => {
    expect(() => updateProperties(modernSave().Singletons, { "ScienceService.SciencePoints": value })).toThrow();
  });
  it("rejects reversed weather ranges", () => {
    expect(() => updateProperties(modernSave().Singletons, { "DroughtWeather.MinDroughtDuration": "5" })).toThrow("Minimum");
  });
  it("decodes rectangular voxel maps and water floors", () => {
    const map = readMapData(modernSave());
    expect([...map.heightMap]).toEqual([1, 2, 0, 2, 1, 1]);
    expect(map.i2xy(4)).toEqual([1, 1]);
    expect(map.waterSurfaces).toEqual([{ x: 2, y: 0, height: 0.5, contamination: 0.8 }]);
  });
  it("draws exposed voxel faces without filling caves", () => {
    const save = modernSave(); save.Singletons.MapSize.Size = { X: 1, Y: 1 };
    save.Singletons.TerrainMap.Voxels.Array = "1 0 1";
    save.Singletons.WaterMapNew.WaterColumns.Array = "0";
    const geometry = createTerrainGeometry(readMapData(save));
    expect(geometry.getAttribute("position").count).toBe(72); // Two separate cubes: 12 faces, 6 vertices each.
    geometry.dispose();
  });
  it("supports legacy height maps", () => {
    const save = modernSave(); save.Singletons.TerrainMap = { Heights: { Array: "1 2 3 4 5 6" } };
    delete save.Singletons.WaterMapNew;
    save.Singletons.WaterMap = { WaterDepths: { Array: "0 0 0 0.5 0 0" } };
    const map = readMapData(save);
    expect([...map.heightMap]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(map.waterSurfaces[0].height).toBe(4.5);
  });
});
