import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { modernSave } from "../src/__tests__/fixtures";

export function generatedWorld() {
  // Generate the input independently of the app's serializer and any local save files.
  const { __originalFilename, __archive, ...original } = modernSave();
  original.UnknownRoot = { ModData: ["keep", { Enabled: true }] };
  for (const service of ["ScienceService", "DroughtWeather", "BadtideWeather"]) {
    original.Singletons[service].UnknownSetting = { Keep: [1, "two", null] };
  }
  // Interleave beavers and buildings, with peers that must remain untouched.
  const otherStockpile = structuredClone(original.Entities[0]);
  otherStockpile.Id = "other-storage";
  otherStockpile.Components.BlockObject.Coordinates.X = 2;
  const kit = structuredClone(original.Entities.find(entity => entity.Id === "beaver")!);
  kit.Id = "kit";
  kit.Template = "BeaverChild";
  kit.Components.NamedEntity.EntityName = "Original kit";
  kit.Components.Character.DayOfBirth = 330;
  kit.Components.Child = { GrowthProgress: 0.3 };
  original.Entities.unshift(kit);
  original.Entities.push(otherStockpile);
  return original;
}

export type World = ReturnType<typeof generatedWorld>;
export type SaveExtension = "json" | "timber";

export function createArchive(original: World) {
  const json = JSON.stringify(original);
  const archive = new JSZip()
    .file("world.json", json)
    .file("save_metadata.json", JSON.stringify({
      Cycle: original.Singletons.GameCycleService.Cycle,
      Day: original.Singletons.GameCycleService.CycleDay,
      Mods: [{ Name: "Example mod", Settings: { Enabled: true } }],
    }, null, 2))
    .file("save_thumbnail.jpg", new Uint8Array([255, 216, 255, 217]))
    .file("version.txt", `${original.GameVersion}\r\n`)
    .file("mods/unknown.bin", new Uint8Array([0, 1, 128, 255]));
  return archive;
}

export async function uploadWorld(page: Page, world: World, extension: SaveExtension) {
  const archive = createArchive(world);
  const buffer = extension === "json" ? Buffer.from(JSON.stringify(world))
    : await archive.generateAsync({ type: "nodebuffer" });
  await uploadBytes(page, buffer, extension);
  return archive;
}

export async function uploadBytes(page: Page, buffer: Buffer, extension: SaveExtension) {
  await page.goto("/");
  await page.getByLabel("Open a save file").setInputFiles({
    name: `generated.${extension}`,
    mimeType: extension === "json" ? "application/json" : "application/zip",
    buffer,
  });
}

export async function downloadArchive(page: Page) {
  await page.getByRole("button", { name: /^Download/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const bytes = readFileSync(path!);
  const archive = await JSZip.loadAsync(bytes);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  return { bytes, archive };
}

export async function expectExport(archive: JSZip, expected: World, original: JSZip, extension: SaveExtension,
  metadataPatch?: { Cycle?: number; Day?: number }) {
  // Compare the complete world, including array order and unknown fields.
  expect(JSON.parse(await archive.file("world.json")!.async("string"))).toEqual(expected);
  expect(Object.keys(archive.files).sort()).toEqual(
    extension === "timber" ? Object.keys(original.files).sort() : ["world.json"],
  );
  if (extension === "timber") {
    for (const [name, entry] of Object.entries(original.files)) {
      expect(archive.files[name].dir).toBe(entry.dir);
      if (name === "save_metadata.json" && metadataPatch) {
        expect(JSON.parse(await archive.file(name)!.async("string"))).toEqual({
          ...JSON.parse(await entry.async("string")), ...metadataPatch,
        });
      } else if (name !== "world.json" && !entry.dir) {
        expect(await archive.file(name)!.async("uint8array"), name)
          .toEqual(await entry.async("uint8array"));
      }
    }
  }
}
