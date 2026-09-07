import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import type { UnknownEntity } from "../DemoSave";
import { readEntityData, writeEntityData, getMapEntityKind } from "../MapEntities";
import { getBuildingVisual } from "../BuildingVisuals";
import { createBuildingGeometry, getBuildingMatrix } from "../BuildingGeometry";
import { modernSave } from "./fixtures";

function entity(Template: string, orientation: string | { Value: string } = "Cw0"): UnknownEntity {
  return { Id: Template, Template, Components: { BlockObject: { Coordinates: { X: 10, Y: 20, Z: 5 }, Orientation: orientation } } };
}

describe("map building coverage", () => {
  it.each([
    ["Lodge.Folktails", "house"], ["LargeRowhouse.IronTeeth", "house"], ["GearWorkshop.Folktails", "factory"],
    ["BotAssembler.Folktails", "factory"], ["EfficientFarmHouse.Folktails", "factory"],
    ["Levee.Folktails", "box"], ["Dam.IronTeeth", "box"], ["TripleFloodgate.Folktails", "gate"],
    ["WaterPump.IronTeeth", "factory"], ["LargeWindTurbine.Folktails", "windmill"],
    ["WaterWheel.Folktails", "wheel"], ["PowerShaft.Folktails", "shaft"], ["GravityBattery.Folktails", "tower"],
    ["DistrictCenter.Folktails", "house"], ["Observatory.Folktails", "tower"], ["LumberjackFlag.Folktails", "flag"],
    ["SuspensionBridge6x1.Folktails", "bridge"], ["Overhang4x1.Folktails", "overhang"],
    ["SpiralStairs.Folktails", "spiral"], ["Stairs.IronTeeth", "stairs"], ["TriplePlatform.Folktails", "platform"],
    ["SmallTank.Folktails", "tank"], ["LargeTank.IronTeeth", "tank"], ["Roof3x2.Folktails", "roof"],
    ["RuinColumnH8", "box"], ["BadwaterSource", "source"], ["Carrot", "crop"], ["SmallPile.Folktails", "pile"],
  ])("renders %s as %s", (template, shape) => {
    const building = entity(template);
    expect(getMapEntityKind(building)).toBe("object");
    const visual = getBuildingVisual(building);
    expect(visual.shape).toBe(shape);
    expect(visual.fallback).toBe(false);
    const geometry = createBuildingGeometry(visual);
    expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect([...geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
    expect(geometry.boundingBox!.isEmpty()).toBe(false);
    geometry.dispose();
  });

  it("renders unfamiliar and modded templates instead of silently filtering them out", () => {
    const save = modernSave();
    const unknown = entity("ModdedBuilding.NewFaction");
    unknown.Components.ModData = { preserve: true };
    save.Entities.push(unknown);
    const data = readEntityData(save);
    expect(data.entitiesByIds[unknown.Id]).toEqual(unknown);
    expect(getBuildingVisual(unknown)).toMatchObject({ fallback: true, shape: "box", category: "Other" });
    expect(writeEntityData(save, data)).toEqual(save);
  });

  it("includes oaks, crops, paths, bots and both generations of beaver positions exactly once", () => {
    const save = modernSave();
    save.Entities = [entity("Oak"), entity("Carrot"), entity("Path"), entity("Lodge.Folktails"),
      { Id: "bot", Template: "Bot.Folktails", Components: { Character: { Position: { X: 1, Y: 2, Z: 3 } } } },
      { Id: "legacy", Template: "BeaverAdult", Components: { Beaver: { Position: { X: 1, Y: 2, Z: 3 } } } }];
    const data = readEntityData(save);
    expect(Object.keys(data.entitiesByIds)).toHaveLength(6);
    expect(Object.values(data.entitiesIdsByTemplate).flat()).toHaveLength(6);
    expect(getMapEntityKind(save.Entities[0])).toBe("tree");
    expect(getMapEntityKind(save.Entities[4])).toBe("character");
    expect(getMapEntityKind(save.Entities[5])).toBe("character");
  });

  it("skips invalid placements without discarding their data when the map is saved", () => {
    const save = modernSave();
    save.Entities.push({ Id: "service", Template: "ModService", Components: {} });
    const invalid = entity("BrokenBuilding"); invalid.Components.BlockObject.Coordinates.Z = NaN;
    save.Entities.push(invalid);
    const data = readEntityData(save);
    expect(data.entitiesByIds.service).toBeUndefined();
    expect(data.entitiesByIds.BrokenBuilding).toBeUndefined();
    expect(writeEntityData(save, data)).toEqual(save);
  });

  it.each(["Cw90", { Value: "Cw90" }])("rotates a bridge around its saved anchor using %j", orientation => {
    const building = entity("SuspensionBridge6x1.Folktails", orientation);
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual);
    const bounds = new Box3().copy(geometry.boundingBox!).applyMatrix4(getBuildingMatrix(building, visual));
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(6);
    expect(bounds.min.x).toBeCloseTo(9.5);
    expect(bounds.min.z).toBeCloseTo(14.5);
    expect(bounds.min.y).toBeGreaterThanOrEqual(5);
    geometry.dispose();
  });

  it("mirrors a flipped building inside the same footprint", () => {
    const building = entity("Overhang4x1.Folktails", "Cw270");
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual);
    const original = new Box3().copy(geometry.boundingBox!).applyMatrix4(getBuildingMatrix(building, visual));
    building.Components.BlockObject.Flipped = true;
    const flipped = new Box3().copy(geometry.boundingBox!).applyMatrix4(getBuildingMatrix(building, visual));
    expect(flipped.min.distanceTo(original.min)).toBeLessThan(0.00001);
    expect(flipped.max.distanceTo(original.max)).toBeLessThan(0.00001);
    geometry.dispose();
  });

  it("updates only the selected inventory and preserves every newly displayed building", () => {
    const save = modernSave(); save.Entities.push(entity("Lodge.Folktails"), entity("WaterWheel.Folktails"));
    const before = structuredClone(save);
    const data = readEntityData(save);
    const stockpile = structuredClone(data.entitiesByIds.storage);
    stockpile.Components["Inventory:Stockpile"].Storage.Goods[0].Amount = 5;
    data.entitiesByIds.storage = stockpile;
    data.updateIds.push("storage");
    const result = writeEntityData(save, data);
    expect(save).toEqual(before);
    expect(result.Entities.filter(entity => entity.Id !== "storage")).toEqual(save.Entities.filter(entity => entity.Id !== "storage"));
    expect(result.Entities[0].Components["Inventory:Stockpile"].Storage.Goods[0].Amount).toBe(5);
  });
});
