import { useState } from "react";
import type { DemoSave } from "../DemoSave";
import type { IEditorPlugin } from "../IEditorPlugin";
import { getResearchKey, getResearchOptions, getUnlockedResearch, updateResearch } from "../ResearchUtil";

export const ResearchPlugin: IEditorPlugin<DemoSave, string[]> = {
  id: "ResearchPlugin", name: "Research", group: "General", position: 1,
  enabled: ({ saveData }) => getResearchKey(saveData) !== undefined,
  read: save => save,
  write: updateResearch,
  Preview: ({ saveData }) => <div>{getUnlockedResearch(saveData).length} building research unlocks. Unlock or lock buildings.</div>,
  Editor: ({ initialData, onClose, onSubmit }) => {
    const [unlocked, setUnlocked] = useState(() => getUnlockedResearch(initialData));
    const [options, setOptions] = useState(() => getResearchOptions(initialData));
    const [search, setSearch] = useState("");
    const [customId, setCustomId] = useState("");
    const [error, setError] = useState("");
    const visible = options.filter(id => id.toLowerCase().includes(search.trim().toLowerCase()));
    const selected = new Set(unlocked);
    const toggle = (ids: string[], checked: boolean) => setUnlocked(current => checked
      ? [...current, ...ids.filter(id => !current.includes(id))]
      : current.filter(id => !ids.includes(id)));
    return <form className="container my-4" onSubmit={event => {
      event.preventDefault();
      onSubmit(unlocked);
    }}><div className="card"><div className="card-body">
      <h1>Research</h1>
      <p>Check a building to unlock its research; uncheck it to lock it. Submit to apply your changes.
        Science points and existing buildings are kept. Buildings available from the start are unaffected.</p>
      <p className="form-text">The list includes saved unlocks and known research for this save’s faction and format.
        It may be incomplete. Add a building by its exact ID if it is missing. Bot workplace unlocks are separate from building research.</p>
      <label htmlFor="research-search" className="form-label">Search research</label>
      <input id="research-search" type="search" className="form-control mb-3" value={search}
        onChange={event => setSearch(event.target.value)} />
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <button type="button" className="btn btn-outline-primary" disabled={!visible.length}
          onClick={() => toggle(visible, true)}>Unlock all shown</button>
        <button type="button" className="btn btn-outline-secondary" disabled={!visible.length}
          onClick={() => toggle(visible, false)}>Lock all shown</button>
        <span aria-live="polite">{selected.size} unlocked · {visible.length} shown</span>
      </div>
      <div className="row mb-3">{visible.map(id => <div className="col-md-6 col-xl-4 mb-2" key={id}>
        <label className="d-flex gap-2 align-items-start">
          <input type="checkbox" className="form-check-input flex-shrink-0" checked={selected.has(id)}
            onChange={event => toggle([id], event.target.checked)} />
          <span className="text-break">{id}</span>
        </label>
      </div>)}</div>
      {!visible.length && <p>No research matches. You can add a building ID below.</p>}
      <label htmlFor="research-id" className="form-label">Building ID</label>
      <div className="input-group mb-2">
        <input id="research-id" className="form-control" value={customId} placeholder="e.g. Forester.Folktails"
          aria-describedby="research-id-help" onChange={event => { setCustomId(event.target.value); setError(""); }} />
        <button type="button" className="btn btn-outline-primary" onClick={() => {
          const id = customId.trim();
          if (!id || /\s/.test(id)) { setError("Enter an exact building ID without spaces."); return; }
          setOptions(current => current.includes(id) ? current : [...current, id].sort());
          toggle([id], true);
          setSearch(""); setCustomId(""); setError("");
        }}>Add and unlock</button>
      </div>
      <p id="research-id-help" className="form-text">Use an ID supported by your game version and faction, including the faction suffix when present. Mod building IDs are supported.</p>
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      <div className="d-flex mt-4"><button className="btn btn-primary">Submit</button>
        <button type="button" className="btn btn-light ms-auto" onClick={onClose}>Discard changes</button></div>
    </div></div></form>;
  },
};
