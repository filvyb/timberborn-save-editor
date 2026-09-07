import type { DemoSave, UnknownEntity } from "../DemoSave";

export function storage(good: string | { Id: string } = "Log", template = "SmallPile.Folktails"): UnknownEntity {
  return {
    Id: "storage", Template: template, Components: {
      BlockObject: { Coordinates: { X: 0, Y: 0, Z: 1 } },
      SingleGoodAllower: { AllowedGood: good },
      "Inventory:Stockpile": { UnknownInventoryField: true, Storage: { UnknownStorageField: 12, Goods: [{ Good: good, Amount: 3, Extra: "retain" }] } },
      UnknownComponent: { Keep: [1, 2, 3] },
    },
  };
}

export function modernSave(): DemoSave {
  return {
    __originalFilename: "example.timber", GameVersion: "1.1.2.4-52e959e-sw", Timestamp: "2026-09-07 15:45:29",
    Singletons: {
      MapSize: { Size: { X: 3, Y: 2 } }, DayNightCycle: { DayNumber: 332, DayProgress: 0.25 },
      GameCycleService: { Cycle: 17, CycleDay: 14 }, ScienceService: { SciencePoints: 4170 },
      DroughtWeather: { MinDroughtDuration: 2, MaxDroughtDuration: 4, HandicapMultiplier: 0.25, HandicapCycles: 8 },
      BadtideWeather: { MinBadtideWeatherDuration: 1, MaxBadtideWeatherDuration: 3, ChanceBadtideWeather: 0.4 },
      TemperateWeatherDurationService: { MinTemperateWeatherDuration: 16, MaxTemperateWeatherDuration: 19, TemperateWeatherDuration: 18 },
      HazardousWeatherService: { HazardousWeatherDuration: 3, IsDrought: true },
      BeaverNameService: { Names: ["New name"] },
      TerrainMap: { Voxels: { Array: "1 1 0 1 1 1 0 1 0 1 0 0" } },
      WaterMapNew: { Levels: 1, WaterColumns: { Array: "0 0 0.5:0.8:0:0:0.4 0 0 0" } },
      SoilMoistureSimulator: { MoistureLevels: { Array: "0 1 0 0 1 0" } },
      UnknownService: { Value: ["preserve", 7] },
    },
    Entities: [storage(), {
      Id: "site", Template: "Platform.Folktails", Components: {
        BlockObject: { Coordinates: { X: 1, Y: 0, Z: 2 } }, BlockObjectState: { Finished: false, Unknown: true },
        ConstructionSite: { BuildTimeProgressInHours: 0 }, "Inventory:ConstructionSite": { Storage: { Goods: [{ Good: "Log", Amount: 2 }] } },
      },
    }, {
      Id: "beaver", Template: "BeaverAdult", Components: {
        Character: { Position: { X: 0.5, Y: 1, Z: 0.5 }, Alive: true, DayOfBirth: 268 },
        NamedEntity: { EntityName: "Original", Extra: true }, LifeProgressor: { LifeProgress: 1.07 },
        NeedManager: { Needs: [{ Name: "Hunger", Points: 0.2 }, { Name: "Thirst", Points: 0.4 }] },
        BehaviorManager: { RunningBehavior: "beaver:CarryRootBehavior" }, WalkToAccessibleExecutor: { Accessible: "work:Building" },
        Worker: { Workplace: "work" }, Dweller: { Home: "home" }, Citizen: { AssignedDistrict: "district" },
        GoodCarrier: { CarriedGood: { Good: "Log", Amount: 3 } }, GoodReserver: { CapacityReservation: {} },
        Walker: { CurrentDestination: {} }, UnknownComponent: { Extra: true },
      },
    }],
  };
}
