import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box3, Color, InstancedMesh, Matrix4, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { UnknownEntity } from "../DemoSave";
import { buildingColors, getBuildingVisual, type BuildingVisual } from "../BuildingVisuals";
import { createBuildingGeometry, getBuildingMatrix } from "../BuildingGeometry";
import { ConstructionUtil } from "../ConstructionUtil";

interface Props {
  entities: UnknownEntity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MapObjects({ entities, selectedId, onSelect }: Props) {
  // Repeated paths, crops and structures share geometry and draw calls.
  const groups = useMemo(() => {
    const batches = new Map<string, { visual: BuildingVisual; entities: UnknownEntity[] }>();
    for (const entity of entities) {
      const visual = getBuildingVisual(entity);
      // Negative scales are not supported by InstancedMesh. Mirror the shared geometry instead.
      const key = JSON.stringify([visual, !!entity.Components.BlockObject.Flipped]);
      let batch = batches.get(key);
      if (!batch) { batch = { visual, entities: [] }; batches.set(key, batch); }
      batch.entities.push(entity);
    }
    return [...batches.entries()];
  }, [entities]);
  return <group name="map-objects">
    {groups.map(([key, batch]) => <ObjectBatch key={key} {...batch} selectedId={selectedId} onSelect={onSelect} />)}
  </group>;
}

function ObjectBatch({ entities, visual, selectedId, onSelect }: Props & { visual: BuildingVisual }) {
  const mesh = useRef<InstancedMesh>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const flipped = !!entities[0].Components.BlockObject.Flipped;
  const geometry = useMemo(() => {
    const geometry = createBuildingGeometry(visual);
    if (flipped) {
      geometry.scale(-1, 1, 1).translate(visual.size[0] - 1, 0, 0);
      // Reverse triangle winding after reflection, preserving front faces.
      if (geometry.index) {
        const index = geometry.index;
        for (let i = 0; i < index.count; i += 3) {
          const first = index.getX(i);
          index.setX(i, index.getX(i + 2)); index.setX(i + 2, first);
        }
      }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    return geometry;
  }, [visual, flipped]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    entities.forEach((entity, index) => {
      const matrix = getBuildingMatrix(entity, visual);
      if (flipped) {
        // Reflection lives in geometry; cancel it in the instance transform.
        const reflection = new Matrix4().makeTranslation(visual.size[0] - 1, 0, 0).multiply(new Matrix4().makeScale(-1, 1, 1));
        matrix.multiply(reflection);
      }
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox(); mesh.current.computeBoundingSphere();
  }, [entities, visual, flipped]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    entities.forEach((entity, index) => mesh.current!.setColorAt(index, new Color(
      entity.Id === selectedId ? "#8b5cf6" : entity.Id === hovered ? "#fff1aa" :
        !ConstructionUtil.isFinished(entity) ? "#f1b52e" : /BadwaterSource/.test(entity.Template) ? "#b4454c" : buildingColors[visual.category]
    )));
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [entities, selectedId, hovered, visual]);

  const entityAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.instanceId === undefined ? undefined : entities[event.instanceId];
  const selected = entities.find(entity => entity.Id === selectedId);
  const bounds = useMemo(() => {
    if (!selected) return null;
    // Use the same geometry and positive-scale matrix as the instances.
    const matrix = getBuildingMatrix(selected, visual);
    if (flipped) matrix.multiply(new Matrix4().makeTranslation(visual.size[0] - 1, 0, 0).multiply(new Matrix4().makeScale(-1, 1, 1)));
    const box = new Box3().copy(geometry.boundingBox!).applyMatrix4(matrix);
    return { center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()).addScalar(0.06) };
  }, [selected, visual, geometry, flipped]);
  return <>
    <instancedMesh ref={mesh} args={[geometry, undefined, entities.length]} name={`map-${visual.category}`}
      onClick={event => { const entity = entityAt(event); if (entity) { event.stopPropagation(); onSelect(entity.Id); } }}
      onPointerMove={event => { const entity = entityAt(event); if (entity) { event.stopPropagation(); setHovered(entity.Id); } }}
      onPointerOut={() => setHovered(null)}>
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
    {bounds && <mesh position={bounds.center}>
      <boxGeometry args={[bounds.size.x, bounds.size.y, bounds.size.z]} />
      <meshBasicMaterial color="#ddd0ff" wireframe />
    </mesh>}
  </>;
}
