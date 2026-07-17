import sharp from 'sharp';
import { getImageCapabilityReport } from '../src/adapters/sharp-image-processor.js';

const isWebp = (bytes) => (
  bytes.subarray(0, 4).toString('ascii') === 'RIFF'
  && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
);

async function run() {
  const report = getImageCapabilityReport();
  const seed = await sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: { r: 47, g: 103, b: 151 },
    },
  }).png().toBuffer();
  const jpeg = await sharp(seed).jpeg().toBuffer();
  const webp = await sharp(seed).webp().toBuffer();
  const decoded = await Promise.all([
    sharp(jpeg).metadata(),
    sharp(seed).metadata(),
    sharp(webp).metadata(),
  ]);
  const webpOutput = await sharp(jpeg).webp().toBuffer();
  const smoke = Object.freeze({
    jpegInput: decoded[0].format === 'jpeg',
    pngInput: decoded[1].format === 'png',
    webpInput: decoded[2].format === 'webp',
    webpOutput: isWebp(webpOutput),
  });
  const required = report.decode.jpeg
    && report.decode.png
    && report.decode.webp
    && report.encode.webp
    && Object.values(smoke).every(Boolean);

  process.stdout.write(`${JSON.stringify({
    ok: required,
    library: {
      sharp: report.versions.sharp,
      libvips: report.versions.vips,
      heif: report.versions.heif,
      webp: report.versions.webp,
    },
    capabilities: {
      decode: report.decode,
      encode: report.encode,
    },
    smoke,
  })}\n`);
  if (!required) process.exitCode = 1;
}

run().catch(() => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: 'media-capability-smoke-failed',
  })}\n`);
  process.exitCode = 1;
});
