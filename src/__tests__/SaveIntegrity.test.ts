// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { loadSave, exportSave } from "../SaveFile";
import { updateProperties } from "../PropertiesUtil";
import { StockpileUtil } from "../StockpileUtil";
import { readEntityData, writeEntityData } from "../MapEntities";
import { modernSave } from "./fixtures";
import { expectSaveArchive, worldData } from "./saveAssertions";

function fixture() {
  const save = modernSave();
  save.UnknownRoot = { Text: "Příliš žluťoučký bobr 🦫", Values: [null, false, 0, "", { Nested: [1, 2] }] };
  save.Singletons.GameCycleService.Unknown = { Keep: "cycle settings" };
  return worldData(save);
}

function entity(world: ReturnType<typeof worldData>, id: string) {
  const result = world.Entities.find(entity => entity.Id === id);
  if (!result) throw new Error(`Missing test entity ${id}`);
  return result;
}

function inputArchive(world: ReturnType<typeof worldData>) {
  const archive = new JSZip();
  archive.folder("mods/empty");
  archive.file("mods/world.json", '{"this":"is not the world"}');
  archive.file("mods/žluťoučký.bin", Uint8Array.from({ length: 256 }, (_, i) => i));
  archive.file("empty.dat", new Uint8Array());
  archive.file("save_thumbnail.jpg", new Uint8Array([255, 216, 255, 217]));
  archive.file("save_metadata.json", JSON.stringify({ Cycle: 17, Day: 14, Mods: [{ Name: "Mod", Data: [null, false] }] }, null, 2));
  archive.file("version.txt", `${world.GameVersion}\r\n`);
  archive.file("world.json", `\uFEFF${JSON.stringify(world, null, 2)}`);
  return archive;
}

// Ordinary editor workflows are covered by e2e/export-integrity.spec.ts and
// e2e/editor-workflows.spec.ts. Keep only gaps at the save/archive boundary here.
describe("save integrity edge cases", () => {
  it.each(["WeatherService", "CycleService"])("updates archive metadata from legacy %s fields", async service => {
    const original = fixture();
    original.Singletons[service] = original.Singletons.GameCycleService;
    delete original.Singletons.GameCycleService;
    const expected = structuredClone(original);
    expected.Singletons[service].Cycle = 23;
    expected.Singletons[service].CycleDay = 6;
    const bytes = await inputArchive(original).generateAsync({ type: "uint8array" });
    const save = await loadSave(bytes, "generated.timber");
    save.Singletons = updateProperties(save.Singletons, { [`${service}.Cycle`]: "23", [`${service}.CycleDay`]: "6" });
    await expectSaveArchive(await exportSave(save), expected, await JSZip.loadAsync(bytes), { Cycle: 23, Day: 6 });
  });

  it("retains an inventory edit when the same building is edited through the map after reopening", async () => {
    const original = fixture();
    const peer = structuredClone(entity(original, "storage"));
    peer.Id = "peer-storage";
    original.Entities.unshift({ Id: "mod-service", Template: "Mod.Service", Components: { References: ["storage"] } });
    original.Entities.push(peer);
    const expected = structuredClone(original);
    entity(expected, "storage").Components["Inventory:Stockpile"].Storage.Goods[0].Amount = 12;
    const bytes = await inputArchive(original).generateAsync({ type: "uint8array" });
    let save = await loadSave(bytes, "generated.timber");
    save.Entities = save.Entities.map(e => e.Id === "storage" ? StockpileUtil.setGoods(e, { Log: 12 }) : e);
    const firstExport = await exportSave(save);
    const first = await expectSaveArchive(firstExport, expected, await JSZip.loadAsync(bytes));
    save = await loadSave(firstExport, "reopened.timber");

    const data = readEntityData(save);
    const moved = structuredClone(data.entitiesByIds.storage);
    moved.Components.BlockObject.Coordinates = { X: 2, Y: 1, Z: 3 };
    data.entitiesByIds.storage = moved;
    data.updateIds.push("storage");
    save = writeEntityData(save, data);
    entity(expected, "storage").Components.BlockObject.Coordinates = { X: 2, Y: 1, Z: 3 };
    await expectSaveArchive(await exportSave(save), expected, first);
  });

  it("rejects invalid edits without leaving partial changes in the next export", async () => {
    const original = fixture();
    const bytes = await inputArchive(original).generateAsync({ type: "uint8array" });
    const save = await loadSave(bytes, "generated.timber");
    expect(() => updateProperties(save.Singletons, {
      "ScienceService.SciencePoints": "9000", "GameCycleService.CycleDay": "-1",
    })).toThrow();
    expect(() => StockpileUtil.setGoods(entity(save, "storage"), { Log: 12, Water: 1 })).toThrow();
    await expectSaveArchive(await exportSave(save), original, await JSZip.loadAsync(bytes));
  });
});

describe("invalid world data", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3", null])("rejects invalid map dimensions %j", async value => {
    const world = fixture();
    world.Singletons.MapSize.Size.X = value as number;
    await expect(loadSave(new TextEncoder().encode(JSON.stringify(world)), "generated.json")).rejects.toThrow("map dimensions");
  });

  it.each([null, { Id: 12, Template: "Path", Components: {} }, { Id: "broken", Components: {} },
    { Id: "broken", Template: "Path", Components: null }])("rejects a malformed entity among valid neighbors (%j)", async invalid => {
    const world = fixture();
    world.Entities.splice(2, 0, invalid as unknown as typeof world.Entities[number]);
    await expect(loadSave(new TextEncoder().encode(JSON.stringify(world)), "generated.json")).rejects.toThrow("invalid entity");
  });

  it.each([NaN, Infinity, -Infinity])("rejects nested invalid numbers during export and can recover (%s)", async value => {
    const original = fixture();
    const bytes = await inputArchive(original).generateAsync({ type: "uint8array" });
    const save = await loadSave(bytes, "generated.timber");
    entity(save, "storage").Components.UnknownComponent.Keep[2] = value;
    await expect(exportSave(save)).rejects.toThrow("invalid number");
    entity(save, "storage").Components.UnknownComponent.Keep[2] = 3;
    await expectSaveArchive(await exportSave(save), original, await JSZip.loadAsync(bytes));
  });
});
