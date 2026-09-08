import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { storage } from "../src/__tests__/fixtures";
import { generatedWorld, uploadWorld, uploadBytes, downloadArchive, expectExport, type World } from "./save-helpers";

function workflowWorld() {
  const world = generatedWorld();
  const s = world.Singletons;
  Object.assign(s.BadtideWeather, { HandicapMultiplier: 0.3, HandicapCycles: 6, CyclesBeforeRandomizing: 5 });
  s.NeedModificationService = { FoodConsumption: 0.4, WaterConsumption: 0.4, Unknown: true };
  s.EffectProbabilityService = { InjuryChanceModifier: 0.3, Unknown: [2] };
  s.GoodRecoveryRateService = { DemolishableRecoveryRate: 0.9, Unknown: "keep" };
  s.MapSize.Size = { X: 16, Y: 16 };
  s.TerrainMap.Voxels.Array = Array(256).fill(1).join(" ");
  s.WaterMapNew.WaterColumns.Array = Array(256).fill(0).join(" ");
  s.SoilMoistureSimulator.MoistureLevels.Array = Array(256).fill(0).join(" ");
  entity(world, "beaver").Components.Character.Position = { X: 4.5, Y: 1, Z: 8.5 };
  entity(world, "kit").Components.Character.Position = { X: 12.5, Y: 1, Z: 8.5 };
  for (const id of ["beaver", "kit"]) {
    entity(world, id).Components.MortalNeeder = { DeathDays: [7], Unknown: true };
    entity(world, id).Components.NeedManager.Needs.push({ Name: "Sleep", Points: 0.3 }, { Name: "Fun", Points: 0.6 });
  }
  const otherGood = storage("Plank"); otherGood.Id = "plank-storage";
  const otherTemplate = storage("Log", "LargePile.Folktails"); otherTemplate.Id = "large-storage";
  const unfinished = storage(); unfinished.Id = "unfinished-storage";
  unfinished.Components.BlockObjectState = { Finished: false };
  const secondSite = structuredClone(entity(world, "site")); secondSite.Id = "second-site";
  const otherSite = structuredClone(secondSite); otherSite.Id = "other-site"; otherSite.Template = "Stairs.Folktails";
  world.Entities.push(otherGood, otherTemplate, unfinished, secondSite, otherSite);
  return world;
}

function entity(world: World, id: string) {
  const found = world.Entities.find(entity => entity.Id === id);
  expect(found, id).toBeDefined();
  return found!;
}

async function submit(page: Page) {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
}

async function editStockpile(page: Page) {
  await page.getByRole("button", { name: /Manage stockpile inventories/ }).click();
  await page.getByRole("button", { name: /SmallPile.Folktails/ }).first().click();
  await page.getByLabel("Log", { exact: true }).fill("12");
}

async function editName(page: Page) {
  await page.getByRole("button", { name: /Beaver copier/ }).click();
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Original", exact: true }) })
    .getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Edited name");
  await page.getByRole("button", { name: "Update", exact: true }).click();
}

async function openMap(page: Page) {
  await page.getByRole("button", { name: /^Map Interactive/ }).click();
  await expect(page.getByRole("heading", { name: "Map Editor", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
}

async function selectMapStockpile(page: Page) {
  await page.getByLabel("Find building").fill("SmallPile");
  await page.getByRole("button", { name: "SmallPile.Folktails (0, 0, 1)", exact: true }).first().click();
}

async function selectMapBeaver(page: Page, world: World) {
  // Click the rendered adult using the initial camera projection, without touching app state.
  const canvas = page.locator("canvas");
  // Canvas is briefly 300 × 150 before React Three Fiber applies the viewport size.
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(page.viewportSize()!.width);
  const bounds = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(75, bounds.width / bounds.height, 0.1, 1000);
  camera.position.set(32, 64, -64);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const { X, Y, Z } = entity(world, "beaver").Components.Character.Position;
  const size = world.Singletons.MapSize.Size;
  const point = new Vector3(X - 0.5 - size.X / 2, Y + 0.6, size.Y / 2 - Z + 0.5).project(camera);
  await expect(async () => {
    await canvas.click({ position: { x: (point.x + 1) * bounds.width / 2, y: (1 - point.y) * bounds.height / 2 } });
    await expect(page.getByRole("heading", { name: "BeaverAdult", exact: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
}

const discardEdits = [
  { name: "properties", async edit(page: Page) {
    await page.getByRole("button", { name: /^Properties/ }).click();
    await page.getByLabel("Difficulty preset").selectOption("hard");
  } },
  { name: "stockpiles", async edit(page: Page) {
    await editStockpile(page);
    await page.getByRole("button", { name: "OK", exact: true }).click();
  } },
  { name: "beavers", edit: editName },
  { name: "constructions", async edit(page: Page) {
    await page.getByRole("button", { name: /Manage active constructions/ }).click();
    await page.getByRole("button", { name: "Finish all", exact: true }).click();
  } },
  { name: "map", async edit(page: Page) {
    await openMap(page);
    await selectMapStockpile(page);
    await page.getByLabel("Log", { exact: true }).fill("12");
    await page.getByRole("button", { name: "OK", exact: true }).click();
  } },
];

for (const extension of ["json", "timber"] as const) {
  test.describe(`generated .${extension} save workflows`, () => {
    for (const { name, edit } of discardEdits) {
      test(`discard ${name} changes leaves the export untouched`, async ({ page }) => {
        const original = workflowWorld();
        const input = await uploadWorld(page, original, extension);
        await edit(page);
        await page.getByRole("button", { name: "Discard changes", exact: true }).click();
        await expectExport((await downloadArchive(page)).archive, original, input, extension);
      });
    }

    for (const field of ["name", "need", "stockpile"] as const) {
      test(`map ${field} edit changes only the selected field`, async ({ page }) => {
        const original = workflowWorld();
        const expected = structuredClone(original);
        const input = await uploadWorld(page, original, extension);
        await openMap(page);
        if (field === "stockpile") {
          await selectMapStockpile(page);
          await page.getByLabel("Log", { exact: true }).fill("12");
          entity(expected, "storage").Components["Inventory:Stockpile"].Storage.Goods[0].Amount = 12;
        } else {
          await selectMapBeaver(page, original);
          if (field === "name") {
            await page.getByLabel("Name", { exact: true }).fill("Map name");
            entity(expected, "beaver").Components.NamedEntity.EntityName = "Map name";
          } else {
            await page.getByRole("slider", { name: "Hunger", exact: true }).focus();
            await page.keyboard.press("End");
            entity(expected, "beaver").Components.NeedManager.Needs[0].Points = 1;
          }
        }
        await page.getByRole("button", { name: "OK", exact: true }).click();
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expectExport((await downloadArchive(page)).archive, expected, input, extension);
      });
    }

    test("apply to matching storages preserves different goods, templates, and unfinished storages", async ({ page }) => {
      const original = workflowWorld();
      const expected = structuredClone(original);
      for (const id of ["storage", "other-storage"]) {
        entity(expected, id).Components["Inventory:Stockpile"].Storage.Goods[0].Amount = 12;
      }
      const input = await uploadWorld(page, original, extension);
      await editStockpile(page);
      await page.getByRole("button", { name: "Apply to matching storages", exact: true }).click();
      await submit(page);
      await expectExport((await downloadArchive(page)).archive, expected, input, extension);
    });

    test("filtered Finish all changes only the matching construction sites", async ({ page }) => {
      const original = workflowWorld();
      const expected = structuredClone(original);
      for (const id of ["site", "second-site"]) {
        const components = entity(expected, id).Components;
        components.BlockObjectState.Finished = true;
        delete components.ConstructionSite;
      }
      const input = await uploadWorld(page, original, extension);
      await page.getByRole("button", { name: /Manage active constructions/ }).click();
      await page.getByLabel("Filter by..").selectOption("building");
      await page.getByLabel("With value..").selectOption("Platform.Folktails");
      await page.getByRole("button", { name: "Apply filter", exact: true }).click();
      await expect(page.getByRole("button", { name: "Finish", exact: true })).toHaveCount(2);
      await page.getByRole("button", { name: "Finish all", exact: true }).click();
      await submit(page);
      await expectExport((await downloadArchive(page)).archive, expected, input, extension);
    });

    for (const id of ["beaver", "kit"]) {
      test(`copy ${id} adds one reset clone and preserves all original entities`, async ({ page }) => {
        const original = workflowWorld();
        const source = entity(original, id);
        const input = await uploadWorld(page, original, extension);
        await page.getByRole("button", { name: /Beaver copier/ }).click();
        await page.getByRole("row").filter({ has: page.getByRole("cell", {
          name: source.Components.NamedEntity.EntityName, exact: true,
        }) }).getByRole("button", { name: "Copy", exact: true }).click();
        await submit(page);
        const exported = await downloadArchive(page);
        const world: World = JSON.parse(await exported.archive.file("world.json")!.async("string"));
        const originalIds = new Set(original.Entities.map(entity => entity.Id));
        const additions = world.Entities.filter(entity => !originalIds.has(entity.Id));
        expect(additions).toHaveLength(1);
        expect(new Set(world.Entities.map(entity => entity.Id)).size).toBe(world.Entities.length);
        expect(additions[0].Id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        const clone = structuredClone(source);
        clone.Id = additions[0].Id;
        clone.Components.NamedEntity.EntityName = "New name";
        clone.Components.Character.DayOfBirth = original.Singletons.DayNightCycle.DayNumber - (id === "beaver" ? 5 : 0);
        clone.Components.MortalNeeder.DeathDays = [];
        for (const need of clone.Components.NeedManager.Needs) {
          if (["Hunger", "Thirst", "Sleep"].includes(need.Name)) need.Points = 1;
        }
        for (const key of ["Worker", "Dweller", "GoodCarrier", "GoodReserver", "Walker", "WalkToAccessibleExecutor"]) {
          delete clone.Components[key];
        }
        clone.Components.BehaviorManager = { RunningBehavior: `${clone.Id}:WanderRootBehavior`, ReturnToBehavior: false };
        clone.Components.LifeProgressor.LifeProgress = 0;
        if (id === "kit") clone.Components.Child.GrowthProgress = 0;
        const expected = structuredClone(original);
        expected.Entities.push(clone);
        await expectExport(exported.archive, expected, input, extension);
      });
    }

    const presets = [
      { id: "easy", temperate: [16, 19], drought: [2, 4, 0.25, 8], badtide: [1, 3, 0.3, 6, 5], consumption: 0.4, injury: 0.3, refund: 0.9 },
      { id: "normal", temperate: [13, 17], drought: [5, 9, 0.38, 5], badtide: [4, 8, 0.15, 5, 4], consumption: 1, injury: 1, refund: 0.75 },
      { id: "hard", temperate: [5, 8], drought: [15, 30, 0.2, 12], badtide: [15, 30, 0.4, 9, 3], consumption: 1, injury: 1, refund: 0.75 },
    ];
    for (const preset of presets) {
      test(`${preset.id} preset changes only its defined settings`, async ({ page }) => {
        const original = workflowWorld();
        original.Singletons.DroughtWeather.MinDroughtDuration = 1;
        original.Singletons.BadtideWeather.ChanceBadtideWeather = 0.7;
        const expected = structuredClone(original);
        const s = expected.Singletons;
        [s.TemperateWeatherDurationService.MinTemperateWeatherDuration, s.TemperateWeatherDurationService.MaxTemperateWeatherDuration] = preset.temperate;
        [s.DroughtWeather.MinDroughtDuration, s.DroughtWeather.MaxDroughtDuration, s.DroughtWeather.HandicapMultiplier, s.DroughtWeather.HandicapCycles] = preset.drought;
        [s.BadtideWeather.MinBadtideWeatherDuration, s.BadtideWeather.MaxBadtideWeatherDuration, s.BadtideWeather.HandicapMultiplier,
          s.BadtideWeather.HandicapCycles, s.BadtideWeather.CyclesBeforeRandomizing] = preset.badtide;
        s.BadtideWeather.ChanceBadtideWeather = 0.4;
        s.NeedModificationService.FoodConsumption = s.NeedModificationService.WaterConsumption = preset.consumption;
        s.EffectProbabilityService.InjuryChanceModifier = preset.injury;
        s.GoodRecoveryRateService.DemolishableRecoveryRate = preset.refund;
        const input = await uploadWorld(page, original, extension);
        await page.getByRole("button", { name: /^Properties/ }).click();
        await page.getByLabel("Difficulty preset").selectOption(preset.id);
        await submit(page);
        await expectExport((await downloadArchive(page)).archive, expected, input, extension);
      });
    }

    for (const { label, key, metadataKey, value } of [
      { label: "Cycle", key: "Cycle", metadataKey: "Cycle", value: 23 },
      { label: "Cycle day", key: "CycleDay", metadataKey: "Day", value: 6 },
    ]) {
      test(`${label} edit updates world and save metadata together`, async ({ page }) => {
        const original = workflowWorld();
        const expected = structuredClone(original);
        expected.Singletons.GameCycleService[key] = value;
        const input = await uploadWorld(page, original, extension);
        await page.getByRole("button", { name: /^Properties/ }).click();
        await page.getByLabel(label, { exact: true }).fill(String(value));
        await submit(page);
        await expectExport((await downloadArchive(page)).archive, expected, input, extension, { [metadataKey]: value });
      });
    }

    test("repeated exports and reopening retain exactly the submitted edits", async ({ page }) => {
      const original = workflowWorld();
      const expected = structuredClone(original);
      expected.Singletons.ScienceService.SciencePoints = 9000;
      const input = await uploadWorld(page, original, extension);
      await page.getByRole("button", { name: /^Properties/ }).click();
      await page.getByLabel("Science", { exact: true }).fill("9000");
      await submit(page);
      const first = await downloadArchive(page);
      await expectExport(first.archive, expected, input, extension);
      await expectExport((await downloadArchive(page)).archive, expected, first.archive, "timber");
      await uploadBytes(page, first.bytes, "timber");
      await page.getByRole("button", { name: /^Properties/ }).click();
      await expect(page.getByLabel("Science", { exact: true })).toHaveValue("9000");
      await submit(page);
      await expectExport((await downloadArchive(page)).archive, expected, first.archive, "timber");
    });
  });
}
