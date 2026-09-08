import { test, expect, type Page } from "@playwright/test";
import { generatedWorld, uploadWorld, downloadArchive, expectExport } from "./save-helpers";
import type { DemoSave } from "../src/DemoSave";

interface EditScenario {
  label: string;
  updateExpected: (world: Pick<DemoSave, "Singletons" | "Entities">) => void;
  edit: (page: Page) => Promise<void>;
}

const changes: EditScenario[] = [
  ...[
    { label: "Science", service: "ScienceService", key: "SciencePoints", value: 9000 },
    { label: "Max drought duration", service: "DroughtWeather", key: "MaxDroughtDuration", value: 9 },
    { label: "Badtide chance", service: "BadtideWeather", key: "ChanceBadtideWeather", value: 0.65 },
  ].map(({ label, service, key, value }): EditScenario => ({
    label,
    updateExpected(world) {
      expect(world.Singletons[service][key]).not.toBe(value);
      world.Singletons[service][key] = value;
    },
    async edit(page) {
      await page.getByRole("button", { name: /^Properties/ }).click();
      await page.getByLabel(label, { exact: true }).fill(String(value));
    },
  })),
  {
    label: "one stockpile quantity",
    updateExpected(world) {
      world.Entities.find(entity => entity.Id === "storage")!
        .Components["Inventory:Stockpile"].Storage.Goods[0].Amount = 12;
    },
    async edit(page) {
      await page.getByRole("button", { name: /Manage stockpile inventories/ }).click();
      await page.getByRole("button", { name: /SmallPile.Folktails/ }).first().click();
      await page.getByLabel("Log", { exact: true }).fill("12");
      await page.getByRole("button", { name: "OK", exact: true }).click();
    },
  },
  ...["Original", "Original kit"].map((name): EditScenario => ({
    label: `${name} beaver name`,
    updateExpected(world) {
      world.Entities.find(entity => entity.Components.NamedEntity?.EntityName === name)!
        .Components.NamedEntity.EntityName = "Renamed beaver";
    },
    async edit(page) {
      await page.getByRole("button", { name: /Beaver copier/ }).click();
      await page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) })
        .getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Renamed beaver");
      await page.getByRole("button", { name: "Update", exact: true }).click();
    },
  })),
];

for (const extension of ["json", "timber"] as const) {
  for (const { label, updateExpected, edit } of changes) {
    test(`changing only ${label} preserves all other data from a .${extension} save`, async ({ page }) => {
      const original = generatedWorld();
      const expected = structuredClone(original);
      updateExpected(expected);
      expect(expected).not.toEqual(original);

      const archive = await uploadWorld(page, original, extension);
      await edit(page);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      const exported = await downloadArchive(page);
      await expectExport(exported.archive, expected, archive, extension);
    });
  }
}
