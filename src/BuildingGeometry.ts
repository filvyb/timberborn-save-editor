import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Matrix4 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { UnknownEntity } from "./DemoSave";
import { getEntityRotationY, type BuildingVisual } from "./BuildingVisuals";

/** Local X/Z footprint starts at -0.5; placement rotates around the saved anchor cell. */
export function createBuildingGeometry({ shape, size: [w, h, d] }: BuildingVisual): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const box = (width: number, height: number, depth: number, x = w / 2, y = height / 2, z = d / 2) => {
    const part = new BoxGeometry(width, height, depth).translate(x, y, z);
    parts.push(part);
    return part;
  };
  const posts = (height: number) => {
    for (const x of [0.12, w - 0.12]) for (const z of [0.12, d - 0.12]) box(0.16, height, 0.16, x, height / 2, z);
  };
  const roof = (height: number, base: number) => parts.push(new ConeGeometry(1, height, 4)
    .rotateY(Math.PI / 4).scale(w / Math.SQRT2, 1, d / Math.SQRT2).translate(w / 2, base + height / 2, d / 2));
  switch (shape) {
    case "house":
      box(w, h * 0.75, d);
      roof(h * 0.25, h * 0.75);
      break;
    case "roof": roof(h, 0); break;
    case "factory":
      box(w, h * 0.7, d);
      box(w * 0.18, h, d * 0.18, w * 0.8, h / 2, d * 0.8);
      box(w * 0.4, h * 0.18, d * 0.5, w * 0.4, h * 0.79);
      break;
    case "tank":
      parts.push(new CylinderGeometry(Math.min(w, d) * 0.46, Math.min(w, d) * 0.46, h, 12)
        .translate(w / 2, h / 2, d / 2));
      break;
    case "pile":
      box(w, h * 0.25, d);
      box(w * 0.8, h * 0.6, d * 0.8, w / 2, h * 0.5);
      break;
    case "platform":
      posts(h - 0.12);
      box(w, 0.12, d, w / 2, h - 0.06);
      break;
    case "overhang":
      box(w, 0.15, d, w / 2, h - 0.075);
      box(0.2, h, d, 0.1, h / 2);
      break;
    case "bridge":
      box(w, 0.12, d, w / 2, 0.08);
      for (const z of [0.08, d - 0.08]) {
        box(w, 0.08, 0.08, w / 2, h * 0.65, z);
        for (let x = 0.12; x < w; x++) box(0.08, h * 0.65, 0.08, x, h * 0.325, z);
      }
      break;
    case "stairs":
      for (let i = 0; i < 5; i++) box(w, h * (i + 1) / 5, d / 5, w / 2, h * (i + 1) / 10, d * (i + 0.5) / 5);
      break;
    case "spiral":
      box(0.14, h, 0.14);
      for (let i = 0; i < 8; i++) parts.push(new BoxGeometry(w * 0.48, h / 8, d * 0.24)
        .translate(w * 0.23, h * (i + 0.5) / 8, 0).rotateY(i * Math.PI / 4).translate(w / 2, 0, d / 2));
      break;
    case "wheel":
      parts.push(new CylinderGeometry(h * 0.48, h * 0.48, w * 0.7, 12).rotateZ(Math.PI / 2).translate(w / 2, h / 2, d / 2));
      box(w, 0.16, 0.16, w / 2, h / 2);
      break;
    case "windmill":
      box(0.3, h * 0.8, 0.3);
      box(w, 0.14, 0.16, w / 2, h * 0.75, 0.05);
      box(0.14, h * 0.5, 0.16, w / 2, h * 0.75, 0.05);
      break;
    case "shaft":
      box(0.18, h, 0.18);
      box(w, 0.18, 0.18, w / 2, h * 0.8);
      break;
    case "flag":
      box(0.1, h, 0.1);
      box(w * 0.6, h * 0.3, 0.08, w * 0.7, h * 0.8);
      break;
    case "tower": posts(h); box(w, 0.12, d, w / 2, h - 0.06); break;
    case "gate":
      for (const x of [0.08, w - 0.08]) box(0.16, h, d * 0.7, x, h / 2);
      box(w, 0.12, d * 0.7, w / 2, h - 0.06);
      box(w * 0.7, h * 0.7, d * 0.3, w / 2, h * 0.35);
      break;
    case "crop":
      parts.push(new ConeGeometry(w / 2, h, 6).translate(w / 2, h / 2, d / 2));
      break;
    case "source":
      parts.push(new CylinderGeometry(w * 0.45, w * 0.45, h, 8).translate(w / 2, h / 2, d / 2));
      break;
    default: box(w, h, d);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.translate(-0.5, 0, -0.5);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getBuildingMatrix(entity: UnknownEntity, visual: BuildingVisual): Matrix4 {
  const { X, Y, Z } = entity.Components.BlockObject.Coordinates;
  const transform = new Matrix4().makeTranslation(X, Z, Y)
    .multiply(new Matrix4().makeRotationY(getEntityRotationY(entity)));
  if (entity.Components.BlockObject.Flipped) {
    // Mirror inside the footprint so flipping doesn't move the anchor to the adjacent cell.
    transform.multiply(new Matrix4().makeTranslation(visual.size[0] - 1, 0, 0))
      .multiply(new Matrix4().makeScale(-1, 1, 1));
  }
  return transform;
}
