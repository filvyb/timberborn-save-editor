import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { UnknownEntity } from "../DemoSave";
import { getBuildingVisual } from "../BuildingVisuals";
import { createBuildingGeometry } from "../BuildingGeometry";

const building = (name: string): UnknownEntity => ({ Id: name, Template: `${name}.Folktails`,
  Components: { BlockObject: { Coordinates: { X: 10, Y: 20, Z: 5 }, Orientation: "Cw0" } } });

describe("building geometry", () => {
  it.each(["BadwaterDome", "BrazierOfBonding", "FountainOfJoy", "HallOfAbundance", "MudPit",
    "ContemplationSpot", "Detailer", "Discharge", "DepthSensor", "PopulationCounter", "Gristmill", "DirtExcavator", "PowerWheel"])(
    "%s has finite geometry within its declared footprint", name => {
      const entity = building(name);
      const visual = getBuildingVisual(entity);
      expect(visual.fallback).toBe(false);
      expect(visual.shape).not.toBe("box");
      const geometry = createBuildingGeometry(visual);
      const [w, h, d] = visual.size;
      const bounds = geometry.boundingBox!;
      expect(bounds.min.x).toBeGreaterThanOrEqual(-0.50001);
      expect(bounds.max.x).toBeLessThanOrEqual(w - 0.49999);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-0.50001);
      expect(bounds.max.z).toBeLessThanOrEqual(d - 0.49999);
      expect(bounds.max.y - bounds.min.y).toBeCloseTo(h);
      expect([...geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
      geometry.dispose();
    });

  it("keeps the fountain's overhanging basin above the ground", () => {
    const material = new MeshBasicMaterial();
    const fountain = createBuildingGeometry(getBuildingVisual(building("FountainOfJoy")));
    const mesh = new Mesh(fountain, material);
    expect(new Raycaster(new Vector3(-2, 0.5, 0), new Vector3(1, 0, 0)).intersectObject(mesh)).toHaveLength(0);
    expect(new Raycaster(new Vector3(-2, 1.55, 2), new Vector3(1, 0, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
    fountain.dispose(); material.dispose();
  });

  it("gives the hall a 5x5 cross with empty corners and two open passages", () => {
    const visual = getBuildingVisual(building("HallOfAbundance"));
    expect(visual.size).toEqual([5, 5, 5]);
    const geometry = createBuildingGeometry(visual);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    for (const x of [0, 4]) for (const z of [0, 4]) {
      expect(new Raycaster(new Vector3(x, 8, z), new Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    }
    for (const [x, z] of [[2, 0], [2, 4], [0, 2], [4, 2], [2, 2]]) {
      expect(new Raycaster(new Vector3(x, 8, z), new Vector3(0, -1, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
    }
    expect(new Raycaster(new Vector3(2, 0.5, -2), new Vector3(0, 0, 1)).intersectObject(mesh)).toHaveLength(0);
    expect(new Raycaster(new Vector3(-2, 0.5, 2), new Vector3(1, 0, 0)).intersectObject(mesh)).toHaveLength(0);
    geometry.dispose(); material.dispose();
  });

  it("raises the excavator entrance one tile and leaves space beneath the drill", () => {
    const entity = building("DirtExcavator");
    const visual = getBuildingVisual(entity);
    expect(visual).toMatchObject({ shape: "excavator", size: [5, 3, 6] });
    const geometry = createBuildingGeometry(visual);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    // The front deck meets a platform one tile above the foundation.
    const hits = new Raycaster(new Vector3(2, 2, 0), new Vector3(0, -1, 0)).intersectObject(mesh);
    expect(hits[0].point.y).toBeCloseTo(1);
    expect(geometry.boundingBox!.max.z).toBeCloseTo(5.5);
    // A horizontal ray passes beneath the drill without hitting an invented factory floor.
    expect(new Raycaster(new Vector3(-1, 0.1, 3), new Vector3(1, 0, 0)).intersectObject(mesh)).toHaveLength(0);
    geometry.dispose(); material.dispose();
  });

  it("hangs the fluid dump outlet below the anchor and keeps the worker on the anchor tile", () => {
    const entity = building("Discharge");
    const visual = getBuildingVisual(entity);
    const geometry = createBuildingGeometry(visual);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const topAt = (z: number) => new Raycaster(new Vector3(0, 3, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0].point.y;
    expect(topAt(0)).toBeCloseTo(1);
    expect(topAt(1.3)).toBeLessThan(0.5);
    expect(geometry.boundingBox!.min.y).toBeCloseTo(-1);
    geometry.dispose(); material.dispose();
  });
});
