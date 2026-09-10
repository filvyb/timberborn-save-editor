import { expect, test } from "@playwright/test";
import { downloadArchive, expectExport, generatedWorld, uploadBytes, uploadWorld } from "./save-helpers";

test("Iron Teeth research can be unlocked in a new settlement and locked after reopening", async ({ page }) => {
  const original = generatedWorld();
  original.Singletons.FactionService = { Id: "IronTeeth" };
  original.Singletons.BuildingUnlockingService = { UnlockedBuildings: [] };
  const input = await uploadWorld(page, original, "timber");
  await page.getByRole("button", { name: /^Research/ }).click();
  await expect(page.getByLabel("Forester.Folktails", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("BreedingPod.IronTeeth", { exact: true })).toHaveCount(0);
  await page.getByLabel("Forester.IronTeeth", { exact: true }).check();
  await page.getByLabel("Search research").fill("Numbercruncher");
  await page.getByRole("button", { name: "Unlock all shown", exact: true }).click();
  await page.getByLabel("Search research").fill("ArchOfProgress");
  await page.getByLabel("ArchOfProgress.IronTeeth", { exact: true }).check();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const expected = structuredClone(original);
  expected.Singletons.BuildingUnlockingService.UnlockedBuildings = ["Forester.IronTeeth", "Numbercruncher.IronTeeth", "ArchOfProgress.IronTeeth"];
  const exported = await downloadArchive(page);
  await expectExport(exported.archive, expected, input, "timber");
  await uploadBytes(page, exported.bytes, "timber");
  await page.getByRole("button", { name: /^Research/ }).click();
  await expect(page.getByLabel("Forester.IronTeeth", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Numbercruncher.IronTeeth", { exact: true })).toBeChecked();
  await expect(page.getByLabel("ArchOfProgress.IronTeeth", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Lock all shown", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expectExport((await downloadArchive(page)).archive, original, input, "timber");
});

for (const key of ["UnlockedBuildings", "UnlockedBuildingIds"]) {
  test(`research edits and discard preserve the archive using ${key}`, async ({ page }) => {
    const original = generatedWorld();
    if (key === "UnlockedBuildingIds") original.GameVersion = "v20210917-6e683a2-gw";
    original.Singletons.FactionService = { Id: "Folktails" };
    original.Singletons.BuildingUnlockingService = { [key]: ["Forester.Folktails", "Mod.Building"], Extra: { Keep: true } };
    const input = await uploadWorld(page, original, "timber");
    await page.getByRole("button", { name: /^Research/ }).click();
    await page.getByRole("button", { name: "Lock all shown", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expectExport((await downloadArchive(page)).archive, original, input, "timber");

    await page.getByRole("button", { name: /^Research/ }).click();
    await page.getByLabel("Forester.Folktails", { exact: true }).uncheck();
    await page.getByLabel("Search research").fill("DoublePlatform");
    await page.getByRole("button", { name: "Unlock all shown" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const expected = structuredClone(original);
    expected.Singletons.BuildingUnlockingService[key] = ["Mod.Building", "DoublePlatform.Folktails"];
    const exported = await downloadArchive(page);
    await expectExport(exported.archive, expected, input, "timber");
    await uploadBytes(page, exported.bytes, "timber");
    await page.getByRole("button", { name: /^Research/ }).click();
    await expect(page.getByLabel("Forester.Folktails", { exact: true })).not.toBeChecked();
    await expect(page.getByLabel("DoublePlatform.Folktails", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Mod.Building", { exact: true })).toBeChecked();
  });
}
