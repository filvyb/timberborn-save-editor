import { describe, expect, it } from "vitest";
import { readMapData } from "../MapData";
import { modernSave } from "./fixtures";

describe("layered save map data", () => {
  it.each([[1, 3], [3, 1], [3, 2], [2, 3]])("decodes caves and stacked water on a %sx%s map without transposing axes", (width, depth) => {
    const save = modernSave();
    const area = width * depth;
    save.Singletons.MapSize.Size = { X: width, Y: depth };
    const voxels = Array(area * 3).fill(0);
    // The first column has a cave; the opposite corner is two solid cubes high.
    voxels[0] = voxels[area * 2] = 1;
    voxels[area - 1] = voxels[area * 2 - 1] = 1;
    save.Singletons.TerrainMap.Voxels.Array = `\n${voxels.join("\t ")}\n`;
    const columns = Array(area * 2).fill("0");
    columns[0] = "0.5:0.25:0:1:0.4";
    columns[area - 1] = "0.75:1:0:2:0.5";
    columns[area] = "0.25:0:0:3:0.2";
    save.Singletons.WaterMapNew = { Levels: 2, WaterColumns: { Array: columns.join(" ") } };
    const moisture = Array(area * 2).fill(0);
    moisture[0] = 0.25;
    moisture[area] = 0.75;
    moisture[area - 1] = 0.5;
    moisture[area * 2 - 1] = 0.25;
    save.Singletons.SoilMoistureSimulator.MoistureLevels.Array = moisture.join(" ");
    const before = structuredClone(save);
    const map = readMapData(save);
    const heights = Array(area).fill(0);
    heights[0] = 3;
    heights[area - 1] = 2;
    expect([...map.heightMap]).toEqual(heights);
    expect([...map.voxels!]).toEqual(voxels); // The cave must remain empty beneath the height map.
    expect(map.voxelLevels).toBe(3);
    expect(map.waterSurfaces).toEqual([
      { x: 0, y: 0, height: 1.5, contamination: 0.25 },
      { x: width - 1, y: depth - 1, height: 2.75, contamination: 1 },
      { x: 0, y: 0, height: 3.25, contamination: 0 },
    ]);
    const expectedMoisture = Array(area).fill(0);
    expectedMoisture[0] = 0.75;
    expectedMoisture[area - 1] = 0.5;
    expect([...map.moistureMap]).toEqual(expectedMoisture);
    expect(map.i2xy(area - 1)).toEqual([width - 1, depth - 1]);
    expect(map.i2xyz(area - 1, 7)).toEqual([width - 1, 7, depth - 1]);
    expect(save).toEqual(before);
  });

  it.each(["", "1 0", "1 0 0 0 0 2", "1 0 0 0 0 NaN"])("rejects malformed voxel data %j", data => {
    const save = modernSave();
    save.Singletons.TerrainMap.Voxels.Array = data;
    expect(() => readMapData(save)).toThrow("voxel data");
  });

  it.each(["0.5:0:0:1", "0.5:0:0:1:0:9", "NaN:0:0:1:0", "0.5:0:0:Infinity:0"])("rejects malformed water columns %j", data => {
    const save = modernSave();
    save.Singletons.WaterMapNew.WaterColumns.Array = `0 0 ${data} 0 0 0`;
    expect(() => readMapData(save)).toThrow("water column data");
  });
});
