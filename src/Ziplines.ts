import { Vector3 } from "three";
import type { UnknownEntity } from "./DemoSave";
import { getBuildingVisual, getZiplineLocalAnchor } from "./BuildingVisuals";
import { getBuildingMatrix } from "./BuildingGeometry";
import { ConstructionUtil } from "./ConstructionUtil";

export interface ZiplineConnection {
  sourceId: string;
  targetId: string;
  start: Vector3;
  end: Vector3;
  underConstruction: boolean;
}

export function getZiplineAnchor(entity: UnknownEntity): Vector3 | null {
  const coordinates = entity.Components.BlockObject?.Coordinates;
  if (!coordinates || ![coordinates.X, coordinates.Y, coordinates.Z].every(Number.isFinite)) return null;
  const visual = getBuildingVisual(entity);
  return new Vector3(...getZiplineLocalAnchor(visual)).applyMatrix4(getBuildingMatrix(entity, visual));
}

/** Saved links can be reciprocal or one-sided (including links to construction sites). */
export function getZiplineConnections(entities: UnknownEntity[]): ZiplineConnection[] {
  const nodes = new Map(entities.filter(entity => entity.Components.ZiplineTower || /^Zipline(Station|Pylon|Beam)(\.|$)/.test(entity.Template))
    .map(entity => [entity.Id, { entity, anchor: getZiplineAnchor(entity) }]));
  const seen = new Set<string>();
  const connections: ZiplineConnection[] = [];
  for (const [sourceId, source] of nodes) {
    const targets: unknown = source.entity.Components.ZiplineTower?.ConnectionTargets;
    if (!source.anchor || !Array.isArray(targets)) continue;
    for (const targetId of targets) {
      if (typeof targetId !== "string" || targetId === sourceId) continue;
      const target = nodes.get(targetId);
      if (!target?.anchor || source.anchor.distanceToSquared(target.anchor) < 0.000001) continue;
      const key = JSON.stringify([sourceId, targetId].sort());
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({ sourceId, targetId, start: source.anchor, end: target.anchor,
        underConstruction: !ConstructionUtil.isFinished(source.entity) || !ConstructionUtil.isFinished(target.entity) });
    }
  }
  return connections;
}

/** Two parallel cable strands meet the pulley rim at either end of each span. */
export function getZiplineCablePoints({ start, end }: ZiplineConnection): Vector3[] {
  const side = new Vector3(end.z - start.z, 0, start.x - end.x);
  if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
  side.normalize().multiplyScalar(0.36);
  return [start.clone().add(side), end.clone().add(side), start.clone().sub(side), end.clone().sub(side)];
}
