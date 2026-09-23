import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDirectory = resolve(import.meta.dirname, "../dist/renderer/assets");
const maximumChunkBytes = 500_000;

const chunks = await Promise.all(
  (await readdir(assetsDirectory))
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => ({
      name,
      size: (await stat(resolve(assetsDirectory, name))).size,
    })),
);

const oversizedChunks = chunks.filter(({ size }) => size > maximumChunkBytes);
if (oversizedChunks.length > 0) {
  const details = oversizedChunks
    .sort((left, right) => right.size - left.size)
    .map(({ name, size }) => `${name}: ${(size / 1_000).toFixed(2)} kB`)
    .join("\n");
  throw new Error(`Renderer chunks exceed the 500 kB budget:\n${details}`);
}

const largestChunk = chunks.sort((left, right) => right.size - left.size)[0];
if (largestChunk) {
  console.log(`Renderer chunk budget passed: ${largestChunk.name} is ${(largestChunk.size / 1_000).toFixed(2)} kB.`);
}
