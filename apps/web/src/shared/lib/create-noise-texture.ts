import * as THREE from "three";

let cachedNoiseTexture: THREE.DataTexture | null = null;

/** Procedural noise — no external CDN; safe for offline / blocked networks. */
export function createNoiseTexture(): THREE.DataTexture {
  if (cachedNoiseTexture) {
    return cachedNoiseTexture;
  }

  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const value = Math.floor(
        (Math.sin(x * 0.09) * Math.cos(y * 0.11) * 0.35 +
          Math.sin((x + y) * 0.05) * 0.25 +
          0.5) *
          255,
      );

      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  cachedNoiseTexture = texture;

  return texture;
}
