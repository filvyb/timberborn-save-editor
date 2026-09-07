import type { DemoSave } from "./DemoSave";

export interface PropertyField { label: string; service: string; key: string; min: number; step: number; max?: number }
const field = (label: string, service: string, key: string, min = 0, step = 1, max?: number): PropertyField => ({ label, service, key, min, step, max });
const fields = [
  field("Science", "ScienceService", "SciencePoints"),
  ...["GameCycleService", "WeatherService", "CycleService"].flatMap(service => [field("Cycle", service, "Cycle", 1), field("Cycle day", service, "CycleDay", 1)]),
  field("Temperate weather duration", "TemperateWeatherDurationService", "TemperateWeatherDuration"),
  field("Hazardous weather duration", "HazardousWeatherService", "HazardousWeatherDuration"),
  ...["TemperateWeatherDurationService", "WeatherDurationService"].flatMap(service => [
    field("Min temperate weather duration", service, "MinTemperateWeatherDuration"),
    field("Max temperate weather duration", service, "MaxTemperateWeatherDuration"),
  ]),
  ...["DroughtWeather", "WeatherDurationService"].flatMap(service => [
    field("Min drought duration", service, "MinDroughtDuration"), field("Max drought duration", service, "MaxDroughtDuration"),
    field("Drought handicap multiplier", service, "HandicapMultiplier", 0, 0.01, 1), field("Drought handicap cycles", service, "HandicapCycles"),
  ]),
  field("Min badtide duration", "BadtideWeather", "MinBadtideWeatherDuration"),
  field("Max badtide duration", "BadtideWeather", "MaxBadtideWeatherDuration"),
  field("Badtide handicap multiplier", "BadtideWeather", "HandicapMultiplier", 0, 0.01, 1),
  field("Badtide handicap cycles", "BadtideWeather", "HandicapCycles"),
  field("Cycles before random badtides", "BadtideWeather", "CyclesBeforeRandomizing"),
  field("Badtide chance", "BadtideWeather", "ChanceBadtideWeather", 0, 0.01, 1),
  field("Food consumption multiplier", "NeedModificationService", "FoodConsumption", 0, 0.01),
  field("Water consumption multiplier", "NeedModificationService", "WaterConsumption", 0, 0.01),
  field("Injury chance multiplier", "EffectProbabilityService", "InjuryChanceModifier", 0, 0.01),
  field("Building refund rate", "GoodRecoveryRateService", "DemolishableRecoveryRate", 0, 0.01, 1),
  field("Temperate weather duration", "WeatherService", "TemperateWeatherDuration"),
  field("Drought duration", "WeatherService", "DroughtDuration"),
  field("Wet season duration", "CycleService", "WetSeasonDuration"),
  field("Dry season duration", "CycleService", "DrySeasonDuration"),
];

export function getPropertyFields(singletons: DemoSave["Singletons"]): PropertyField[] {
  return fields.filter(({ service, key }) => typeof singletons[service]?.[key] === "number");
}

export function updateProperties(singletons: DemoSave["Singletons"], values: Record<string, string>): DemoSave["Singletons"] {
  const result = structuredClone(singletons);
  for (const field of getPropertyFields(singletons)) {
    const id = `${field.service}.${field.key}`;
    const raw = values[id];
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < field.min ||
        (field.max !== undefined && value > field.max) || (field.step === 1 && !Number.isInteger(value))) {
      throw new Error(`Enter a valid value for ${field.label}.`);
    }
    result[field.service][field.key] = value;
  }
  for (const service of Object.values(result)) {
    if (!service || typeof service !== "object") continue;
    for (const key of Object.keys(service)) {
      if (key.startsWith("Min") && typeof service[key] === "number" && service[key] > service[`Max${key.slice(3)}`]) {
        throw new Error("Minimum weather duration cannot exceed maximum duration.");
      }
    }
  }
  return result;
}
