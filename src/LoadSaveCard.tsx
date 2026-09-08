import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { DemoSave } from "./DemoSave";
import { loadSave, parseSave } from "./SaveFile";

export function LoadSaveCard({ onSaveLoaded }: { onSaveLoaded: (save: DemoSave) => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const busy = useRef(false);

  async function onInput(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await openFile(file);
  }

  async function openFile(file: File) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setLoading(true);
    try {
      onSaveLoaded(await loadSave(new Uint8Array(await file.arrayBuffer()), file.name));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (!busy.current) setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy.current ? "none" : "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy.current) return;
    const files = event.dataTransfer.files;
    if (files.length === 0) return;
    if (files.length !== 1) {
      setError("Drop one save file at a time.");
      return;
    }
    void openFile(files[0]);
  }

  async function loadExample(kind: "iron-teeth" | "lets-play") {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setLoading(true);
    try {
      const url = kind === "iron-teeth"
        ? new URL("./examples/iron-teeth-plains-1-1.json", import.meta.url)
        : new URL("./examples/lets-play-plains.json", import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not load the example save.");
      onSaveLoaded(parseSave(await response.text(), `${kind}-legacy.json`));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return <main className="container my-5" style={{ maxWidth: 760 }}>
    <div className="card shadow-sm"><div className="card-body p-4">
      <span className="badge text-bg-success mb-3">Timberborn 1.1 support</span>
      <h1>Timberborn Save Editor</h1>
      <p>Edit science, weather, inventories, construction and beavers. Saves stay in your browser.</p>
      <div className={`save-drop-zone p-4 rounded ${dragging ? "is-dragging" : ""}`}
        role="region" aria-label="Drop a save file" aria-busy={loading}
        onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <p id="save-drop-hint" className="mb-3">{dragging ? "Drop your save here" : "Drag and drop a .timber or .json save here, or choose a file below."}</p>
        <label htmlFor="save-file" className="form-label">Open a save file</label>
        <input id="save-file" type="file" accept=".json,.timber" aria-describedby="save-drop-hint" onChange={onInput} disabled={loading} className="form-control" />
      </div>
      {loading && <p role="status" className="mt-2">Loading save…</p>}
      {error && <p role="alert" className="alert alert-danger mt-3">{error}</p>}
      <p className="form-text">Windows save folder: <code>%USERPROFILE%\Documents\Timberborn\Saves\</code></p>
      <p className="form-text">Keep the original save as a backup. Download edits as a separate .timber file.</p>
      <hr />
      <p className="mb-1">Try a legacy example</p>
      <button disabled={loading} className="btn btn-link" onClick={() => loadExample("iron-teeth")}>Iron Teeth · Plains</button>
      <button disabled={loading} className="btn btn-link" onClick={() => loadExample("lets-play")}>Folktails · Plains</button>
    </div></div>
    <p className="text-muted small mt-3">Unofficial editor, originally by Charper Bonaroo BV. Forked by Filip Vybihal. <a href="https://github.com/filvyb/timberborn-save-editor">Source code</a></p>
  </main>;
}
