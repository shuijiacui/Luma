// Single collision and placement implementation for server and canvas.
import {sampleProposalGeometry} from './niloGeometry.mjs'
import {contactProjectionFits,validateContact} from './niloContact.mjs'
function occupancySize(occupancy) {
  const n = Math.sqrt(occupancy.length);
  return Number.isInteger(n) && n >= 8 && occupancy.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? n : null;
}
function brushMargins(p, n, surfaceSize) {
  const tipScale = { round: 1, pencil: 0.4, marker: 1.8, crayon: 1, star: 2.5 }[p.brushKind ?? "round"];
  const radius = p.strokeWidth * tipScale / 2 + 1;
  return {
    x: surfaceSize && Number.isFinite(surfaceSize.width) && surfaceSize.width > 0 ? Math.max(0.35 / n, radius / surfaceSize.width) : 0.35 / n,
    y: surfaceSize && Number.isFinite(surfaceSize.height) && surfaceSize.height > 0 ? Math.max(0.35 / n, radius / surfaceSize.height) : 0.35 / n
  };
}
function proposalFootprint(p, n, aspect, surfaceSize) {
  let strokes;
  try { strokes = sampleProposalGeometry(p, aspect); } catch { return null; }
  if (!strokes.length) return null;
  const { x: marginX, y: marginY } = brushMargins(p, n, surfaceSize);
  const cells = /* @__PURE__ */ new Set();
  for (const stroke of strokes) {
    const samples = stroke.points.flatMap((point, index) => {
      if (!index) return [point];
      const prev = stroke.points[index - 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(point.x - prev.x), Math.abs(point.y - prev.y)) * n * 3));
      return Array.from({ length: steps }, (_, i) => ({ x: prev.x + (point.x - prev.x) * (i + 1) / steps, y: prev.y + (point.y - prev.y) * (i + 1) / steps }));
    });
    for (const { x, y } of samples) {
      if (x < Math.max(0.015, marginX) || x > 1 - Math.max(0.015, marginX) || y < Math.max(0.015, marginY) || y > 1 - Math.max(0.015, marginY)) return null;
      for (let col = Math.max(0, Math.floor((x - marginX) * n)); col <= Math.min(n - 1, Math.floor((x + marginX) * n)); col++) {
        for (let row = Math.max(0, Math.floor((y - marginY) * n)); row <= Math.min(n - 1, Math.floor((y + marginY) * n)); row++) {
          cells.add(row * n + col);
        }
      }
    }
  }
  return cells;
}
function projectionFits(p, occupancy, aspect = 1, surfaceSize, pixels) {
  const n = occupancySize(occupancy);
  if (!n) return false;
  const cells = proposalFootprint(p, n, aspect, surfaceSize);
  if (!cells) return false;
  if (p.placementPolicy === 'free' && p.contribution === 'object' && !p.attachment && !p.contact) return true;
  if (p.contact !== undefined) return contactProjectionFits(p, occupancy, aspect, surfaceSize, cells, brushMargins(p, n, surfaceSize), pixels);
  if (!p.attachment) return [...cells].every((cell) => occupancy[cell] <= 0.025);
  const start = sampleProposalGeometry(p, aspect)[0]?.points[0];
  if (!start || Math.hypot(start.x - p.attachment.x, start.y - p.attachment.y) > 1e-4) return false;
  const margin = brushMargins(p, n, surfaceSize);
  const atJoin = (cell) => Math.abs((cell % n + 0.5) / n - p.attachment.x) <= margin.x + 2 / n && Math.abs((Math.floor(cell / n) + 0.5) / n - p.attachment.y) <= margin.y + 2 / n;
  if (![...cells].some((cell) => occupancy[cell] > 0.025 && atJoin(cell))) return false;
  return [...cells].every((cell) => occupancy[cell] <= 0.025 || atJoin(cell));
}
function placementFits(p, aspect, surfaceSize) {
  if (p.contact !== undefined) return !!p.anchor && !p.attachment && p.template === 'custom' && p.rotation === 0 && !!validateContact(p.contact, p.anchor, aspect);
  if (p.contribution === "object") return !p.attachment && !p.contact;
  if (!p.anchor || !p.placement) return true;
  if (p.attachment) return true;
  const points = sampleProposalGeometry(p, aspect).flatMap((stroke) => stroke.points);
  if (!points.length) return false;
  const margin = brushMargins(p, 64, surfaceSize);
  const left = Math.min(...points.map((point) => point.x)) - margin.x;
  const right = Math.max(...points.map((point) => point.x)) + margin.x;
  const top = Math.min(...points.map((point) => point.y)) - margin.y;
  const bottom = Math.max(...points.map((point) => point.y)) + margin.y;
  const a = p.anchor;
  const horizontalNear = right >= a.x - 0.12 / aspect && left <= a.x + a.width + 0.12 / aspect;
  const verticalNear = bottom >= a.y - 0.12 && top <= a.y + a.height + 0.12;
  switch (p.placement) {
    case "above":
      return bottom <= a.y + 1e-9 && horizontalNear;
    case "below":
      return top >= a.y + a.height - 1e-9 && horizontalNear;
    case "left":
      return right <= a.x + 1e-9 && verticalNear;
    case "right":
      return left >= a.x + a.width - 1e-9 && verticalNear;
    case "inside":
      return left >= a.x && right <= a.x + a.width && top >= a.y && bottom <= a.y + a.height;
    case "near": {
      const dx = Math.max(a.x - right, left - (a.x + a.width), 0) * aspect;
      const dy = Math.max(a.y - bottom, top - (a.y + a.height), 0);
      return Math.hypot(dx, dy) <= Math.max(0.08, Math.max(a.width * aspect, a.height) * 0.65);
    }
  }
}
export {
  brushMargins,
  occupancySize,
  placementFits,
  projectionFits,
  proposalFootprint
};
