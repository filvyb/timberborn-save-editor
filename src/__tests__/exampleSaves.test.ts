// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { loadSave, exportSave } from "../SaveFile";
import { readMapData } from "../MapData";
import { ConstructionUtil } from "../ConstructionUtil";
import { StockpileUtil } from "../StockpileUtil";
import { BeaverUtil } from "../BeaverUtil";
import { getPresetValues } from "../DifficultyPresets";
import { updateProperties } from "../PropertiesUtil";

const directory = resolve("saves");
const files = existsSync(directory) ? readdirSync(directory).filter(name => /\.timber$/i.test(name)) : [];

describe.skipIf(files.length === 0)("local Timberborn 1.1 example saves", () => {
  it.each(files)("loads, edits and exports %s without losing archive or world data", async filename => {
    const bytes = readFileSync(resolve(directory, filename));
    const save = await loadSave(bytes, filename);
    // All supplied saves use Easy: compare every stored preset value with game output.
    for (const [path, value] of Object.entries(getPresetValues(save.Singletons, "easy"))) {
      const [service, key] = path.split(".");
      expect(save.Singletons[service][key]).toBe(Number(value));
    }
    const original = await JSZip.loadAsync(bytes);
    const originalWorld = JSON.parse(await original.file("world.json")!.async("string"));
    const unmodified = await JSZip.loadAsync(await exportSave(save));
    expect(JSON.parse(await unmodified.file("world.json")!.async("string"))).toEqual(originalWorld);
    for (const [name, file] of Object.entries(original.files)) {
      if (name !== "world.json" && !file.dir) expect(await unmodified.file(name)!.async("uint8array")).toEqual(await file.async("uint8array"));
    }
    const map = readMapData(save);
    expect(map.heightMap.length).toBe(save.Singletons.MapSize.Size.X * save.Singletons.MapSize.Size.Y);
    expect(map.waterSurfaces.length).toBeGreaterThan(0);
    // Resource coordinates independently verify voxel indexing in the real game output.
    for (const tree of save.Entities.filter(entity => ["Birch", "Pine", "Oak"].includes(entity.Template))) {
      const { X, Y, Z } = tree.Components.BlockObject.Coordinates;
      expect(map.heightMap[Y * map.mapSizeX + X]).toBe(Z);
    }
    const stockpiles = StockpileUtil.getStockpiles(save);
    expect(stockpiles.length).toBeGreaterThan(0);
    for (const stockpile of stockpiles) {
      expect(Object.keys(StockpileUtil.countGoods(stockpile))).not.toContain("undefined");
      expect(StockpileUtil.getCapacity(stockpile)).toBeGreaterThan(0);
    }
    const stockpile = stockpiles.find(entity => StockpileUtil.getAllowedGoods(entity).length === 1)!;
    const good = StockpileUtil.getAllowedGoods(stockpile)[0];
    const updatedStockpile = StockpileUtil.setGoods(stockpile, { [good]: StockpileUtil.getCapacity(stockpile)! });
    const source = save.Entities.find(entity => entity.Template === "BeaverAdult")!;
    expect(BeaverUtil.getName(source)).not.toBe("Unnamed beaver");
    const clone = BeaverUtil.copy(save, source);
    const constructionIds = new Set(ConstructionUtil.getConstructionSites(save).map(entity => entity.Id));
    expect(constructionIds.size).toBeGreaterThan(0);
    save.Singletons = updateProperties(save.Singletons, { "ScienceService.SciencePoints": "9000" });
    save.Entities = save.Entities.map(entity => entity.Id === stockpile.Id ? updatedStockpile : entity);
    ConstructionUtil.finishAllConstruction(save);
    save.Entities.push(clone);
    const edited = await loadSave(await exportSave(save), "edited.timber");
    expect(edited.Singletons.ScienceService.SciencePoints).toBe(9000);
    expect(ConstructionUtil.getConstructionSites(edited)).toHaveLength(0);
    expect(edited.Entities).toHaveLength(originalWorld.Entities.length + 1);
    expect(edited.Singletons.TerrainMap).toEqual(originalWorld.Singletons.TerrainMap);
    expect(edited.Singletons.WaterMapNew).toEqual(originalWorld.Singletons.WaterMapNew);
    const editedEntities = new Map(edited.Entities.map(entity => [entity.Id, entity]));
    for (const entity of originalWorld.Entities) {
      if (!constructionIds.has(entity.Id) && entity.Id !== stockpile.Id) expect(editedEntities.get(entity.Id)).toEqual(entity);
    }
  }, 30000);
});

describe("bundled legacy examples", () => {
  it.each(["lets-play-plains.json", "iron-teeth-plains-1-1.json"])("supports %s", async filename => {
    const save = await loadSave(readFileSync(resolve("src/examples", filename)), filename);
    expect(readMapData(save).heightMap).toHaveLength(65536);
    const beaver = save.Entities.find(entity => entity.Template === "BeaverAdult")!;
    expect(BeaverUtil.getName(beaver)).not.toBe("Unnamed beaver");
    expect(BeaverUtil.copy(save, beaver).Id).not.toBe(beaver.Id);
    expect((await loadSave(await exportSave(save), "legacy.timber")).Entities).toEqual(save.Entities);
  });
});
