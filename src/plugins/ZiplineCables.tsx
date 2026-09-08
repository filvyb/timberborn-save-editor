import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Color, DoubleSide } from "three";
import type { UnknownEntity } from "../DemoSave";
import { getZiplineCablePoints, getZiplineConnections } from "../Ziplines";

export function ZiplineCables({ entities, selectedId }: { entities: UnknownEntity[]; selectedId: string | null }) {
  const connections = useMemo(() => getZiplineConnections(entities), [entities]);
  const points = useMemo(() => connections.flatMap(getZiplineCablePoints), [connections]);
  const colors = useMemo(() => connections.flatMap(connection => {
    const color = new Color(connection.sourceId === selectedId || connection.targetId === selectedId ? "#8b5cf6" :
      connection.underConstruction ? "#f1b52e" : "#493b2b");
    return [color, color, color, color];
  }), [connections, selectedId]);
  if (!points.length) return null;
  return <Line name="zipline-cables" segments points={points} vertexColors={colors} lineWidth={1.5}
    // The map reflects Z; screen-space line quads must remain visible after that reflection.
    side={DoubleSide} toneMapped={false} raycast={() => {}} />;
}
