// Polyline math for redline paths (map + sheet surfaces).

export type Pt = [number, number];

export function segmentLengths(points: Pt[]): number[] {
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    lengths.push(Math.hypot(dx, dy));
  }
  return lengths;
}

export function pathLength(points: Pt[]): number {
  return segmentLengths(points).reduce((a, b) => a + b, 0);
}

/** Point at fraction t (0–1) along a polyline. */
export function pointAtProgress(points: Pt[], t: number): Pt {
  if (points.length === 0) return [0, 0];
  if (points.length === 1 || t <= 0) return points[0];
  const clamped = Math.min(1, t);
  const lengths = segmentLengths(points);
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = clamped * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : remaining / lengths[i];
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
    }
    remaining -= lengths[i];
  }
  return points[points.length - 1];
}

export function toPolyline(points: Pt[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Midpoint of the polyline, for labels. */
export function midpoint(points: Pt[]): Pt {
  return pointAtProgress(points, 0.5);
}
