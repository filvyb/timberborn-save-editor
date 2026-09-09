import type { UnknownEntity } from "./DemoSave";
import { StockpileUtil } from "./StockpileUtil";

export type BuildingShape = "box" | "house" | "factory" | "tank" | "pile" | "platform" | "bridge" |
  "overhang" | "stairs" | "spiral" | "wheel" | "windmill" | "shaft" | "flag" | "tower" | "observatory" | "roof" | "crop" | "source" | "gate" | "floodgate" |
  "ziplineStation" | "ziplinePylon" | "ziplineBeam" | "dome" | "brazier" | "fountain" |
  "hall" | "mudPit" | "contemplation" | "detailer" | "discharge" | "depthSensor" | "counter" | "gristmill" |
  "powerWheel" | "excavator";
export type BuildingCategory = "Housing" | "Industry" | "Storage" | "Water" | "Power" | "Paths and structures" |
  "Services" | "Leisure" | "Plants" | "Natural resources" | "Other";
export const buildingColors: Record<BuildingCategory, string> = {
  Housing: "#c99562", Industry: "#c5ad84", Storage: "#e66e3e", Water: "#4d94aa", Power: "#e0b744",
  "Paths and structures": "#a89075", Services: "#7796c6", Leisure: "#b383b0", Plants: "#72a845",
  "Natural resources": "#8c8780", Other: "#c878b7",
};
export interface BuildingVisual {
  shape: BuildingShape;
  /** Schematic footprint and height, not game collision bounds. */
  size: [number, number, number]; // width, height, depth in Three.js coordinates
  category: BuildingCategory;
  fallback: boolean;
}

const visual = (shape: BuildingShape, size: BuildingVisual["size"], category: BuildingCategory, fallback = false): BuildingVisual =>
  ({ shape, size, category, fallback });

const industrySizes: Record<string, BuildingVisual["size"]> = {
  LumberMill: [2, 3, 3], IndustrialLumberMill: [2, 3, 3], GearWorkshop: [2, 3, 3],
  PaperMill: [2, 2, 3], WoodWorkshop: [2, 3, 4], ExplosivesFactory: [2, 2, 4],
  Smelter: [2, 3, 4], BotPartFactory: [3, 2, 3], BotAssembler: [3, 1, 3],
  Grill: [2, 3, 2], Bakery: [2, 4, 3], Refinery: [2, 4, 3],
};

const additionalVisuals: Record<string, BuildingVisual> = {
  PowerWheel: visual("powerWheel", [3, 2, 1], "Power"),
  DirtExcavator: visual("excavator", [5, 3, 6], "Industry"),
  Gristmill: visual("gristmill", [3, 3, 2], "Industry"),
  BadwaterDome: visual("dome", [3, 2, 3], "Water"),
  BrazierOfBonding: visual("brazier", [2, 3, 2], "Leisure"),
  FountainOfJoy: visual("fountain", [5, 3, 5], "Leisure"),
  HallOfAbundance: visual("hall", [5, 5, 5], "Leisure"),
  MudPit: visual("mudPit", [3, 1, 3], "Leisure"),
  ContemplationSpot: visual("contemplation", [1, 1, 1], "Leisure"),
  Detailer: visual("detailer", [1, 1, 2], "Leisure"),
  Discharge: visual("discharge", [1, 2, 2], "Water"),
  DepthSensor: visual("depthSensor", [1, 2, 2], "Services"),
  PopulationCounter: visual("counter", [1, 2, 1], "Services"),
  TerrainBlock: visual("box", [1, 1, 1], "Paths and structures"),
  RecoveredGoodStack: visual("pile", [0.8, 0.5, 0.8], "Storage"),
};

export function getBuildingVisual(entity: UnknownEntity): BuildingVisual {
  const name = entity.Template.split(".")[0];
  if (additionalVisuals[name]) return additionalVisuals[name];
  const height = /Triple/.test(name) ? 3 : /Double/.test(name) ? 2 : 1;
  const span = name.match(/(\d+)x(\d+)/);
  const width = span ? Math.min(Number(span[1]), 64) : 1;
  const depth = span ? Math.min(Number(span[2]), 64) : 1;

  if (/^Path$|^DistrictGate$/.test(name)) return visual("box", [1, name === "Path" ? 0.08 : 0.8, 1], "Paths and structures");
  if (/SpiralStairs/.test(name)) return visual("spiral", [1, 1, 1], "Paths and structures");
  if (/Stairs|Slope/.test(name)) return visual("stairs", [1, 1, 1], "Paths and structures");
  if (/SuspensionBridge/.test(name)) return visual("bridge", [depth, 1, width + 1], "Paths and structures");
  if (/Bridge/.test(name)) return visual("bridge", [depth, 1, width], "Paths and structures");
  if (/Overhang/.test(name)) return visual("overhang", [depth, 1, width], "Paths and structures");
  if (/Platform/.test(name)) return visual("platform", [/LargeMetal/.test(name) ? 5 : /Metal/.test(name) ? 3 : width, height, /LargeMetal/.test(name) ? 5 : /Metal/.test(name) ? 3 : depth], "Paths and structures");
  if (/Roof/.test(name)) return visual("roof", [width, 0.6, depth], "Leisure");
  if (/Levee|Dam$|ImpermeableFloor/.test(name)) return visual("box", [1, /Floor/.test(name) ? 0.1 : /Dam/.test(name) ? 0.65 : 1, 1], "Water");
  if (/Floodgate/.test(name)) return visual("floodgate", [1, height, 1], "Water");
  if (/Sluice/.test(name)) return visual("gate", [1, height, 1], "Water");
  if (/Tank/.test(name)) return visual("tank", /Large/.test(name) ? [3, 3, 2] : /Medium/.test(name) ? [2, 2, 2] : [1, 1, 1], "Storage");
  if (/Warehouse/.test(name)) return visual("box", /Underground/.test(name) ? [3, 1, 3] : /Large/.test(name) ? [3, 2, 3] : StockpileUtil.getCapacity(entity) === 30 ? [1, 1, 1] : [3, 1, 2], "Storage");
  if (/Pile/.test(name)) return visual("pile", /Small/.test(name) ? [1, 0.6, 1] : [3, 0.8, 3], "Storage");
  if (/Lodge|Barrack|Rowhouse/.test(name)) return visual("house", /Mini/.test(name) ? [1, 1, 1] : /Large/.test(name) ? [4, 3, 3] : [3, /Double|Triple/.test(name) ? height : 2, 2], "Housing");
  if (/Windmill|WindTurbine/.test(name)) return visual("windmill", /Large/.test(name) ? [3, 5, 3] : [2, 3, 2], "Power");
  if (/WaterWheel|PowerWheel/.test(name)) return visual("wheel", /Large/.test(name) ? [3, 3, 4] : [2, 2, 2], "Power");
  if (/PowerShaft/.test(name)) return visual("shaft", [1, /Vertical|High/.test(name) ? 2 : 0.5, 1], "Power");
  if (/GravityBattery/.test(name)) return visual("tower", [2, 3, 1], "Power");
  if (/Engine|Generator/.test(name)) return visual("factory", [3, 2, 3], "Power");
  if (/Flag$/.test(name)) return visual("flag", [1, 1.4, 1], "Services");
  if (/ZiplinePylon/.test(name)) return visual("ziplinePylon", [1, 4, 1], "Paths and structures");
  if (/ZiplineStation/.test(name)) return visual("ziplineStation", [2, 4, 3], "Paths and structures");
  if (/ZiplineBeam/.test(name)) return visual("ziplineBeam", [1, 1, 3], "Paths and structures");
  if (/WaterSource|WaterSeep/i.test(name)) return visual("source", [1, 0.4, 1], "Water");
  if (/Pump|WaterDump|BadwaterRig|Irrigation|StreamGauge/.test(name)) return visual("factory", [2, 2, 2], "Water");
  if (/Observatory/.test(name)) return visual("observatory", [3, 4, 3], "Services");
  if (/DistrictCenter|DistrictCrossing|Distribution|BuildersHut|HaulingPost|Inventor|Forester/.test(name)) return visual("house", [3, 2, 2], "Services");
  if (/Farmhouse|FarmHouse|Workshop|Mill|Factory|Smelter|Mine|Refinery|Assembler|Centrifuge|Excavator|Bakery|Grill|Herbalist|TappersShack|Fermenter|Hydroponic|Industrial|PrintingPress|FoodFactory|Woodwork/.test(name)) return visual("factory", industrySizes[name] ?? [2, 2, 3], "Industry");
  if (/Dynamite/.test(name)) return visual("box", [0.6, 0.5, 0.6], "Industry");
  if (/RuinColumnH(\d+)/.test(name)) return visual("box", [1, Number(name.match(/H(\d+)/)![1]), 1], "Natural resources");
  if (/Ruin|Blockage|Rock/.test(name)) return visual("pile", [2, 1, 2], "Natural resources");
  if (/Bush|Carrot|Potato|Wheat|Cattail|Spadderdock|Dandelion|Sunflower|Succulent|Kohlrabi|Cassava|Soybean|Eggplant|Corn|Canola|Mangrove/.test(name) || entity.Components.Growable || entity.Components.LivingNaturalResource) {
    return visual("crop", [0.6, /Bush/.test(name) ? 0.6 : 0.25, 0.6], "Plants");
  }
  if (/Campfire|Bench|Shrub|Scarecrow|MedicalBed|Shower|Grindstone|Lido|Bath|Terrace|Shrine|Temple|Carousel|Monument|Statue|Tribute|FlameOfProgress|Bell|Fence|Agora|DanceHall|Exercise|Gustbuster|Hammock|Tea/.test(name)) return visual("house", [2, /Temple|Monument|Tribute/.test(name) ? 3 : 0.8, 2], "Leisure");
  if (entity.Components["Inventory:Stockpile"] || entity.Components.SingleGoodAllower) return visual("box", [1, 1, 1], "Storage", true);
  return visual("box", [1, 1, 1], "Other", true);
}

export function getEntityRotationY(entity: UnknownEntity): number {
  const orientation = entity.Components.BlockObject?.Orientation;
  const name = typeof orientation === "string" ? orientation : orientation?.Value;
  const match = name?.match(/^Cw(\d+)$/);
  return match ? Number(match[1]) * Math.PI / 180 : 0;
}

export function getZiplineLocalAnchor(visual: BuildingVisual): [number, number, number] {
  const [w, h, d] = visual.size;
  return [w / 2 - 0.5, h - 0.16, visual.shape === "ziplineBeam" ? d - 1 : d / 2 - 0.5];
}

export function isStockpile(entity: UnknownEntity): boolean {
  return !!entity.Components["Inventory:Stockpile"] || !!entity.Components.SingleGoodAllower || StockpileUtil.stockpileIds.includes(entity.Template);
}
