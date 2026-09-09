import { describe, expect, it } from "vitest";
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
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
    ["Levee.Folktails", "box"], ["Dam.IronTeeth", "box"], ["TripleFloodgate.Folktails", "floodgate"],
    ["WaterPump.IronTeeth", "factory"], ["LargeWindTurbine.Folktails", "windmill"],
    ["WaterWheel.Folktails", "wheel"], ["PowerShaft.Folktails", "shaft"], ["GravityBattery.Folktails", "tower"],
    ["DistrictCenter.Folktails", "house"], ["Observatory.Folktails", "observatory"], ["LumberjackFlag.Folktails", "flag"],
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

  it.each([
    ["Cw0", 0.7, 1], ["Cw90", 1, 0.7], ["Cw180", 0.7, 1], ["Cw270", 1, 0.7],
  ] as const)("aligns floodgate walls with the saved %s orientation", (orientation, width, depth) => {
    for (const faction of ["Folktails", "IronTeeth"]) {
      for (const [template, height] of [["Floodgate", 1], ["DoubleFloodgate", 2], ["TripleFloodgate", 3]] as const) {
        const building = entity(`${template}.${faction}`, orientation);
        const visual = getBuildingVisual(building);
        const geometry = createBuildingGeometry(visual);
        const bounds = geometry.boundingBox!.clone().applyMatrix4(getBuildingMatrix(building, visual));
        const size = bounds.getSize(new Vector3());
        expect(size.x).toBeCloseTo(width);
        expect(size.y).toBeCloseTo(height);
        expect(size.z).toBeCloseTo(depth);
        expect(bounds.getCenter(new Vector3()).distanceTo(new Vector3(10, 5 + height / 2, 20))).toBeLessThan(0.00001);
        geometry.dispose();
      }
    }
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
    expect(size.x).toBeCloseTo(7);
    expect(size.z).toBeCloseTo(1);
    expect(bounds.min.x).toBeCloseTo(9.5);
    expect(bounds.min.z).toBeCloseTo(19.5);
    expect(bounds.min.y).toBeGreaterThanOrEqual(5);
    geometry.dispose();
  });

  it.each(["Cw0", "Cw90", "Cw180", "Cw270"].flatMap(orientation =>
    [false, true].map(flipped => ({ orientation, flipped }))))("spiral stairs climb one quarter turn with $orientation, flipped=$flipped", ({ orientation, flipped }) => {
    const building = entity("SpiralStairs.Folktails", orientation);
    building.Components.BlockObject.Flipped = flipped;
    const visual = getBuildingVisual(building);
    const matrix = getBuildingMatrix(building, visual);
    const geometry = createBuildingGeometry(visual).applyMatrix4(matrix);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    // Sample the walking surface between the +Y entrance and -X exit in local space.
    // Rotation and mirroring must carry that same quarter turn to the saved landings.
    for (let step = 0; step < 8; step++) {
      const angle = (step + 0.5) * Math.PI / 16;
      const point = new Vector3(0.7 * Math.cos(angle) - 0.5, 0, 0.5 - 0.7 * Math.sin(angle)).applyMatrix4(matrix);
      const hits = new Raycaster(new Vector3(point.x, 10, point.z), new Vector3(0, -1, 0)).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(5 + (step + 1) / 8);
    }
    // The unused outer corner stays open instead of continuing around the tile.
    const open = new Vector3(0.4, 0, -0.4).applyMatrix4(matrix);
    expect(new Raycaster(new Vector3(open.x, 10, open.z), new Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    geometry.dispose(); material.dispose();
  });

  it("gives the observatory a 3x3 footprint, four-tile height, dome and projecting telescope", () => {
    const visual = getBuildingVisual(entity("Observatory.Folktails"));
    expect(visual).toMatchObject({ shape: "observatory", size: [3, 4, 3] });
    const geometry = createBuildingGeometry(visual);
    const size = geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(3);
    expect(size.y).toBeCloseTo(4);
    expect(size.z).toBeCloseTo(3);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const heightAt = (x: number, z: number) => new Raycaster(new Vector3(x, 10, z), new Vector3(0, -1, 0))
      .intersectObject(mesh)[0].point.y;
    expect(heightAt(1, 1.5)).toBeGreaterThan(heightAt(2, 1.5)); // domed roof
    expect(heightAt(1, 0)).toBeGreaterThan(heightAt(1, 1.5)); // raised telescope at the front
    geometry.dispose(); material.dispose();
  });

  it.each([
    ["Cw0", 0, -1], ["Cw90", -1, 0], ["Cw180", 0, 1], ["Cw270", 1, 0],
  ] as const)("stairs rise toward the upper landing for %s", (orientation, dx, dz) => {
    const building = entity("Stairs.Folktails", orientation);
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual).applyMatrix4(getBuildingMatrix(building, visual));
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const heightAt = (offset: number) => new Raycaster(new Vector3(10 + dx * offset, 10, 20 + dz * offset), new Vector3(0, -1, 0))
      .intersectObject(mesh)[0].point.y;
    expect(heightAt(0.4)).toBeCloseTo(6);
    expect(heightAt(-0.4)).toBeCloseTo(5.2);
    geometry.dispose(); material.dispose();
  });

  it.each([1, 2, 3, 4, 5, 6])("joins opposing bridges with %s suspended tiles without a gap", span => {
    const boundsAt = (y: number, orientation: string) => {
      const building = entity(`SuspensionBridge${span}x1.Folktails`, orientation);
      building.Components.BlockObject.Coordinates = { X: 0, Y: y, Z: 0 };
      const visual = getBuildingVisual(building);
      const geometry = createBuildingGeometry(visual);
      const bounds = geometry.boundingBox!.clone().applyMatrix4(getBuildingMatrix(building, visual));
      geometry.dispose();
      return bounds;
    };
    const south = boundsAt(0, "Cw0");
    const north = boundsAt(2 * span + 1, "Cw180");
    expect(south.max.z).toBeCloseTo(north.min.z);
    expect(south.min.x).toBeCloseTo(-0.5);
    expect(north.min.x).toBeCloseTo(south.min.x);
    expect(north.max.x).toBeCloseTo(south.max.x);
  });

  it.each(["LumberMill", "GearWorkshop", "PaperMill"])("places %s along the factory row without covering the path", template => {
    // Rotate a 2x3 workshop footprint beside a path in the next row.
    const building = entity(`${template}.Folktails`, "Cw270");
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual);
    const bounds = geometry.boundingBox!.clone().applyMatrix4(getBuildingMatrix(building, visual));
    expect(bounds.min.x).toBeCloseTo(7.5);
    expect(bounds.max.x).toBeCloseTo(10.5);
    expect(bounds.min.z).toBeCloseTo(19.5);
    expect(bounds.max.z).toBeCloseTo(21.5); // path occupies Y=22
    geometry.dispose();
  });

  it.each(["Folktails", "IronTeeth"])("keeps the large warehouse below the next floor for %s", faction => {
    const building = entity(`LargeWarehouse.${faction}`);
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual);
    const bounds = geometry.boundingBox!.clone().applyMatrix4(getBuildingMatrix(building, visual));
    expect(bounds.getSize(new Vector3()).toArray()).toEqual([3, 2, 3]);
    expect(bounds.max.y).toBe(7);
    geometry.dispose();
  });

  it.each(["Windmill", "LargeWindmill", "WindTurbine", "LargeWindTurbine"])("connects the %s rotor to its mast", template => {
    const visual = getBuildingVisual(entity(`${template}.Folktails`));
    const geometry = createBuildingGeometry(visual);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const [w, h] = visual.size;
    const hits = new Raycaster(new Vector3(w / 2 - 0.5, h * 0.75, -1), new Vector3(0, 0, 1))
      .intersectObject(new Mesh(geometry, material));
    // Walk the intersected solid intervals along the axle. A gap means floating blades.
    const crossings = [...new Map(hits.map(hit => {
      const delta = hit.face!.normal.z < 0 ? 1 : -1;
      return [`${hit.distance.toFixed(5)}:${delta}`, { distance: hit.distance, delta }] as const;
    })).values()];
    expect(crossings.length).toBeGreaterThanOrEqual(4);
    let inside = 0;
    crossings.forEach((crossing, index) => {
      inside += crossing.delta;
      if (index < crossings.length - 1 && crossings[index + 1].distance - crossing.distance > 0.00001) {
        expect(inside, `disconnected rotor at distance ${crossing.distance}`).toBeGreaterThan(0);
      }
    });
    expect(inside).toBe(0);
    geometry.dispose(); material.dispose();
  });

  it("mirrors a flipped building inside the same footprint", () => {
    // Use a building wider than one tile so a missing mirror offset is detectable.
    const building = entity("Gristmill.Folktails", "Cw270");
    const visual = getBuildingVisual(building);
    const geometry = createBuildingGeometry(visual);
    const original = new Box3().copy(geometry.boundingBox!).applyMatrix4(getBuildingMatrix(building, visual));
    building.Components.BlockObject.Flipped = true;
    const flipped = new Box3().copy(geometry.boundingBox!).applyMatrix4(getBuildingMatrix(building, visual));
    expect(flipped.min.distanceTo(original.min)).toBeLessThan(0.00001);
    expect(flipped.max.distanceTo(original.max)).toBeLessThan(0.00001);
    geometry.dispose();
  });

  it.each([
    ["Cw0", 0, 1], ["Cw90", 1, 0], ["Cw180", 0, -1], ["Cw270", -1, 0],
  ] as const)("overhangs extend from their anchor along the saved %s direction", (orientation, dx, dz) => {
    for (const length of [2, 3, 4, 5, 6]) {
      const building = entity(`Overhang${length}x1.Folktails`, orientation);
      const visual = getBuildingVisual(building);
      const geometry = createBuildingGeometry(visual).applyMatrix4(getBuildingMatrix(building, visual));
      const center = geometry.boundingBox!.getCenter(new Vector3());
      expect(center.x).toBeCloseTo(10 + dx * (length - 1) / 2);
      expect(center.z).toBeCloseTo(20 + dz * (length - 1) / 2);
      const material = new MeshBasicMaterial();
      const mesh = new Mesh(geometry, material);
      // The end of the span has only a thin deck, with no misplaced support wall.
      const tip = new Vector3(10 + dx * (length - 1), 5.5, 20 + dz * (length - 1));
      expect(new Raycaster(tip, new Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
      expect(new Raycaster(tip.setY(8), new Vector3(0, -1, 0)).intersectObject(mesh)[0].point.y).toBeCloseTo(6);
      geometry.dispose(); material.dispose();
    }
  });

  it("places adjacent overhangs side by side without overlapping", () => {
    const bounds = Array.from({ length: 2 }, (_, i) => {
      const building = entity("Overhang4x1.Folktails", "Cw180");
      building.Components.BlockObject.Coordinates = { X: i, Y: 0, Z: 0 };
      const visual = getBuildingVisual(building);
      const geometry = createBuildingGeometry(visual).applyMatrix4(getBuildingMatrix(building, visual));
      const bounds = geometry.boundingBox!.clone(); geometry.dispose(); return bounds;
    });
    bounds.forEach((box, i) => {
      expect(box.min.z).toBeCloseTo(-3.5);
      expect(box.max.z).toBeCloseTo(0.5);
      if (i) expect(box.min.x).toBeCloseTo(bounds[i - 1].max.x);
    });
  });

  it.each([
    ["Cw0", 3, 1], ["Cw90", 1, 3], ["Cw180", 3, 1], ["Cw270", 1, 3],
  ] as const)("power wheels have a 3x1 footprint and a transverse axle for %s", (orientation, width, depth) => {
    const building = entity("PowerWheel.Folktails", orientation);
    const visual = getBuildingVisual(building);
    const matrix = getBuildingMatrix(building, visual);
    const geometry = createBuildingGeometry(visual).applyMatrix4(matrix);
    const size = geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(width); expect(size.z).toBeCloseTo(depth);
    const material = new MeshBasicMaterial();
    const origin = new Vector3(1, 1.05, -2).applyMatrix4(matrix);
    const direction = new Vector3(0, 0, 1).transformDirection(matrix);
    const hits = new Raycaster(origin, direction).intersectObject(new Mesh(geometry, material));
    expect(hits[0].distance).toBeCloseTo(1.5);
    geometry.dispose(); material.dispose();
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
