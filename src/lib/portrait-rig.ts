import type { Mood } from "./chat";

// Each mood blends independent channels for eyelids, brows, mouth and blush.
export const pose: Record<Mood, readonly [number, number, number, number, number]> = {
  TSUNDERE: [0.12, 0.13, 0.04, 0, 0.18],
  YANDERE: [0.24, 0.31, 0.65, 0.25, 0.32],
  FLUSTERED: [-0.30, -0.21, -0.15, 0.44, 0.94],
  HAPPY: [0.46, -0.13, 0.93, 0.90, 0.56],
  ANGRY: [0.34, 0.83, -0.89, 0.54, 0.44],
  THINKING: [0.06, -0.06, -0.36, 0.24, 0.12],
};

function smooth(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function band(offset: number, inner: number, outer: number) {
  return 1 - smooth(inner, outer, Math.abs(offset));
}

function oval(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2);
}

type FacePixel = {
  x: number; y: number; lid: number; brow: number; eyeX: number; eyeY: number;
  side: number; iris: number; lip: number; lipTurn: number; blush: number; hatch: number;
};

function sampleFace(size: number, left: number, top: number, width: number, height: number) {
  const points: FacePixel[] = [];
  for (let j = 0; j < height; j++) {
    const y = (top + j) / size;
    for (let i = 0; i < width; i++) {
      const x = (left + i) / size;
      const side = x < .501 ? 1 : -1;
      const eyeCenter = side === 1 ? .437 : .565;
      const eyeX = x - eyeCenter;
      const eyeY = y - .341;
      const lip = band(x - .502, .021, .055) * band(y - .455, .011, .040);
      points.push({
        x: left + i, y: top + j, eyeX, eyeY, side, lip,
        lid: band(eyeX, .033, .064) * band(eyeY, .012, .039),
        brow: band(eyeX, .038, .066) * band(eyeY + .041, .006, .021),
        iris: oval(x, y, eyeCenter + .002, .339, .028, .020),
        lipTurn: smooth(.003, .034, Math.abs(x - .502)) * lip,
        blush: Math.max(oval(x, y, .414, .381, .044, .025), oval(x, y, .588, .381, .044, .025)),
        hatch: band(((x + y * .40) * 191) % 1 - .5, .04, .12),
      });
    }
  }
  return points;
}

function lips(ctx: CanvasRenderingContext2D, curve: number, open: number) {
  if (open < .11) return;
  const width = .025 + Math.max(0, curve) * .009;
  const cornerY = .453 - curve * .005;
  ctx.fillStyle = "#8d3653";
  ctx.beginPath();
  ctx.moveTo(.502 - width, cornerY);
  ctx.quadraticCurveTo(.502, .449 - open * .001, .502 + width, cornerY);
  ctx.quadraticCurveTo(.502, .457 + open * .020, .502 - width, cornerY);
  ctx.fill();
  ctx.fillStyle = "#e196a2";
  ctx.beginPath();
  ctx.ellipse(.502, .456 + open * .004, width * .38, .0008 + open * .003, 0, 0, Math.PI * 2);
  ctx.fill();
  if (curve > .48) {
    ctx.fillStyle = "#ffece7";
    ctx.beginPath();
    ctx.ellipse(.502, .452, width * .70, .0027, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eyewear(ctx: CanvasRenderingContext2D, lens: number) {
  if (lens < .01) return;
  ctx.globalAlpha = lens;
  ctx.lineWidth = .0056;
  ctx.strokeStyle = "#291624";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(.486, .327);
  ctx.quadraticCurveTo(.501, .316, .515, .327);
  ctx.stroke();
  for (const x of [.425, .577]) {
    ctx.strokeStyle = "#291624";
    ctx.lineWidth = .0067;
    ctx.beginPath();
    ctx.ellipse(x, .344, .064, .048, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#efd0e8";
    ctx.lineWidth = .002;
    ctx.beginPath();
    ctx.ellipse(x, .344, .063, .046, 0, 3.5, 5.1);
    ctx.stroke();
    ctx.fillStyle = "#fff4fb7a";
    ctx.beginPath();
    ctx.ellipse(x - .026, .311, .020, .005, -.36, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function makeRig(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const size = canvas.width;
  const source = document.createElement("canvas");
  source.width = source.height = size;
  const raster = source.getContext("2d");
  if (!raster) return null;
  raster.drawImage(image, 0, 0, size, size);
  const original = raster.getImageData(0, 0, size, size).data;
  const left = Math.floor(size * .345);
  const top = Math.floor(size * .279);
  const width = Math.ceil(size * .315);
  const height = Math.ceil(size * .227);
  const face = ctx.createImageData(width, height);
  const points = sampleFace(size, left, top, width, height);
  const edge = Math.floor(size * .30);
  const stripHeight = Math.ceil(size / 28);
  const cheekColor = [249, 63, 110];

  return {
    draw(channels: number[], gaze: number[], blink: number, time: number, lens: number, animate: boolean) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, edge, 0, size - edge * 2, size, edge, 0, size - edge * 2, size);
      // The side locks move as flexible strips anchored to the central portrait.
      for (let y = 0; y < size; y += stripHeight) {
        const rows = Math.min(stripHeight, size - y);
        const swing = animate ? .036 * smooth(.10, .92, y / size) : 0;
        const l = edge * (1 + Math.sin(time * 1.8 + y / size * 5) * swing);
        const r = edge * (1 + Math.sin(time * 1.8 + y / size * 5 + 1.5) * swing);
        ctx.drawImage(source, 0, y, edge, rows, edge - l, y, l, rows);
        ctx.drawImage(source, size - edge, y, edge, rows, size - edge, y, r, rows);
      }
      const [lid, brow, curve, open, blush] = channels;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const sx = point.x - gaze[0] * .008 * point.iris * size;
        const sy = point.y + size * (
          (point.eyeY * (lid + blink) * 2.9 - brow * point.side * point.eyeX * .46) * point.lid -
          (brow * point.side * point.eyeX * .42 + brow * .004) * point.brow -
          gaze[1] * .004 * point.iris -
          (point.y / size - .455) * open * .30 * point.lip + curve * .010 * point.lipTurn
        );
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const dx = sx - ix;
        const dy = sy - iy;
        const a = (iy * size + ix) * 4;
        const b = a + size * 4;
        const tone = point.blush * blush * (.37 + point.hatch * point.blush * .12);
        const offset = i * 4;
        for (let channel = 0; channel < 4; channel++) {
          const upper = original[a + channel] * (1 - dx) + original[a + channel + 4] * dx;
          const lower = original[b + channel] * (1 - dx) + original[b + channel + 4] * dx;
          const value = upper * (1 - dy) + lower * dy;
          face.data[offset + channel] = channel === 3 ? value : value * (1 - tone) + cheekColor[channel] * tone;
        }
      }
      ctx.putImageData(face, left, top);
      ctx.save();
      ctx.scale(size, size);
      lips(ctx, curve, open);
      eyewear(ctx, lens);
      ctx.restore();
    },
  };
}
