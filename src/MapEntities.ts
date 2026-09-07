import type { DemoSave, UnknownEntity } from "./DemoSave";
import { BeaverUtil } from "./BeaverUtil";

export type MapEntityKind = "tree" | "character" | "object";
export interface EntityData {
  deleteIds: string[];
  updateIds: string[];
  entitiesByIds: Record<string, UnknownEntity>;
  entitiesIdsByTemplate: Record<string, string[]>;
}

const hasPosition = (value: any): boolean => value && [value.X, value.Y, value.Z].every(Number.isFinite);

export function getMapEntityKind(entity: UnknownEntity): MapEntityKind | null {
  if (hasPosition(BeaverUtil.character(entity)?.Position)) return "character";
  if (!hasPosition(entity.Components.BlockObject?.Coordinates)) return null;
  const name = entity.Template.split(".")[0];
  if (["Maple", "Pine", "Birch", "Oak", "ChestnutTree", "Mangrove"].includes(name)) return "tree";
  return "object";
}

/** Include every positioned entity; unknown templates must never disappear from the map. */
export function readEntityData(save: DemoSave): EntityData {
  const data: EntityData = { deleteIds: [], updateIds: [], entitiesByIds: {}, entitiesIdsByTemplate: {} };
  for (const entity of save.Entities) {
    if (!getMapEntityKind(entity)) continue;
    data.entitiesByIds[entity.Id] = entity;
    (data.entitiesIdsByTemplate[entity.Template] ??= []).push(entity.Id);
  }
  return data;
}

export function writeEntityData(save: DemoSave, data: EntityData): DemoSave {
  const deleted = new Set(data.deleteIds);
  const updated = new Set(data.updateIds);
  return { ...save, Entities: save.Entities.filter(entity => !deleted.has(entity.Id))
    .map(entity => updated.has(entity.Id) ? data.entitiesByIds[entity.Id] : entity) };
}
