import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createSharpRoutingFeatureReader } from '../../src/adapters/sharp-routing-feature-reader.js';

const makeFragment = () => ({
  id: 'frag_12345678',
  ownerId: 'user_alpha',
  storage: Object.defineProperty({}, 'originalPath', {
    get() {
      throw new Error('original must not be read');
    },
  }),
  derivatives: {
    thumbnail: {
      path: 'users/user_alpha/derived/frag_12345678/thumbnail.webp',
      generation: '1740000000000100',
    },
  },
});

async function alphaFixture(format = 'png') {
  const image = sharp(Uint8Array.from([
    0, 0, 0, 0,
    0, 0, 0, 255,
  ]), { raw: { width: 2, height: 1, channels: 4 } });
  return format === 'webp' ? image.webp().toBuffer() : image.png().toBuffer();
}

test('decodes bounded PNG and WebP thumbnails into frozen routing features', async (t) => {
  for (const format of ['png', 'webp']) {
    await t.test(format, async () => {
      const bytes = await alphaFixture(format);
      const calls = [];
      const thumbnailReader = {
        async read(fragment, options) {
          calls.push({ fragment, options });
          return bytes;
        },
        putThumbnail() {
          throw new Error('must not create derivatives');
        },
      };
      const signal = new AbortController().signal;
      const fragment = makeFragment();

      const result = await createSharpRoutingFeatureReader({ thumbnailReader })
        .read(fragment, { signal });

      assert.deepEqual(calls, [{ fragment, options: { signal } }]);
      assert.deepEqual(Object.keys(result).sort(), [
        'edgeEnergy',
        'entropyBits',
        'exposure',
        'lowInformation',
        'mean',
        'variance',
      ]);
      assert.equal(Object.isFrozen(result), true);
      assert.equal(result.mean, 0.5);
      assert.equal(result.variance, 0.25);
      assert.equal(result.entropyBits, 1);
      assert.equal(result.edgeEnergy, 1);
      assert.equal(result.exposure, 'normal');
      assert.equal(result.lowInformation, false);
      assert.equal('buffer' in result, false);
      assert.equal('pixels' in result, false);
    });
  }
});

test('invalid thumbnail bytes fail without exposing decoder or source details', async () => {
  const secret = 'users/user_alpha/originals/private.jpg';
  const thumbnailReader = {
    async read() {
      return Buffer.from(`${secret}: not an image`);
    },
  };

  await assert.rejects(
    createSharpRoutingFeatureReader({ thumbnailReader }).read(makeFragment(), {
      signal: new AbortController().signal,
    }),
    (error) => {
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test('requires one reader port and an AbortSignal', async () => {
  assert.throws(() => createSharpRoutingFeatureReader(), TypeError);
  assert.throws(() => createSharpRoutingFeatureReader({ thumbnailReader: {} }), TypeError);
  const reader = createSharpRoutingFeatureReader({
    thumbnailReader: { async read() { return alphaFixture(); } },
  });
  await assert.rejects(reader.read(makeFragment(), {}), TypeError);
});
