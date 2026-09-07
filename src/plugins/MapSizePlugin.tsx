import type { IEditorPlugin } from "../IEditorPlugin";

export const MapSizePlugin: IEditorPlugin<{ x: number; y: number }, unknown> = {
  id: "MapSizePlugin", name: "Map dimensions", group: "General", position: Infinity, enabled: true,
  read: save => ({ x: save.Singletons.MapSize.Size.X, y: save.Singletons.MapSize.Size.Y }),
  write: () => { throw new Error("Map resizing requires rebuilding terrain and simulation layers."); },
  Preview: ({ saveData }) => <span>{saveData.Singletons.MapSize.Size.X} × {saveData.Singletons.MapSize.Size.Y} · Read only</span>,
  Editor: ({ initialData, onClose }) => <div className="container my-4"><div className="card"><div className="card-body">
    <h1>Map dimensions</h1><p>{initialData.x} × {initialData.y}</p>
    <p>Resizing is unavailable because terrain, water, planting layers and entity positions depend on these dimensions.</p>
    <button className="btn btn-light" onClick={onClose}>Close</button>
  </div></div></div>,
};
