import JSZip from "jszip";
import { expect } from "vitest";
import type { DemoSave } from "../DemoSave";

// Keep the expected world independent of the application's serializer.
export function worldData(save: DemoSave) {
  const { __archive, __originalFilename, ...world } = structuredClone(save);
  return world;
}

export async function expectSaveArchive(bytes: Uint8Array, expected: ReturnType<typeof worldData>,
  original?: JSZip, metadataPatch?: { Cycle: number; Day: number }) {
  const archive = await JSZip.loadAsync(bytes);
  expect(JSON.parse(await archive.file("world.json")!.async("string"))).toEqual(expected);
  expect(Object.keys(archive.files).sort()).toEqual(original ? Object.keys(original.files).sort() : ["world.json"]);
  if (original) {
    for (const [name, entry] of Object.entries(original.files)) {
      expect(archive.files[name].dir, name).toBe(entry.dir);
      if (entry.dir || name === "world.json") continue;
      if (name === "save_metadata.json" && metadataPatch) {
        expect(JSON.parse(await archive.file(name)!.async("string"))).toEqual({
          ...JSON.parse(await entry.async("string")), ...metadataPatch,
        });
      } else {
        expect(await archive.file(name)!.async("uint8array"), name).toEqual(await entry.async("uint8array"));
      }
    }
  }
  return archive;
}
