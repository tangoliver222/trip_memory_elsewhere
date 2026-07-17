const LOW_MEAN = 0.02;
const HIGH_MEAN = 0.98;
const MAX_LOW_VARIANCE = 0.0004;
const MAX_LOW_ENTROPY_BITS = 0.5;

function normalizeInput({ pixels, width, height } = {}) {
  if (!(pixels instanceof Uint8Array)
    || !Number.isSafeInteger(width)
    || width < 1
    || !Number.isSafeInteger(height)
    || height < 1
    || width * height !== pixels.byteLength) {
    throw new TypeError('Routing pixels must be one complete grayscale plane');
  }
  return { pixels, width, height };
}

export function deriveRoutingFeatures(input) {
  const { pixels, width, height } = normalizeInput(input);
  const bins = new Uint32Array(256);
  let sum = 0;
  for (const pixel of pixels) {
    bins[pixel] += 1;
    sum += pixel;
  }

  const count = pixels.byteLength;
  const mean = sum / (count * 255);
  let squaredDeviation = 0;
  let entropyBits = 0;
  for (let value = 0; value < bins.length; value += 1) {
    const frequency = bins[value];
    if (frequency === 0) continue;
    const probability = frequency / count;
    const deviation = (value / 255) - mean;
    squaredDeviation += frequency * deviation * deviation;
    entropyBits -= probability * Math.log2(probability);
  }
  const variance = squaredDeviation / count;

  let edgeSum = 0;
  let edgePairCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      if (x > 0) {
        edgeSum += Math.abs(pixels[index] - pixels[index - 1]);
        edgePairCount += 1;
      }
      if (y > 0) {
        edgeSum += Math.abs(pixels[index] - pixels[index - width]);
        edgePairCount += 1;
      }
    }
  }
  const edgeEnergy = edgePairCount === 0 ? 0 : edgeSum / (edgePairCount * 255);
  const exposure = mean <= LOW_MEAN ? 'under' : mean >= HIGH_MEAN ? 'over' : 'normal';
  const lowInformation = exposure !== 'normal'
    && variance <= MAX_LOW_VARIANCE
    && entropyBits <= MAX_LOW_ENTROPY_BITS;

  return Object.freeze({
    mean,
    variance,
    entropyBits,
    edgeEnergy,
    exposure,
    lowInformation,
  });
}
