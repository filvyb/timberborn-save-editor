import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { UnknownEntity } from "../DemoSave";
import { getBuildingVisual } from "../BuildingVisuals";
import { createBuildingGeometry, getBuildingMatrix } from "../BuildingGeometry";
import { getZiplineAnchor, getZiplineCablePoints, getZiplineConnections } from "../Ziplines";

function node(Id: string, template = "ZiplinePylon", targets: unknown = []): UnknownEntity {
  return { Id, Template: `${template}.Folktails`, Components: {
    BlockObject: { Coordinates: { X: 10, Y: 20, Z: 5 } }, ZiplineTower: { ConnectionTargets: targets },
  } };
}

describe("zipline network", () => {
  it("draws reciprocal and duplicate links once, and keeps one-sided construction links", () => {
    const station = node("station", "ZiplineStation", ["pylon", "pylon"]);
    const pylon = node("pylon", "ZiplinePylon", ["station", "planned"]);
    pylon.Components.BlockObject.Coordinates.X = 30;
    const planned = node("planned", "ZiplineStation");
    planned.Components.BlockObject.Coordinates.Y = 40;
    planned.Components.BlockObjectState = { Finished: false };
    delete planned.Components.ZiplineTower;
    const nodes = [station, pylon, planned];
    const before = structuredClone(nodes);
    expect(getZiplineConnections(nodes).map(({ sourceId, targetId, underConstruction }) => ({ sourceId, targetId, underConstruction })))
      .toEqual([{ sourceId: "station", targetId: "pylon", underConstruction: false },
        { sourceId: "pylon", targetId: "planned", underConstruction: true }]);
    expect(nodes).toEqual(before);
    // Nearby buildings are never connected unless the save requests a link.
    expect(getZiplineConnections([node("a"), node("b", "ZiplineStation")])).toEqual([]);
  });

  it("ignores dangling links, self links, invalid targets and invalid positions", () => {
    const source = node("source", "ZiplinePylon", ["missing", "source", "invalid", "overlap", "ordinary", null, 7, {}]);
    const invalid = node("invalid"); invalid.Components.BlockObject.Coordinates.X = NaN;
    const ordinary = node("ordinary", "Lodge"); delete ordinary.Components.ZiplineTower;
    expect(getZiplineConnections([source, invalid, node("overlap"), ordinary])).toEqual([]);
    expect(getZiplineConnections([node("malformed", "ZiplineStation", "target")])).toEqual([]);
    expect(getZiplineConnections([])).toEqual([]);
  });

  it.each([
    ["Cw0", [10.5, 8.84, 21]], ["Cw90", [11, 8.84, 19.5]],
    ["Cw180", [9.5, 8.84, 19]], ["Cw270", [9, 8.84, 20.5]],
  ] as const)("attaches station cables to the rotated pulley for %s", (orientation, expected) => {
    const station = node("station", "ZiplineStation");
    station.Components.BlockObject.Orientation = orientation;
    for (const flipped of [false, true]) {
      station.Components.BlockObject.Flipped = flipped;
      expect(getZiplineAnchor(station)!.distanceTo(new Vector3(...expected))).toBeLessThan(0.00001);
    }
  });

  it.each([
    ["ZiplineStation", "ziplineStation", [2, 4, 3]],
    ["ZiplinePylon", "ziplinePylon", [1, 4, 1]],
    ["ZiplineBeam", "ziplineBeam", [1, 1, 3]],
  ] as const)("gives %s a model whose pulley meets the cable", (template, shape, size) => {
    const building = node("building", template);
    const visual = getBuildingVisual(building);
    expect(visual).toMatchObject({ shape, size, fallback: false });
    const geometry = createBuildingGeometry(visual).applyMatrix4(getBuildingMatrix(building, visual));
    const material = new MeshBasicMaterial();
    const anchor = getZiplineAnchor(building)!;
    const hits = new Raycaster(new Vector3(anchor.x, 20, anchor.z), new Vector3(0, -1, 0))
      .intersectObject(new Mesh(geometry, material));
    expect(hits[0].point.y).toBeCloseTo(5 + size[1]);
    expect(geometry.boundingBox!.containsPoint(anchor)).toBe(true);
    geometry.dispose(); material.dispose();
  });

  it("draws two parallel cables on the pulley rims across a sloping span", () => {
    const a = node("a", "ZiplineStation", ["b"]);
    const b = node("b"); b.Components.BlockObject.Coordinates = { X: 30, Y: 40, Z: 2 };
    const connection = getZiplineConnections([a, b])[0];
    const start = connection.start.clone(), end = connection.end.clone();
    const points = getZiplineCablePoints(connection);
    expect(points).toHaveLength(4);
    for (const offset of [0, 2]) {
      expect(points[offset].distanceTo(start)).toBeCloseTo(0.36);
      expect(points[offset + 1].distanceTo(end)).toBeCloseTo(0.36);
      expect(points[offset + 1].clone().sub(points[offset]).distanceTo(end.clone().sub(start))).toBeLessThan(0.00001);
    }
    expect(points[0].distanceTo(points[2])).toBeCloseTo(0.72);
    expect(connection.start).toEqual(start);
    expect(connection.end).toEqual(end);
  });
});
