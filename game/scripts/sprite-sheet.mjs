import sharp from "sharp";
export async function extractSheet(file, columns, rows, alphaThreshold = 24) {
  const meta = await sharp(file).metadata(),
    result = [];
  for (let n = 0; n < columns * rows; n++) {
    const left = Math.round(((n % columns) * meta.width) / columns),
      top = Math.round((Math.floor(n / columns) * meta.height) / rows);
    const width =
        Math.round((((n % columns) + 1) * meta.width) / columns) - left,
      height =
        Math.round(((Math.floor(n / columns) + 1) * meta.height) / rows) - top;
    const { data, info } = await sharp(file)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Retain the principal connected silhouette, removing isolated generation speckles.
    const size = info.width * info.height,
      seen = new Uint8Array(size),
      queue = new Int32Array(size);
    let largest = [];
    for (let p = 0; p < size; p++) {
      if (seen[p] || data[p * 4 + 3] < alphaThreshold) continue;
      let head = 0,
        tail = 1;
      queue[0] = p;
      seen[p] = 1;
      while (head < tail) {
        const v = queue[head++],
          x = v % info.width,
          y = Math.floor(v / info.width);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height)
              continue;
            const q = ny * info.width + nx;
            if (!seen[q] && data[q * 4 + 3] >= alphaThreshold) {
              seen[q] = 1;
              queue[tail++] = q;
            }
          }
      }
      if (tail > largest.length) largest = Array.from(queue.subarray(0, tail));
    }
    const keep = new Uint8Array(size);
    for (const p of largest) keep[p] = 1;
    for (let p = 0; p < size; p++) if (!keep[p]) data[p * 4 + 3] = 0;
    const png = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .trim({ threshold: 0 })
      .png()
      .toBuffer();
    result.push(png);
  }
  return result;
}
