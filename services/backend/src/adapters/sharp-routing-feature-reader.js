import sharp from 'sharp';
import { deriveRoutingFeatures } from '../routing/features.js';

function featureError(code = 'routing/feature-unavailable') {
  const error = new Error('Routing features are unavailable');
  error.name = 'RoutingFeatureError';
  error.code = code;
  return error;
}

export function createSharpRoutingFeatureReader({ thumbnailReader } = {}) {
  if (typeof thumbnailReader?.read !== 'function') {
    throw new TypeError('thumbnailReader.read is required');
  }

  return Object.freeze({
    async read(fragment, { signal } = {}) {
      if (!(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal');
      if (signal.aborted) throw featureError('routing/feature-aborted');
      try {
        const buffer = await thumbnailReader.read(fragment, { signal });
        if (!Buffer.isBuffer(buffer) || buffer.byteLength < 1) throw featureError();
        if (signal.aborted) throw featureError('routing/feature-aborted');
        const { data, info } = await sharp(buffer, {
          failOn: 'error',
          limitInputPixels: 512 * 512,
        })
          .rotate()
          .flatten({ background: '#fff' })
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        if (signal.aborted) throw featureError('routing/feature-aborted');
        if (info.channels !== 1
          || info.width < 1
          || info.width > 512
          || info.height < 1
          || info.height > 512) {
          throw featureError();
        }
        return deriveRoutingFeatures({ pixels: data, width: info.width, height: info.height });
      } catch (error) {
        if (signal.aborted || error?.code === 'routing/feature-aborted') {
          throw featureError('routing/feature-aborted');
        }
        throw featureError();
      }
    },
  });
}
