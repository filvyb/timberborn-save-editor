import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import JSZip from "jszip";
import { modernSave } from "../src/__tests__/fixtures";

const savePath = "saves/Larpago.timber";

async function dragFiles(page: Page, files: { name: string; bytes: number[] }[]) {
  return page.evaluateHandle(files => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
    return transfer;
  }, files);
}

for (const extension of ["json", "timber"]) {
  test(`opens a dropped .${extension} save`, async ({ page }) => {
    const json = JSON.stringify(modernSave());
    const bytes = extension === "json"
      ? Buffer.from(json)
      : await new JSZip().file("world.json", json).generateAsync({ type: "nodebuffer" });
    await page.goto("/");
    const dataTransfer = await dragFiles(page, [{ name: `dropped.${extension}`, bytes: [...bytes] }]);
    const dropZone = page.getByRole("region", { name: "Drop a save file" });
    await dropZone.dispatchEvent("dragenter", { dataTransfer });
    await expect(dropZone).toHaveClass(/is-dragging/);
    const input = page.getByLabel("Open a save file");
    await input.dispatchEvent("dragenter", { dataTransfer });
    await dropZone.dispatchEvent("dragleave", { dataTransfer });
    await expect(dropZone).toHaveClass(/is-dragging/);
    await input.dispatchEvent("dragleave", { dataTransfer });
    await expect(dropZone).not.toHaveClass(/is-dragging/);
    await dropZone.dispatchEvent("dragenter", { dataTransfer });
    const acceptsDrop = await input.evaluate((element, dataTransfer) => {
      const event = new DragEvent("dragover", { dataTransfer, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, dataTransfer);
    expect(acceptsDrop).toBe(true);
    await input.dispatchEvent("drop", { dataTransfer });
    await expect(page.getByText(/Timberborn 1.1.2.4/)).toBeVisible();
    await page.getByRole("button", { name: /^Properties/ }).click();
    await expect(page.getByLabel("Science", { exact: true })).toHaveValue("4170");
    await dataTransfer.dispose();
  });
}

test("rejects multiple or invalid dropped files and can recover", async ({ page }) => {
  await page.goto("/");
  const dropZone = page.getByRole("region", { name: "Drop a save file" });
  const badFile = { name: "bad.json", bytes: [...Buffer.from('{"Cycle":1}')] };
  for (const [files, error] of [
    [[badFile, badFile], "Drop one save file at a time."],
    [[{ ...badFile, name: "bad.txt" }], "Choose a .timber or .json save file."],
    [[badFile], "not a Timberborn world save"],
  ] as const) {
    const dataTransfer = await dragFiles(page, [...files]);
    await dropZone.dispatchEvent("dragenter", { dataTransfer });
    await dropZone.dispatchEvent("drop", { dataTransfer });
    await expect(page.getByRole("alert")).toContainText(error);
    await expect(dropZone).not.toHaveClass(/is-dragging/);
    await expect(page.getByLabel("Open a save file")).toBeEnabled();
    await dataTransfer.dispose();
  }
  const dataTransfer = await dragFiles(page, [{ name: "recovered.json", bytes: [...Buffer.from(JSON.stringify(modernSave()))] }]);
  await dropZone.dispatchEvent("drop", { dataTransfer });
  await expect(page.getByRole("button", { name: /Beaver copier/ })).toBeVisible();
  await dataTransfer.dispose();
});

test("invalid uploads show a useful error and the file input can recover", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open a save file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"Cycle":1}') });
  await expect(page.getByRole("alert")).toContainText("not a Timberborn world save");
  await page.getByRole("button", { name: "Iron Teeth · Plains" }).click();
  await expect(page.getByRole("button", { name: /Beaver copier/ })).toBeVisible();
  await page.getByRole("button", { name: /Beaver copier/ }).click();
  await expect(page.getByRole("cell", { name: "Aszea", exact: true })).toBeVisible();
});

test("edits and exports a supplied 1.1 save and opens its voxel map", async ({ page }) => {
  test.skip(!existsSync(savePath), "Place the local v1.1 example in saves/Larpago.timber to run this test.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Open a save file").setInputFiles(savePath);
  await expect(page.getByText(/Timberborn 1.1.2.4/)).toBeVisible();
  await page.getByRole("button", { name: /^Properties/ }).click();
  await expect(page.getByLabel("Difficulty preset")).toHaveValue("easy");
  await page.getByLabel("Difficulty preset").selectOption("hard");
  await expect(page.getByLabel("Max drought duration", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Food consumption multiplier")).toHaveValue("1");
  await page.getByLabel("Science", { exact: true }).fill("9000");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /Manage stockpile inventories/ }).click();
  await page.getByRole("button", { name: /SmallWarehouse.Folktails/ }).first().click();
  const inventory = page.locator("form.flex-fill");
  await expect(inventory.locator('input[type="number"]')).toHaveCount(1);
  await inventory.getByRole("button", { name: "Fill", exact: true }).click();
  await inventory.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /Manage active constructions/ }).click();
  await page.getByRole("button", { name: "Finish all", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /Beaver copier/ }).click();
  const firstRow = page.locator("tbody tr").first();
  const oldName = await firstRow.locator("td").first().innerText();
  await firstRow.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test beaver");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Test beaver", exact: true })).toBeVisible();
  expect(oldName.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /^Download/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(path!));
  const world = JSON.parse(await zip.file("world.json")!.async("string"));
  expect(world.GameVersion).toBe("1.1.2.4-52e959e-sw");
  expect(world.Singletons.ScienceService.SciencePoints).toBe(9000);
  expect(world.Singletons.DroughtWeather).toMatchObject({ MinDroughtDuration: 15, MaxDroughtDuration: 30, HandicapMultiplier: 0.2, HandicapCycles: 12 });
  expect(world.Singletons.BadtideWeather).toMatchObject({ HandicapMultiplier: 0.4, HandicapCycles: 9 });
  expect(world.Singletons.NeedModificationService.FoodConsumption).toBe(1);
  expect(world.Singletons.GameCycleService).toEqual({ Cycle: 17, CycleDay: 14 });
  expect(world.Entities.filter((entity: any) => entity.Components.BlockObjectState?.Finished === false)).toHaveLength(0);
  expect(world.Entities.some((entity: any) => entity.Components.NamedEntity?.EntityName === "Test beaver")).toBe(true);
  expect(zip.file("save_thumbnail.jpg")).not.toBeNull();
  expect(zip.file("version.txt")).not.toBeNull();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Map Interactive/ }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("heading", { name: "Map Editor", exact: true })).toBeVisible();
  // Wait for real WebGL rendering, including shader compilation.
  await expect.poll(() => page.locator("canvas").evaluate(canvas => {
    const gl = canvas.getContext("webgl2");
    return gl !== null && gl.drawingBufferWidth > 0;
  })).toBe(true);
  await page.screenshot({ path: "test-results/v1.1-map.png" });
  for (const template of ["Lodge.Folktails", "GearWorkshop.Folktails", "DoubleFloodgate.Folktails", "LargeWindTurbine.Folktails", "SuspensionBridge6x1.Folktails", "Overhang4x1.Folktails"]) {
    await page.getByLabel("Find building").fill(template);
    await page.getByRole("button", { name: new RegExp(`^${template.replaceAll(".", "\\.")} \\(`) }).first().click();
    await expect(page.getByRole("heading", { name: template, exact: true })).toBeVisible();
    await expect(page.getByText(/^Coordinates:/)).toBeVisible();
    await page.getByRole("button", { name: "Close inspection" }).click();
  }
  await page.getByLabel("Find building").fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(errors).toEqual([]);
});
