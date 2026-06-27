export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorGeom {
  connector: string;
  geometry: Rect;
}

export interface Placed {
  connector: string;
  rect: Rect;
}

export interface Arrangement {
  scale: number;
  contentH: number; // scaled height of the arrangement; the view shrinks to this
  tiles: Placed[];
}

/**
 * Map real monitor geometries into an areaW x areaH box: translate so the
 * bounding box starts at origin, scale uniformly to fit, center horizontally,
 * and top-align vertically (the view is sized to `contentH`, so there is no
 * vertical slack to center within).
 */
export function computeArrangement(monitors: MonitorGeom[], areaW: number, areaH: number): Arrangement {
  if (monitors.length === 0) return { scale: 1, contentH: 0, tiles: [] };

  const minX = Math.min(...monitors.map((m) => m.geometry.x));
  const minY = Math.min(...monitors.map((m) => m.geometry.y));
  const maxX = Math.max(...monitors.map((m) => m.geometry.x + m.geometry.width));
  const maxY = Math.max(...monitors.map((m) => m.geometry.y + m.geometry.height));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  const scale = Math.min(areaW / bboxW, areaH / bboxH);
  const offsetX = (areaW - bboxW * scale) / 2;
  const contentH = bboxH * scale;

  const tiles = monitors.map((m) => ({
    connector: m.connector,
    rect: {
      x: offsetX + (m.geometry.x - minX) * scale,
      y: (m.geometry.y - minY) * scale,
      width: m.geometry.width * scale,
      height: m.geometry.height * scale,
    },
  }));

  return { scale, contentH, tiles };
}
