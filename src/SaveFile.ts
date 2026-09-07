import JSZip from "jszip";
import type { DemoSave } from "./DemoSave";

export function parseSave(json: string, filename: string): DemoSave {
  const data = JSON.parse(json.replace(/^\uFEFF/, ""));
  if (!data || typeof data.GameVersion !== "string" || !data.Singletons ||
      !Array.isArray(data.Entities)) {
    throw new Error("This file is not a Timberborn world save (GameVersion, Singletons and Entities are required).");
  }
  const size = data.Singletons.MapSize?.Size;
  if (!size || !Number.isSafeInteger(size.X) || !Number.isSafeInteger(size.Y) || size.X <= 0 || size.Y <= 0) {
    throw new Error("The save has invalid map dimensions.");
  }
  if (data.Entities.some((entity: any) => !entity || typeof entity.Id !== "string" ||
      typeof entity.Template !== "string" || !entity.Components || typeof entity.Components !== "object")) {
    throw new Error("The save contains an invalid entity.");
  }
  delete data.__archive;
  return { ...data, __originalFilename: filename };
}

export async function loadSave(bytes: Uint8Array, filename: string): Promise<DemoSave> {
  if (/\.json$/i.test(filename)) return parseSave(new TextDecoder().decode(bytes), filename);
  if (!/\.timber$/i.test(filename)) throw new Error("Choose a .timber or .json save file.");
  const zip = await JSZip.loadAsync(bytes);
  const world = zip.file("world.json");
  if (!world) throw new Error("The archive does not contain world.json.");
  const save = parseSave(await world.async("string"), filename);
  save.__archive = bytes;
  return save;
}

export function serializeSave(save: DemoSave): string {
  const { __originalFilename, __archive, ...world } = save;
  return JSON.stringify(world, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("The save contains an invalid number. Check the edited fields before downloading.");
    }
    return value;
  });
}

export async function exportSave(save: DemoSave): Promise<Uint8Array> {
  const zip = save.__archive ? await JSZip.loadAsync(save.__archive) : new JSZip();
  zip.file("world.json", serializeSave(save));
  // Keep the save list in sync with edited cycle/day values; retain mods and all other metadata.
  const metadataFile = zip.file("save_metadata.json");
  if (metadataFile) {
    const metadata = JSON.parse(await metadataFile.async("string"));
    const cycle = save.Singletons.GameCycleService ?? save.Singletons.WeatherService ?? save.Singletons.CycleService;
    if (cycle && (metadata.Cycle !== cycle.Cycle || metadata.Day !== cycle.CycleDay)) {
      metadata.Cycle = cycle.Cycle;
      metadata.Day = cycle.CycleDay;
      zip.file("save_metadata.json", JSON.stringify(metadata));
    }
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
