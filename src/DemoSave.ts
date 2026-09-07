/** Known editor fields, with unknown game/mod data retained verbatim. */
export interface DemoSave {
  __originalFilename: string;
  /** Original archive stays in memory and is never serialized into world.json. */
  __archive?: Uint8Array;
  GameVersion: string;
  Timestamp: string;
  Singletons: {
    MapSize: { Size: { X: number; Y: number } };
    DayNightCycle: { DayNumber: number; DayProgress: number };
    [key: string]: any;
  };
  Entities: UnknownEntity[];
  [key: string]: unknown;
}

export interface UnknownEntity {
  Id: string;
  Template: string;
  Components: Record<string, any>;
  [key: string]: unknown;
}

export type DemoSaveEntity = UnknownEntity;
export type BeaverAdultEntity = UnknownEntity;
