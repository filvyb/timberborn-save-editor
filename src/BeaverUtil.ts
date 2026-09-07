import { sample } from "lodash";
import type { DemoSave, UnknownEntity } from "./DemoSave";
import { UUID } from "./util/UUID";

export const BeaverUtil = {
  character: (beaver: UnknownEntity) => beaver.Components.Character ?? beaver.Components.Beaver,
  getName: (beaver: UnknownEntity): string => beaver.Components.NamedEntity?.EntityName ?? BeaverUtil.character(beaver)?.Name ?? "Unnamed beaver",
  setName(beaver: UnknownEntity, name: string): void {
    if (beaver.Components.NamedEntity) beaver.Components.NamedEntity.EntityName = name;
    else BeaverUtil.character(beaver).Name = name;
  },
  setAge(save: DemoSave, beaver: UnknownEntity, age: number) {
    BeaverUtil.character(beaver).DayOfBirth = Math.floor(save.Singletons.DayNightCycle.DayNumber - age);
  },
  setDefaultNeeds(beaver: UnknownEntity): void {
    if (beaver.Components.MortalNeeder) beaver.Components.MortalNeeder.DeathDays = [];
    for (const need of beaver.Components.NeedManager?.Needs ?? []) {
      if (["Hunger", "Thirst", "Sleep"].includes(need.Name)) need.Points = 1;
    }
  },
  setDefaultName(save: DemoSave, beaver: UnknownEntity): void {
    BeaverUtil.setName(beaver, sample(save.Singletons.BeaverNameService?.Names ?? []) ?? "New beaver");
  },
  reset(beaver: UnknownEntity): void {
    beaver.Id = UUID();
    BeaverUtil.setDefaultNeeds(beaver);
    // A clone must not inherit another beaver's workplace, home, goods reservations or active task.
    for (const key of Object.keys(beaver.Components)) {
      if (/Executor$|Behavior$/.test(key) || ["Worker", "Dweller", "GoodCarrier", "GoodReserver", "Enterer", "Walker", "MovementAnimator"].includes(key)) {
        delete beaver.Components[key];
      }
    }
    const modern = !!beaver.Components.NamedEntity;
    beaver.Components.BehaviorManager = modern ? {
      RunningBehavior: `${beaver.Id}:WanderRootBehavior`, ReturnToBehavior: false,
    } : {
      RunningBehaviorId: "WanderRootBehavior", RunningBehaviorOwner: beaver.Id, ReturnToBehavior: false,
    };
    if (beaver.Components.LifeProgressor) beaver.Components.LifeProgressor.LifeProgress = 0;
    if (beaver.Components.Child) beaver.Components.Child.GrowthProgress = 0;
  },
  copy(save: DemoSave, source: UnknownEntity): UnknownEntity {
    const beaver = structuredClone(source);
    BeaverUtil.reset(beaver);
    BeaverUtil.setDefaultName(save, beaver);
    BeaverUtil.setAge(save, beaver, beaver.Template === "BeaverAdult" ? 5 : 0);
    return beaver;
  },
};
