import type { DemoSave } from "./DemoSave";

export interface MapData {
  i2x: (i: number) => number;
  i2y: (i: number) => number;
  i2xy: (i: number) => [number, number];
  i2xyz: (i: number, y: number) => [number, number, number];
  heightMap: Uint16Array;
  moistureMap: Float32Array;
  waterSurfaces: { x: number; y: number; height: number; contamination: number }[];
  voxels?: Uint8Array;
  voxelLevels: number;
  mapSizeX: number;
  mapSizeY: number;
}

export function readMapData(save: DemoSave): MapData {
  const singletons = save.Singletons;
  const { X: mapSizeX, Y: mapSizeY } = singletons.MapSize.Size;
  const area = mapSizeX * mapSizeY;
  const terrain = singletons.TerrainMap;
  const tokens = (value?: string): string[] => value?.trim() ? value.trim().split(/\s+/) : [];
  let voxels: Uint8Array | undefined;
  let voxelLevels = 0;
  let heightMap = new Uint16Array(area);
  if (terrain?.Voxels?.Array !== undefined) {
    const raw = tokens(terrain.Voxels.Array);
    if (raw.length % area !== 0 || !raw.length || raw.some(value => value !== "0" && value !== "1")) {
      throw new Error("Unsupported terrain voxel data.");
    }
    voxels = Uint8Array.from(raw, Number);
    voxelLevels = voxels.length / area;
    // v1.1 stores X first, then Y, then vertical Z layers.
    for (let i = 0; i < voxels.length; i++) if (voxels[i]) heightMap[i % area] = Math.floor(i / area) + 1;
  } else {
    const raw = tokens(terrain?.Heights?.Array).map(Number);
    if (raw.length !== area || raw.some(value => !Number.isInteger(value) || value < 0 || value > 65535)) {
      throw new Error("Unsupported terrain height data.");
    }
    heightMap = Uint16Array.from(raw);
  }
  const moistureMap = new Float32Array(area);
  const moisture = tokens(singletons.SoilMoistureSimulator?.MoistureLevels?.Array);
  moisture.forEach((value, i) => { moistureMap[i % area] = Math.max(moistureMap[i % area], Number(value) || 0); });
  const waterSurfaces: MapData["waterSurfaces"] = [];
  if (singletons.WaterMapNew) {
    tokens(singletons.WaterMapNew.WaterColumns?.Array).forEach((column, i) => {
      if (column === "0") return;
      // depth : contamination : ... : floor : previous depth
      const values = column.split(":").map(Number);
      if (values.length !== 5 || values.some(value => !Number.isFinite(value))) throw new Error("Unsupported water column data.");
      const [depth, contamination, , floor] = values;
      if (depth > 0) waterSurfaces.push({ x: i % mapSizeX, y: Math.floor((i % area) / mapSizeX), height: floor + depth, contamination });
    });
  } else {
    tokens(singletons.WaterMap?.WaterDepths?.Array).forEach((value, i) => {
      const depth = Number(value);
      if (depth > 0) waterSurfaces.push({ x: i % mapSizeX, y: Math.floor(i / mapSizeX), height: heightMap[i] + depth, contamination: 0 });
    });
  }
  return {
    i2x: i => i % mapSizeX, i2y: i => Math.floor(i / mapSizeX),
    i2xy: i => [i % mapSizeX, Math.floor(i / mapSizeX)],
    i2xyz: (i, y) => [i % mapSizeX, y, Math.floor(i / mapSizeX)],
    mapSizeX, mapSizeY, heightMap, moistureMap, waterSurfaces, voxels, voxelLevels,
  };
}
