import { BeaverAdultEntity, DemoSave, UnknownEntity } from "../DemoSave";
import { IEditorPlugin } from "../IEditorPlugin";
import { Canvas, useThree } from '@react-three/fiber'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { get, set, uniq } from "lodash";
import { MapControls } from "@react-three/drei";
import './MapPlugin.scss';
import { Navbar } from "../Navbar";
import { BufferGeometry, ConeGeometry, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { readMapData, type MapData } from "../MapData";
import { createTerrainGeometry } from "../TerrainGeometry";
import { BeaverUtil } from "../BeaverUtil";
import { deepCopy } from "../deepCopy";
import { StockpileUtil } from "../StockpileUtil";
import { getMapEntityKind, readEntityData, writeEntityData, type EntityData, type MapEntityKind } from "../MapEntities";
import { buildingColors, getBuildingVisual, isStockpile } from "../BuildingVisuals";
import { ConstructionUtil } from "../ConstructionUtil";
import { MapObjects } from "./MapObjects";

import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";


interface State {
  saveData: DemoSave;
  mapData: MapData;
  entityData: EntityData;
}

interface MutableState extends State {
  setEntity: (entity: UnknownEntity) => void;
  selectEntityId: (id: string | null) => void;
  selectedEntity: UnknownEntity | null;
}

function useEntitiesOfKind(entityData: EntityData, kind: MapEntityKind) {
  return useMemo(() => Object.values(entityData.entitiesByIds).filter(entity => getMapEntityKind(entity) === kind), [entityData, kind]);
}

export const MapPlugin: IEditorPlugin<State, State> = {
  id: "MapPlugin",
  name: "Map",
  position: 2,
  group: "General",
  enabled: true,

  read: (saveData) => ({
    mapData: readMapData(saveData),
    entityData: readEntityData(saveData),
    saveData
  }),

  write: (saveData, state) => writeEntityData(saveData, state.entityData),

  Preview: ({ saveData }) => <div>
    An interactive 3D Map that will take a while to load.
  </div>,

  Editor: ({ initialData, onSubmit, onClose }) => {
    const [state, setState] = useState(initialData);
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
    const selectedEntity = (selectedEntityId && state.entityData.entitiesByIds[selectedEntityId]) || null;
    const { mapSizeX, mapSizeY } = state.mapData;
    const objects = useEntitiesOfKind(state.entityData, "object");

    const setEntity = (entity: UnknownEntity) => {
      const oldEntity: UnknownEntity | undefined = state.entityData.entitiesByIds[entity.Id];
      const newState = {
        ...state,
        entityData: {
          ...state.entityData,
          updateIds: uniq(state.entityData.updateIds.concat([entity.Id])),
          entitiesByIds: {
            ...state.entityData.entitiesByIds,
            [entity.Id]: entity,
          },
        }
      }

      if (!oldEntity || oldEntity.Template !== entity.Template) {
        const byTemplate = { ...newState.entityData.entitiesIdsByTemplate };
        if (oldEntity) byTemplate[oldEntity.Template] = (byTemplate[oldEntity.Template] ?? []).filter(id => id !== oldEntity.Id);
        byTemplate[entity.Template] = [...(byTemplate[entity.Template] ?? []), entity.Id];
        newState.entityData.entitiesIdsByTemplate = byTemplate;
      }

      setState(newState);
    }

    const selectEntityId = useCallback((id: string | null) => {
      setSelectedEntityId(id);
    }, [])

    return <div className="Map__Editor">
      <Navbar onHome={onClose} />
      <Gui {...state} onSubmit={onSubmit} onClose={onClose} selectEntityId={selectEntityId} selectedEntity={selectedEntity} setEntity={setEntity} />

      <Canvas className="Map__Canvas" camera={{ position: [32, 64, -64] }}>
        <axesHelper position={[0, 8, 0]} scale={[4, 4, 4]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 30, 10]} intensity={2} />
        <group scale={[1, 1, -1]}>
          <group position={[mapSizeX / -2, 0, mapSizeY / -2]}>
            <SlowBoxesHeightMap {...state} />
            <SlowBoxesWaterMap {...state} />
            <TreesMap {...state} />
            <MapObjects entities={objects} selectedId={selectedEntityId} onSelect={selectEntityId} />
            <BeaversMap {...state} selectEntityId={selectEntityId} selectedEntity={selectedEntity} setEntity={setEntity} />
          </group>
        </group>
        <SceneControls selectedEntity={selectedEntity} mapData={state.mapData} />
      </Canvas>
    </div>;
  }
}

interface GuiProps extends MutableState {
  onSubmit: (state: State) => void;
  onClose: () => void;
}

function Gui(state: GuiProps) {
  const [query, setQuery] = useState("");
  const objects = useEntitiesOfKind(state.entityData, "object");
  const matches = useMemo(() => query.trim() ? objects.filter(entity =>
    `${entity.Template} ${entity.Components.NamedEntity?.EntityName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  ).slice(0, 8) : [], [objects, query]);
  if (!state.selectedEntity) {
    return <div className="Map__Gui">
      <div className="Map__Gui__Right p-4">
        <div className="card">
          <div className="card-body">
            <h4 className="card-title">Map Editor</h4>
            <p>Click a building to inspect it, or a storage or beaver to edit. Drag to pan, right-drag to rotate, and scroll to zoom.</p>
            <p className="small text-muted">Buildings use simplified shapes and approximate footprints. Unknown types appear as pink blocks; yellow marks construction.</p>
            <div className="d-flex flex-wrap gap-2 small mb-3" aria-label="Building colors">
              {Object.entries(buildingColors).filter(([category]) => !["Plants", "Natural resources", "Other"].includes(category)).map(([category, color]) =>
                <span key={category}><span style={{ color }}>■</span> {category}</span>)}
            </div>
            <label htmlFor="find-building" className="form-label small">Find building</label>
            <input id="find-building" type="search" className="form-control form-control-sm mb-2" placeholder="e.g. Lodge, Floodgate, WindTurbine" value={query} onChange={event => setQuery(event.target.value)} />
            {query.trim() && <div className="list-group mb-3">
              {matches.length === 0 && <span className="small text-muted">No matching objects.</span>}
              {matches.map(entity => {
                const { X, Y, Z } = entity.Components.BlockObject.Coordinates;
                return <button key={entity.Id} className="list-group-item list-group-item-action py-1 small" onClick={() => state.selectEntityId(entity.Id)}>{entity.Template} ({X}, {Y}, {Z})</button>;
              })}
            </div>}
            <button className="btn btn-primary btn-sm" onClick={() => state.onSubmit(state)}>Save</button>
            {" "}
            <button className="btn btn-light btn-sm" onClick={() => state.onClose()}>Discard changes</button>
          </div>
        </div>
      </div>
    </div>;
  }

  return <div className="Map__Gui">
    <div className="Map__Gui__Right p-4">
      <div className="card">
        <div className="card-body">
          <h4 className="card-title">{state.selectedEntity.Template}</h4>
          {state.selectedEntity.Components.NamedEntity?.EntityName && <p>{state.selectedEntity.Components.NamedEntity.EntityName}</p>}
          {state.selectedEntity.Components.BlockObject && <>
            <p className="small">{getBuildingVisual(state.selectedEntity).category} · {ConstructionUtil.isFinished(state.selectedEntity) ? "Built" : "Under construction"}</p>
            <p className="small">Coordinates: {Object.entries(state.selectedEntity.Components.BlockObject.Coordinates).map(([axis, value]) => `${axis}: ${value}`).join(" · ")}</p>
            {getBuildingVisual(state.selectedEntity).fallback && <p className="small text-muted">No model is defined for this template. A block marks its saved position.</p>}
          </>}
          {isStockpile(state.selectedEntity) && ConstructionUtil.isFinished(state.selectedEntity)
            ? <StockpileForm key={state.selectedEntity.Id} {...state} />
            : getMapEntityKind(state.selectedEntity) === "character" && /^Beaver/.test(state.selectedEntity.Template)
              ? <BeaverForm key={state.selectedEntity.Id} {...state} />
              : <button className="btn btn-light btn-sm" onClick={() => state.selectEntityId(null)}>Close inspection</button>}
        </div>
      </div>
    </div>
  </div>;
}

function BeaverForm({ selectedEntity, selectEntityId, setEntity }: MutableState) {
  const [beaver, setBeaver] = useState<BeaverAdultEntity>(selectedEntity!);

  const getValue = (path: (string | number)[]) => get(beaver, path);
  const setValue = (path: (string | number)[], format: (val: string) => any = (x) => x) => (event: FormEvent) => setBeaver(set(deepCopy(beaver), path, format((event.target as any).value)))

  return <form onSubmit={(e) => { e.preventDefault(); setEntity(beaver); selectEntityId(null); }}>
    <div className="mb-1 row">
      <label htmlFor="name" className="col-sm-4 col-form-label p-1">Name</label>
      <div className="col-sm-8">
        <input type="text" id="name" className="form-control p-1" value={BeaverUtil.getName(beaver)} onChange={event => { const copy = deepCopy(beaver); BeaverUtil.setName(copy, event.target.value); setBeaver(copy); }} />
      </div>
    </div>

    {(beaver.Components.NeedManager?.Needs ?? []).map((need: { Name: string; Points: number }, index: number) => <div className="mb-1 row" key={index}>
      <label htmlFor={"need-" + index} className="col-sm-4 col-form-label px-1 py-0">{need.Name}</label>
      <div className="col-sm-8">
        <input type="range" min="0" max="1" step="0.001" id={"need-" + index} className="form-control p-1"
          value={getValue(["Components", "NeedManager", "Needs", index, "Points"])}
          onChange={setValue(["Components", "NeedManager", "Needs", index, "Points"], (val) => parseFloat(val))} />
      </div>
    </div>)}

    <div className="mt-2 row">
      <div className="col-sm-8 offset-sm-4">
        <button type="submit" className="btn btn-secondary btn-sm">OK</button>
        {" "}
        <button type="button" onClick={() => selectEntityId(null)} className="btn btn-light btn-sm">Discard</button>
      </div>
    </div>
  </form>
}

function BeaversMap({ entityData, selectEntityId, selectedEntity }: MutableState) {
  const beavers = useEntitiesOfKind(entityData, "character")

  return <group>
    {beavers.map((beaver) => <Beaver selected={selectedEntity === beaver} key={beaver.Id}
      beaver={beaver} selectEntityId={selectEntityId} />)}
  </group>;
}

function Beaver({ beaver, selectEntityId, selected }: { selected: boolean, beaver: UnknownEntity, selectEntityId: (id: string) => void }) {
  const [isHover, setIsHover] = useState(false);

  const onClick = (event: { stopPropagation: () => void }) => { event.stopPropagation(); selectEntityId(beaver.Id); }
  const onPointerEnter = () => { setIsHover(true); }
  const onPointerLeave = () => { setIsHover(false); }

  const pos = BeaverUtil.character(beaver).Position;
  const isAdult = beaver.Template === "BeaverAdult";
  const x: number = pos.X - 0.5;
  const y: number = pos.Y + 0.1 + (isAdult ? 0.5 : 0.3);
  const z: number = pos.Z - 0.5;
  return <mesh onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onClick={onClick} key={beaver.Id} position={[x, y, z]}>
    <meshStandardMaterial color={selected ? "#651FFF" : (isHover ? "#FF8A65" : "#E64A19")} />
    <cylinderGeometry args={[
      (isHover || selected) ? 0.4 : 0.2,
      (isHover || selected) ? 0.4 : 0.2,
      (beaver.Template === "BeaverAdult" ? 1.0 : 0.6) * (isHover || selected ? 1.2 : 1.0),
      8.0,
      1.0,
    ]} />
  </mesh>;
}

function StockpileForm({ selectedEntity, selectEntityId, setEntity }: MutableState) {
  const goodIds: string[] = useMemo(() => selectedEntity ? StockpileUtil.getAllowedGoods(selectedEntity) : [], [selectedEntity]);
  const [countGoods, setCountGoods] = useState<Record<string, number>>(() => StockpileUtil.countGoods(selectedEntity!, {}));
  const capacity = StockpileUtil.getCapacity(selectedEntity!);
  const [error, setError] = useState("");
  const totalCounts = Object.values(countGoods).reduce((a, b) => a + b, 0);

  const doSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    const newEntity = deepCopy(selectedEntity!);
    try { setEntity(StockpileUtil.setGoods(newEntity, countGoods)); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return; }
    selectEntityId(null);
  }, [countGoods, selectEntityId, setEntity, selectedEntity]);

  return <form onSubmit={doSubmit}>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {goodIds.map((goodId) => <div className="mb-1 row" key={goodId}>
      <label htmlFor={"good-" + goodId} className="col-sm-4 col-form-label col-form-label-sm">{goodId}</label>
      <div className="col-sm-8">
        <input type="number" min={0} step={1} required id={"good-" + goodId} className="form-control form-control-sm" value={countGoods[goodId] || 0}
          onChange={(event) => setCountGoods({ ...countGoods, [goodId]: event.target.valueAsNumber || 0 })} />
      </div>
    </div>)}

    <div className="mt-2 row">
      <div className="col-sm-8 offset-sm-4">
        {capacity !== undefined && totalCounts > capacity
          ? <div className="text-danger p-1">Warning: <strong>{totalCounts}</strong> storage exceeds capacity of <strong>{capacity}</strong>!</div>
          : <div className="p-1"><strong>{totalCounts}</strong> / <strong>{capacity ?? "unknown capacity"}</strong></div>}

        <button type="submit" className="btn btn-secondary btn-sm">OK</button>
        {" "}
        <button type="button" onClick={() => selectEntityId(null)} className="btn btn-light btn-sm">Discard</button>
      </div>
    </div>
  </form>
}

function createTreeGeom({ dry, dead, adult, x, y, z }: {
  entity: any;
  dry: boolean;
  dead: boolean;
  adult: boolean;
  x: number;
  z: number;
  y: number;
}) {
  return new ConeGeometry((adult ? 0.4 : 0.2) * (dead ? 0.5 : 1.0), adult ? 2.0 : 0.5, 4.0, 4.0)
    .translate(x, y + 0.5, z)
}

function meshWithColorFromGeoms(geometries: any[], color: string, opacity: number = 1.0) {
  if (geometries.length === 0) {
    return new Mesh();
  }
  const geom = BufferGeometryUtils.mergeGeometries(geometries)!;
  geometries.forEach(geometry => geometry.dispose());
  const mat = new MeshStandardMaterial({ color, opacity, transparent: opacity <= 0.99 });
  return new Mesh(geom, mat);
}

function TreesMap({ entityData }: State) {
  const treeEntities = useEntitiesOfKind(entityData, "tree");

  const { greenTrees, brownTrees } = useMemo(() => {
    const trees = treeEntities.map((_: any) => ({
      entity: _,
      dry: (_.Components.WateredNaturalResource?.DryingProgress ?? _.Components.WateredNaturalResource?.DyingProgress ?? 0) > 0.9999,
      dead: _.Components.LivingNaturalResource?.IsDead ?? false,
      adult: (_.Components.Growable?.GrowthProgress ?? 1) > 0.9999,
      x: _.Components.BlockObject.Coordinates.X as number,
      z: _.Components.BlockObject.Coordinates.Y as number,
      y: _.Components.BlockObject.Coordinates.Z as number,
    }));

    const greenTrees = meshWithColorFromGeoms(
      trees.filter(_ => !(_.dry || _.dead)).map(createTreeGeom), "#388E3C");
    const brownTrees = meshWithColorFromGeoms(
      trees.filter(_ => _.dry || _.dead).map(createTreeGeom), "#5D4037");

    return { greenTrees, brownTrees }
  }, [treeEntities]);

  useEffect(() => () => { disposeMesh(greenTrees); disposeMesh(brownTrees); }, [greenTrees, brownTrees]);
  return <group>
    <primitive object={greenTrees} />
    <primitive object={brownTrees} />
  </group>;
}

function SlowBoxesWaterMap({ mapData }: State) {
  const mesh = useMemo(() => {
    const clean: BufferGeometry[] = [];
    const bad: BufferGeometry[] = [];
    for (const surface of mapData.waterSurfaces) {
      (surface.contamination > 0.5 ? bad : clean).push(new PlaneGeometry(1, 1)
        .rotateX(-Math.PI / 2).translate(surface.x, surface.height + 0.01, surface.y));
    }
    return [meshWithColorFromGeoms(clean, "#287cb5", 0.75), meshWithColorFromGeoms(bad, "#a33e42", 0.8)];
  }, [mapData]);
  useEffect(() => () => mesh.forEach(disposeMesh), [mesh]);
  return <group>{mesh.map((object, index) => <primitive key={index} object={object} />)}</group>;
}

function SlowBoxesHeightMap({ mapData }: State) {
  const geometry = useMemo(() => createTerrainGeometry(mapData), [mapData]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} onClick={event => event.stopPropagation()}><meshStandardMaterial vertexColors /></mesh>;
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(material => material.dispose());
}

function SceneControls({ selectedEntity, mapData }: { selectedEntity: UnknownEntity | null; mapData: MapData }) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const { camera } = useThree();
  useEffect(() => {
    const coordinates = selectedEntity?.Components.BlockObject?.Coordinates;
    if (!coordinates || !controls.current) return;
    const x = coordinates.X - mapData.mapSizeX / 2;
    const y = coordinates.Z + 1;
    const z = mapData.mapSizeY / 2 - coordinates.Y;
    controls.current.target.set(x, y, z);
    camera.position.set(x + 12, y + 16, z - 12);
    controls.current.update();
  }, [selectedEntity?.Id, mapData, camera]);
  return <MapControls ref={controls} />;
}
