import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { modernSave } from "../src/__tests__/fixtures";

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
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("renders visible zipline cables between the selected pylons", async ({ page }) => {
  const save = modernSave();
  save.Singletons.MapSize.Size = { X: 32, Y: 32 };
  save.Singletons.TerrainMap = { Voxels: { Array: Array(1024).fill(1).join(" ") } };
  save.Singletons.WaterMapNew = { Levels: 1, WaterColumns: { Array: "" } };
  save.Entities = [8, 24].map((x, index) => ({ Id: `pylon-${index}`, Template: "ZiplinePylon.Folktails", Components: {
    BlockObject: { Coordinates: { X: x, Y: 8, Z: 1 } },
    ZiplineTower: { ConnectionTargets: [`pylon-${1 - index}`] },
  } }));
  await page.goto("/");
  await page.getByLabel("Open a save file").setInputFiles({ name: "ziplines.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await page.getByRole("button", { name: /^Map Interactive/ }).click();
  await page.getByLabel("Find building").fill("ZiplinePylon");
  await page.getByRole("button", { name: "ZiplinePylon.Folktails (8, 8, 1)", exact: true }).click();
  // Selected cables are purple. Their horizontal span must extend beyond the narrow pole.
  // This catches screen-space line faces being culled by the reflected map transform.
  await expect.poll(async () => {
    const png = (await page.locator("canvas").screenshot()).toString("base64");
    return page.evaluate(async png => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width, maxX = -1;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (b > r + 30 && r > g + 15 && g > 30) {
          const x = (i / 4) % canvas.width; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        }
      }
      return maxX - minX;
    }, png);
  }, { timeout: 30000 }).toBeGreaterThan(100);
  await page.screenshot({ path: "test-results/zipline-cables.png" });
});
