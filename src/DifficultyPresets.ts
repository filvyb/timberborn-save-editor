import type { DemoSave } from "./DemoSave";
import { getPropertyFields } from "./PropertiesUtil";

export type DifficultyPresetId = "easy" | "normal" | "hard";
interface DifficultyPreset {
  id: DifficultyPresetId;
  label: string;
  values: Record<string, number>;
}

/**
 * Version 1 game defaults (not the older Update 5 table):
 * https://timberborn.wiki.gg/wiki/Game_Mode#Settings
 * Values also verified against 1.1.2.4 saves.
 * Starting resources/population are new-game settings, so are intentionally excluded.
 */
function preset(
  id: DifficultyPresetId, label: string,
  temperate: [number, number], drought: [number, number, number, number],
  badtide: [number, number, number, number, number], consumption: number, injury: number, refund: number,
): DifficultyPreset {
  return { id, label, values: {
    "TemperateWeatherDurationService.MinTemperateWeatherDuration": temperate[0],
    "TemperateWeatherDurationService.MaxTemperateWeatherDuration": temperate[1],
    "DroughtWeather.MinDroughtDuration": drought[0],
    "DroughtWeather.MaxDroughtDuration": drought[1],
    "DroughtWeather.HandicapMultiplier": drought[2],
    "DroughtWeather.HandicapCycles": drought[3],
    "BadtideWeather.MinBadtideWeatherDuration": badtide[0],
    "BadtideWeather.MaxBadtideWeatherDuration": badtide[1],
    "BadtideWeather.HandicapMultiplier": badtide[2],
    "BadtideWeather.HandicapCycles": badtide[3],
    "BadtideWeather.CyclesBeforeRandomizing": badtide[4],
    "BadtideWeather.ChanceBadtideWeather": 0.4,
    "NeedModificationService.FoodConsumption": consumption,
    "NeedModificationService.WaterConsumption": consumption,
    "EffectProbabilityService.InjuryChanceModifier": injury,
    "GoodRecoveryRateService.DemolishableRecoveryRate": refund,
  } };
}

export const difficultyPresets: DifficultyPreset[] = [
  preset("easy", "Easy", [16, 19], [2, 4, 0.25, 8], [1, 3, 0.3, 6, 5], 0.4, 0.3, 0.9),
  preset("normal", "Normal", [13, 17], [5, 9, 0.38, 5], [4, 8, 0.15, 5, 4], 1, 1, 0.75),
  preset("hard", "Hard", [5, 8], [15, 30, 0.2, 12], [15, 30, 0.4, 9, 3], 1, 1, 0.75),
];

export function getPresetValues(singletons: DemoSave["Singletons"], id: DifficultyPresetId): Record<string, string> {
  const preset = difficultyPresets.find(preset => preset.id === id)!;
  return Object.fromEntries(getPropertyFields(singletons).flatMap(({ service, key }) => {
    const path = `${service}.${key}`;
    return Object.hasOwn(preset.values, path) ? [[path, String(preset.values[path])]] : [];
  }));
}

/** Match the editable settings, not a stored game-mode name or starting conditions. */
export function detectDifficultyPreset(singletons: DemoSave["Singletons"], values: Record<string, string>): DifficultyPresetId | "custom" {
  for (const preset of difficultyPresets) {
    const entries = Object.entries(getPresetValues(singletons, preset.id));
    if (entries.length > 0 && entries.every(([key, expected]) => values[key]?.trim() && Number(values[key]) === Number(expected))) {
      return preset.id;
    }
  }
  return "custom";
}
