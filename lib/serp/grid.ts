// Builds the square scan grid of coordinates around a centre point.
// Pure + dependency-free so it can run anywhere (server actions use it).

export type GridPoint = { lat: number; lng: number };

export const MAX_GRID_SIZE = 7;

/**
 * Square grid of `gridSize`×`gridSize` points centred on (centerLat,centerLng),
 * spanning `radiusKm` from centre to edge. gridSize is capped at 7.
 *
 *   stepKm    = radiusKm / ((gridSize-1)/2)
 *   latOffset = stepKm / 111
 *   lngOffset = stepKm / (111 * cos(centerLat))
 *
 * Returned row-major, north→south rows (row 0 = top/north) and west→east cols
 * (col 0 = left/west), so the array maps straight onto a north-up heatmap.
 */
export function generateGrid(
  centerLat: number,
  centerLng: number,
  gridSize: number,
  radiusKm: number,
): GridPoint[] {
  const size = Math.min(Math.max(Math.trunc(gridSize) || 1, 1), MAX_GRID_SIZE);
  const half = (size - 1) / 2;
  if (half === 0) return [{ lat: centerLat, lng: centerLng }];

  const stepKm = radiusKm / half;
  const latOffset = stepKm / 111;
  const cos = Math.cos((centerLat * Math.PI) / 180);
  const lngOffset = stepKm / (111 * (Math.abs(cos) < 1e-6 ? 1e-6 : cos));

  const points: GridPoint[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      points.push({
        lat: centerLat + (half - row) * latOffset, // row 0 = north
        lng: centerLng + (col - half) * lngOffset, // col 0 = west
      });
    }
  }
  return points;
}
