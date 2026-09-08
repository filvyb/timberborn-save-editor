import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { modernSave } from "../src/__tests__/fixtures";

const changes = [
  { label: "Science", service: "ScienceService", key: "SciencePoints", value: 9000 },
  { label: "Max drought duration", service: "DroughtWeather", key: "MaxDroughtDuration", value: 9 },
  { label: "Badtide chance", service: "BadtideWeather", key: "ChanceBadtideWeather", value: 0.65 },
];

for (const extension of ["json", "timber"]) {
  for (const { label, service, key, value } of changes) {
    test(`changing only ${label} preserves all other data from a .${extension} save`, async ({ page }) => {
      // Generate the input independently of the app's serializer and any local save files.
      const { __originalFilename, __archive, ...original } = modernSave();
      original.UnknownRoot = { ModData: ["keep", { Enabled: true }] };
      original.Singletons[service].UnknownSetting = { Keep: [1, "two", null] };
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
      const buffer = extension === "json"
        ? Buffer.from(json)
        : await archive.generateAsync({ type: "nodebuffer" });
      const expected = structuredClone(original);
      expect(expected.Singletons[service][key]).not.toBe(value);
      expected.Singletons[service][key] = value;

      await page.goto("/");
      await page.getByLabel("Open a save file").setInputFiles({
        name: `generated.${extension}`,
        mimeType: extension === "json" ? "application/json" : "application/zip",
        buffer,
      });
      await page.getByRole("button", { name: /^Properties/ }).click();
      await page.getByLabel(label, { exact: true }).fill(String(value));
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await page.getByRole("button", { name: /^Download/ }).click();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download", exact: true }).click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path).not.toBeNull();
      const exported = await JSZip.loadAsync(readFileSync(path!));

      // A whole-document comparison catches additions, deletions, and unrelated edits.
      expect(JSON.parse(await exported.file("world.json")!.async("string"))).toEqual(expected);
      expect(Object.keys(exported.files).sort()).toEqual(
        extension === "timber" ? Object.keys(archive.files).sort() : ["world.json"],
      );
      if (extension === "timber") {
        for (const [name, entry] of Object.entries(archive.files)) {
          expect(exported.files[name].dir).toBe(entry.dir);
          if (name !== "world.json" && !entry.dir) {
            expect(await exported.file(name)!.async("uint8array"), name)
              .toEqual(await entry.async("uint8array"));
          }
        }
      }
    });
  }
}
