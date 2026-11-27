// Loads car textures, and on the Low graphics tier holds them to a smaller size.
//
// A 2048 x 2048 livery takes about 22 MB of graphics memory once its smaller copies
// (mipmaps) are counted, whatever the size of the file it came from. Four cars carry one or
// two each. On a phone that memory matters more than the sharpness, so the Low tier keeps
// every texture within 1024 pixels a side: a quarter of the memory for the big ones.

import { TextureLoader } from 'three';
import { loadTier } from './quality.js';

let limit = null;

/** The longest side a texture may have, in pixels. Read from the graphics tier on first use. */
export function textureSizeLimit() {
  if (limit === null) {
    let storage = null;
    try { storage = globalThis.localStorage ?? null; } catch { /* blocked storage: the default tier */ }
    limit = loadTier(storage, globalThis.location?.search).maxTextureSize ?? Infinity;
  }
  return limit;
}

/** For tests, and for a page that knows the tier already. `null` reads the tier again. */
export function setTextureSizeLimit(pixels) {
  limit = pixels;
}

/** The size an image should be drawn at to fit the limit, or null when it already fits. */
export function fitWithin(width, height, longest) {
  if (!(width > 0) || !(height > 0) || !(longest > 0) || Math.max(width, height) <= longest) return null;
  const scale = longest / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function shrink(texture) {
  const image = texture.image;
  const size = image && fitWithin(image.width, image.height, textureSizeLimit());
  if (!size) return;
  const canvas = globalThis.document?.createElement?.('canvas');
  if (!canvas) return;
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext?.('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, size.width, size.height);
  // Swapped before the texture is first drawn, so the full-size image is never sent to the card.
  texture.image = canvas;
  texture.needsUpdate = true;
}

const loader = new TextureLoader();

/** `new TextureLoader().load(url)` with the tier's size limit applied when the image arrives. */
export function loadTexture(url, onLoad) {
  return loader.load(url, (texture) => {
    shrink(texture);
    onLoad?.(texture);
  });
}
