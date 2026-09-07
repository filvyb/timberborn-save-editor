import { lazy, Suspense, useMemo } from "react";
import type { IEditorPlugin } from "../IEditorPlugin";
import type { DemoSave } from "../DemoSave";

const Editor = lazy(async () => {
  const { MapPlugin } = await import("./MapPlugin");
  return { default: function MapEditor(props: { initialData: DemoSave; onSubmit: (data: DemoSave) => void; onClose: () => void }) {
    const state = useMemo(() => MapPlugin.read(props.initialData), [props.initialData]);
    return <MapPlugin.Editor initialData={state} onClose={props.onClose}
      onSubmit={data => props.onSubmit(MapPlugin.write(props.initialData, data))} />;
  } };
});
export const MapPlugin: IEditorPlugin<DemoSave, DemoSave> = {
  id: "MapPlugin", name: "Map", group: "General", position: 2, enabled: true,
  read: save => save, write: (_save, data) => data,
  Preview: () => <span>Interactive 3D terrain, water, trees, paths, storage and beavers.</span>,
  Editor: props => <Suspense fallback={<p className="container my-4" role="status">Loading 3D map…</p>}><Editor {...props} /></Suspense>,
};
