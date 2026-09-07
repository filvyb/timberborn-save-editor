import { BufferGeometry, Float32BufferAttribute } from "three";
import type { MapData } from "./MapData";

/** Only exposed voxel faces are drawn, including overhangs and caves. */
export function createTerrainGeometry(map: MapData): BufferGeometry {
  const { mapSizeX: width, mapSizeY: depth, voxels, voxelLevels, heightMap, moistureMap } = map;
  const positions: number[] = [];
  const colors: number[] = [];
  const faces = [
    { normal: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { normal: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
    { normal: [0, 1, 0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    { normal: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { normal: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
    { normal: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
  ];
  const occupied = (x: number, y: number, z: number) => {
    if (x < 0 || z < 0 || y < 0 || x >= width || z >= depth) return false;
    return voxels ? y < voxelLevels && !!voxels[y * width * depth + z * width + x] : y < heightMap[z * width + x];
  };
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const index = z * width + x;
    for (let y = 0; y < heightMap[index]; y++) {
      if (!occupied(x, y, z)) continue;
      for (const { normal, corners } of faces) {
        if (occupied(x + normal[0], y + normal[1], z + normal[2])) continue;
        const color = normal[1] === 1 && moistureMap[index] > 0 ? [0.26, 0.52, 0.08] : [0.23, 0.12, 0.075];
        for (const vertex of [0, 1, 2, 0, 2, 3]) {
          const corner = corners[vertex];
          positions.push(x + corner[0] - 0.5, y + corner[1], z + corner[2] - 0.5);
          colors.push(...color);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
