import { useEffect, useState } from "react";
import type { DemoSave } from "../DemoSave";
import type { IEditorPlugin } from "../IEditorPlugin";
import { exportSave } from "../SaveFile";

export const DownloadPlugin: IEditorPlugin<DemoSave, unknown> = {
  id: "DownloadPlugin", name: "Download", group: "General", position: -Infinity, enabled: true,
  read: (save) => save,
  write: () => { throw new Error("Download does not modify the save."); },
  Preview: () => <strong>Download your modified save.</strong>,
  Editor({ initialData: save, onClose }) {
    const [url, setUrl] = useState<string>();
    const [error, setError] = useState("");
    const [filename, setFilename] = useState(() => `${save.__originalFilename.replace(/\.(timber|json)$/i, "")} edited.timber`);
    useEffect(() => {
      let cancelled = false;
      let objectUrl: string | undefined;
      setUrl(undefined);
      setError("");
      exportSave(save).then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
        setUrl(objectUrl);
      }).catch((error: unknown) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      });
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [save]);
    return <div className="container my-4"><div className="card"><div className="card-body">
      <h1>Download</h1>
      <label htmlFor="filename" className="form-label">Filename</label>
      <input id="filename" className="form-control" value={filename} onChange={(event) => setFilename(event.target.value)} />
      <p className="my-3">Save this as a separate file in your Timberborn saves folder, keeping your original as a backup.</p>
      {error && <p role="alert" className="alert alert-danger">{error}</p>}
      <div className="d-flex">
        {url && filename.trim()
          ? <a className="btn btn-primary" href={url} download={/\.timber$/i.test(filename) ? filename : `${filename}.timber`}>Download</a>
          : <button className="btn btn-primary" disabled>{error ? "Export failed" : "Preparing download…"}</button>}
        <button className="btn btn-light ms-auto" onClick={onClose}>Close</button>
      </div>
    </div></div></div>;
  },
};
