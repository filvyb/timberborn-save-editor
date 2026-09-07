import { DemoSave, UnknownEntity } from "./DemoSave";
import { buildingCategories } from "./allEntities";

const buildingTypes = new Map<string, string>(
  Object.entries(buildingCategories)
    .map(([type, buildings]) => buildings.map((building) => [building, type]))
    .flat() as [string, string][]
);

export const ConstructionUtil = {
  isFinished: (entity: UnknownEntity): boolean =>
    (entity.Components.BlockObjectState ?? entity.Components.Constructible)?.Finished !== false,
  entityFilter: (entity: UnknownEntity) => !ConstructionUtil.isFinished(entity),
  reverseEntityFilter: (entity: UnknownEntity) => ConstructionUtil.isFinished(entity),
  getConstructionSites: (saveData: DemoSave) => saveData.Entities.filter(ConstructionUtil.entityFilter),
  getBuildingType: (constructionSite: UnknownEntity | string) => {
    const template =
      typeof constructionSite === "string"
        ? constructionSite
        : constructionSite.Template;
    return buildingTypes.get(template) || "Other";
  },
  finishConstruction: (constructionSite: UnknownEntity): void => {
    const state = constructionSite.Components.BlockObjectState ?? constructionSite.Components.Constructible;
    if (!state || state.Finished !== false) return;
    state.Finished = true;
    // Finished v1.1 buildings omit ConstructionSite. Keep delivered materials and all other components.
    if (constructionSite.Components.BlockObjectState) {
      delete constructionSite.Components.ConstructionSite;
    } else if (constructionSite.Components.ConstructionSite) {
      constructionSite.Components.ConstructionSite.BuildTimeProgressInHoursKey = 1;
    }
  },
  finishAllConstruction: (saveData: DemoSave): void => {
    ConstructionUtil.getConstructionSites(saveData).forEach(ConstructionUtil.finishConstruction);
  },
};
