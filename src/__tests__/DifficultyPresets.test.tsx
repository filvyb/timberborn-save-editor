import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { difficultyPresets, detectDifficultyPreset, getPresetValues } from "../DifficultyPresets";
import { getPropertyFields, updateProperties } from "../PropertiesUtil";
import { PropertiesPlugin } from "../plugins/PropertiesPlugin";
import { modernSave } from "./fixtures";

function singletons() {
  const data = modernSave().Singletons;
  Object.assign(data.BadtideWeather, { HandicapMultiplier: 0.3, HandicapCycles: 6, CyclesBeforeRandomizing: 5 });
  data.NeedModificationService = { FoodConsumption: 0.4, WaterConsumption: 0.4, Unknown: "keep" };
  data.EffectProbabilityService = { InjuryChanceModifier: 0.3 };
  data.GoodRecoveryRateService = { DemolishableRecoveryRate: 0.9 };
  return data;
}
const formValues = (data: ReturnType<typeof singletons>) => Object.fromEntries(
  getPropertyFields(data).map(({ service, key }) => [`${service}.${key}`, String(data[service][key])])
);

describe("difficulty presets", () => {
  it.each([
    ["easy", [16, 19, 2, 4, 0.25, 8, 1, 3, 0.3, 6, 5, 0.4, 0.4, 0.4, 0.3, 0.9]],
    ["normal", [13, 17, 5, 9, 0.38, 5, 4, 8, 0.15, 5, 4, 0.4, 1, 1, 1, 0.75]],
    ["hard", [5, 8, 15, 30, 0.2, 12, 15, 30, 0.4, 9, 3, 0.4, 1, 1, 1, 0.75]],
  ] as const)("uses current game defaults for %s and preserves unrelated data", (id, expected) => {
    const original = singletons();
    const before = structuredClone(original);
    const patch = getPresetValues(original, id);
    expect(Object.values(difficultyPresets.find(preset => preset.id === id)!.values)).toEqual(expected);
    expect(Object.keys(patch)).toHaveLength(16);
    const result = updateProperties(original, { ...formValues(original), ...patch });
    expect(detectDifficultyPreset(result, formValues(result))).toBe(id);
    expect(original).toEqual(before);
    expect(result.ScienceService).toEqual(before.ScienceService);
    expect(result.GameCycleService).toEqual(before.GameCycleService);
    expect(result.DayNightCycle).toEqual(before.DayNightCycle);
    expect(result.HazardousWeatherService).toEqual(before.HazardousWeatherService);
    expect(result.TemperateWeatherDurationService.TemperateWeatherDuration).toBe(18);
    expect(result.NeedModificationService.Unknown).toBe("keep");
    expect(result.UnknownService).toEqual(before.UnknownService);
  });

  it("does not invent missing properties or legacy services", () => {
    const data = modernSave().Singletons;
    const patch = getPresetValues(data, "hard");
    expect(patch["BadtideWeather.HandicapCycles"]).toBeUndefined();
    expect(patch["NeedModificationService.FoodConsumption"]).toBeUndefined();
    const result = updateProperties(data, patch);
    expect(result.NeedModificationService).toBeUndefined();
    expect(result.WeatherService).toBeUndefined();
    expect(Object.keys(result.BadtideWeather)).toEqual(Object.keys(data.BadtideWeather));
    expect(getPresetValues({ MapSize: data.MapSize, DayNightCycle: data.DayNightCycle }, "easy")).toEqual({});
  });

  it("recognizes manual customization and ignores unrelated form edits", () => {
    const data = singletons();
    const values = formValues(data);
    values["ScienceService.SciencePoints"] = "9999";
    expect(detectDifficultyPreset(data, values)).toBe("easy");
    values["DroughtWeather.MinDroughtDuration"] = "3";
    expect(detectDifficultyPreset(data, values)).toBe("custom");
    values["DroughtWeather.MinDroughtDuration"] = "";
    expect(detectDifficultyPreset(data, values)).toBe("custom");
  });

  it("populates the form, allows customization and saves only on Submit", async () => {
    const user = userEvent.setup();
    const data = singletons();
    const onSubmit = vi.fn();
    render(<PropertiesPlugin.Editor initialData={data} onClose={() => {}} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Difficulty preset")).toHaveValue("easy");
    await user.selectOptions(screen.getByLabelText("Difficulty preset"), "normal");
    expect(screen.getByLabelText("Min drought duration")).toHaveValue(5);
    expect(screen.getByLabelText("Food consumption multiplier")).toHaveValue(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(data.DroughtWeather.MinDroughtDuration).toBe(2);
    await user.clear(screen.getByLabelText("Min drought duration"));
    await user.type(screen.getByLabelText("Min drought duration"), "6");
    expect(screen.getByLabelText("Difficulty preset")).toHaveValue("custom");
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].DroughtWeather.MinDroughtDuration).toBe(6);
    expect(onSubmit.mock.calls[0][0].BadtideWeather.HandicapMultiplier).toBe(0.15);
  });

  it("discards a preset without changing the save", async () => {
    const user = userEvent.setup();
    const data = singletons();
    const before = structuredClone(data);
    const onClose = vi.fn(); const onSubmit = vi.fn();
    render(<PropertiesPlugin.Editor initialData={data} onClose={onClose} onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByLabelText("Difficulty preset"), "hard");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(data).toEqual(before);
  });
});
