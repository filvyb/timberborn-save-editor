// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { loadSave, exportSave } from "../SaveFile";
import { readEntityData, writeEntityData } from "../MapEntities";
import { getBuildingVisual } from "../BuildingVisuals";
import { createBuildingGeometry } from "../BuildingGeometry";
import { readMapData } from "../MapData";
import { getPropertyFields, updateProperties } from "../PropertiesUtil";
import { StockpileUtil } from "../StockpileUtil";
import { ConstructionUtil } from "../ConstructionUtil";
import { expectSaveArchive, worldData } from "./saveAssertions";

const directory = resolve("saves");
const files = existsSync(directory) ? readdirSync(directory).filter(name => /\.timber$/i.test(name)) : [];

describe.skipIf(files.length === 0)("local save compatibility", () => {
  it.each(files)("round-trips %s without losing archive, world or map entity data", async filename => {
    const bytes = readFileSync(resolve(directory, filename));
    const save = await loadSave(bytes, filename);
    const original = await JSZip.loadAsync(bytes);
    const originalWorld = JSON.parse(await original.file("world.json")!.async("string"));
    const unmodified = await JSZip.loadAsync(await exportSave(save));
    expect(JSON.parse(await unmodified.file("world.json")!.async("string"))).toEqual(originalWorld);
    for (const [name, file] of Object.entries(original.files)) {
      if (name !== "world.json" && !file.dir) expect(await unmodified.file(name)!.async("uint8array")).toEqual(await file.async("uint8array"));
    }
    const mapEntities = readEntityData(save);
    expect(writeEntityData(save, mapEntities)).toEqual(save);
    const templates = new Map(save.Entities.filter(entity => entity.Components.BlockObject).map(entity => [entity.Template, entity]));
    for (const entity of templates.values()) {
      const geometry = createBuildingGeometry(getBuildingVisual(entity));
      expect([...geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
    const map = readMapData(save);
    expect(map.heightMap.length).toBe(save.Singletons.MapSize.Size.X * save.Singletons.MapSize.Size.Y);
    expect([...map.heightMap].every(Number.isFinite)).toBe(true);
    for (const surface of map.waterSurfaces) {
      expect([surface.x, surface.y, surface.height, surface.contamination].every(Number.isFinite)).toBe(true);
    }
  }, 30000);

  it.for(files)("preserves unrelated data when editing supported fields in %s", { timeout: 30000 }, async (filename, context) => {
    const bytes = readFileSync(resolve(directory, filename));
    const save = await loadSave(bytes, filename);
    const expected = worldData(save);
    const original = await JSZip.loadAsync(bytes);
    let edits = 0;
    // Discover targets by capability; no filename, faction, entity ID or difficulty assumptions.
    const property = getPropertyFields(save.Singletons).find(field =>
      ["SciencePoints", "Cycle", "CycleDay"].includes(field.key));
    if (property) {
      const { service, key } = property;
      const value = save.Singletons[service][key] === property.min ? property.min + 1 : property.min;
      save.Singletons = updateProperties(save.Singletons, { [`${service}.${key}`]: String(value) });
      expected.Singletons[service][key] = value;
      edits++;
    }
    const stockpile = StockpileUtil.getStockpiles(save).find(entity => {
      const goods = entity.Components["Inventory:Stockpile"]?.Storage?.Goods;
      const capacity = StockpileUtil.getCapacity(entity);
      return goods?.length === 1 && Number.isSafeInteger(goods[0].Amount) && goods[0].Amount > 1 &&
        StockpileUtil.goodId(goods[0].Good) && (capacity === undefined || goods[0].Amount <= capacity);
    });
    if (stockpile) {
      const goods = stockpile.Components["Inventory:Stockpile"].Storage.Goods[0];
      const updated = StockpileUtil.setGoods(stockpile, { [StockpileUtil.goodId(goods.Good)!]: goods.Amount - 1 });
      save.Entities = save.Entities.map(entity => entity.Id === stockpile.Id ? updated : entity);
      expected.Entities.find(entity => entity.Id === stockpile.Id)!.Components["Inventory:Stockpile"].Storage.Goods[0].Amount--;
      edits++;
    }
    const site = ConstructionUtil.getConstructionSites(save)[0];
    if (site) {
      ConstructionUtil.finishConstruction(site);
      const components = expected.Entities.find(entity => entity.Id === site.Id)!.Components;
      if (components.BlockObjectState) {
        components.BlockObjectState.Finished = true;
        delete components.ConstructionSite;
      } else {
        components.Constructible.Finished = true;
        if (components.ConstructionSite) components.ConstructionSite.BuildTimeProgressInHoursKey = 1;
      }
      edits++;
    }
    if (!edits) context.skip();
    const cycle = expected.Singletons.GameCycleService ?? expected.Singletons.WeatherService ?? expected.Singletons.CycleService;
    const metadataPatch = cycle ? { Cycle: cycle.Cycle, Day: cycle.CycleDay } : undefined;
    const exported = await exportSave(save);
    const first = await expectSaveArchive(exported, expected, original, metadataPatch);
    const reopened = await loadSave(exported, "reopened.timber");
    expect(worldData(reopened)).toEqual(expected);
    await expectSaveArchive(await exportSave(reopened), expected, first);
  });
});

describe("bundled examples", () => {
  const examples = resolve("src/examples");
  it.each(readdirSync(examples).filter(name => /\.json$/i.test(name)))("round-trips %s", async filename => {
    const bytes = readFileSync(resolve(examples, filename));
    const original = JSON.parse(bytes.toString());
    const save = await loadSave(bytes, filename);
    const { X, Y } = save.Singletons.MapSize.Size;
    expect(readMapData(save).heightMap).toHaveLength(X * Y);
    expect(writeEntityData(save, readEntityData(save))).toEqual(save);
    const zip = await JSZip.loadAsync(await exportSave(save));
    expect(JSON.parse(await zip.file("world.json")!.async("string"))).toEqual(original);
  });
});
