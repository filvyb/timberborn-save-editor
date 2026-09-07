import { useState } from "react";
import type { DemoSave } from "../DemoSave";
import type { IEditorPlugin } from "../IEditorPlugin";
import { detectDifficultyPreset, difficultyPresets, getPresetValues, type DifficultyPresetId } from "../DifficultyPresets";
import { getPropertyFields, updateProperties } from "../PropertiesUtil";

type Singletons = DemoSave["Singletons"];
export const PropertiesPlugin: IEditorPlugin<Singletons, Singletons> = {
  read: (save) => save.Singletons,
  write: (save, Singletons) => ({ ...save, Singletons }),
  position: 0, id: "PropertiesPlugin", name: "Properties", group: "General", enabled: true,
  Preview: ({ saveData }) => <div className="row">
    {getPropertyFields(saveData.Singletons).slice(0, 5).map(({ label, service, key }) =>
      <div className="col-md-4" key={`${service}.${key}`}>{label}: <strong>{saveData.Singletons[service][key]}</strong></div>)}
  </div>,
  Editor: ({ initialData, onClose, onSubmit }) => {
    const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
      getPropertyFields(initialData).map(({ service, key }) => [`${service}.${key}`, String(initialData[service][key])])
    ));
    const [error, setError] = useState("");
    const selectedPreset = detectDifficultyPreset(initialData, values);
    const hasPresetFields = Object.keys(getPresetValues(initialData, "easy")).length > 0;
    return <form className="container my-4" onSubmit={event => {
      event.preventDefault();
      try { onSubmit(updateProperties(initialData, values)); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }}><div className="card"><div className="card-body">
      <h1>Properties</h1>
      <div className="mb-4">
        <label htmlFor="difficulty-preset" className="form-label">Difficulty preset</label>
        <select id="difficulty-preset" className="form-select" value={selectedPreset} disabled={!hasPresetFields}
          aria-describedby="difficulty-help" onChange={event => {
            if (event.target.value === "custom") return;
            setValues(current => ({ ...current, ...getPresetValues(initialData, event.target.value as DifficultyPresetId) }));
            setError("");
          }}>
          <option value="custom" disabled>Custom</option>
          {difficultyPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
        <p id="difficulty-help" className="form-text mb-1">
          {hasPresetFields
            ? "Sets future weather rules, food and water consumption, injury chance and building refunds for the settings available in this save. Review the fields below, then Submit. Editing these fields can make the preset Custom."
            : "This legacy save has no settings supported by the Timberborn 1.1 presets."}
        </p>
        <p className="form-text">Current season duration, cycle/day, science, population and inventories are kept. Multipliers use 1 for 100%. <a href="https://timberborn.wiki.gg/wiki/Game_Mode#Settings" target="_blank" rel="noreferrer">Game preset values</a></p>
      </div>
      <div className="row">{getPropertyFields(initialData).map(field => {
        const id = `${field.service}.${field.key}`;
        return <div key={id} className="col-md-4 mb-3">
          <label htmlFor={id} className="form-label">{field.label}</label>
          <input id={id} className="form-control" type="number" required min={field.min} max={field.max} step={field.step}
            value={values[id]} onChange={event => setValues({ ...values, [id]: event.target.value })} />
        </div>;
      })}</div>
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      <div className="d-flex"><button className="btn btn-primary">Submit</button>
        <button type="button" className="btn btn-light ms-auto" onClick={onClose}>Discard changes</button></div>
    </div></div></form>;
  },
};
