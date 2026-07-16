import { parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';

console.warn = () => {};
console.error = () => {};

const HARD_MAX_INPUT_PIXELS = 60_000_000;

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function imageFacts(metadata) {
  return {
    format: typeof metadata.format === 'string' ? metadata.format : null,
    width: positiveInteger(metadata.width),
    height: positiveInteger(metadata.height),
    pages: positiveInteger(metadata.pages),
  };
}

function factsExceedLimits(facts) {
  const { limits } = workerData;
  return facts.width === null
    || facts.height === null
    || facts.width > limits.maxImageWidth
    || facts.height > limits.maxImageHeight
    || facts.width * facts.height > limits.maxInputPixels
    || (facts.pages !== null && facts.pages > limits.maxPageCount);
}

function exactBytes(bytes) {
  return Uint8Array.from(bytes);
}

try {
  parentPort.postMessage({ kind: 'stage', stage: 'sharp' });
  const source = sharp(workerData.path, {
    limitInputPixels: HARD_MAX_INPUT_PIXELS,
    failOn: 'error',
    pages: 1,
  });
  const facts = imageFacts(await source.metadata());
  if (facts.format !== workerData.expectedFormat) {
    parentPort.postMessage({ kind: 'result', status: 'invalid', facts });
  } else if (factsExceedLimits(facts)) {
    parentPort.postMessage({ kind: 'result', status: 'limits', facts });
  } else {
    const { data: thumbnailData, info: thumbnailInfo } = await source
      .clone()
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const grayscale = await source
      .clone()
      .rotate()
      .flatten({ background: '#ffffff' })
      .grayscale()
      .resize(9, 8, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .raw()
      .toBuffer();
    const thumbnail = exactBytes(thumbnailData);
    const dhashPixels = exactBytes(grayscale);
    parentPort.postMessage({
      kind: 'result',
      status: 'complete',
      facts,
      thumbnail: {
        bytes: thumbnail,
        width: positiveInteger(thumbnailInfo.width),
        height: positiveInteger(thumbnailInfo.height),
      },
      dhashPixels,
    }, [thumbnail.buffer, dhashPixels.buffer]);
  }
} catch {
  parentPort.postMessage({ kind: 'result', status: 'invalid' });
}
