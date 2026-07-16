import { deflateSync } from 'node:zlib';

const BASE_JPEG_HEX = [
  'ffd8ffe000104a46494600010100004800480000ffe1004c4578696600004d4d002a0000000800018769',
  '0004000000010000001a000000000003a00100030000000100010000a00200040000000100000002a003',
  '0004000000010000000200000000ffed003850686f746f73686f7020332e30003842494d040400000000',
  '00003842494d0425000000000010d41d8cd98f00b204e9800998ecf8427effc00011080002000203012200',
  '021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5',
  '100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1',
  'c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758',
  '595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9',
  'aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2',
  'f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc4',
  '00b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1',
  'b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455',
  '565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6',
  'a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2',
  'f3f4f5f6f7f8f9faffdb004300020202020202030202030503030305060505050506080606060606080a0808',
  '080808080a0a0a0a0a0a0a0a0c0c0c0c0c0c0e0e0e0e0e0f0f0f0f0f0f0f0f0f0fffdb004301020202',
  '04040407040407100b090b101010101010101010101010101010101010101010101010101010101010101010',
  '1010101010101010101010101010101010ffdd00040001ffda000c03010002110311003f00fc63f197c5ef8b37',
  '1e2fd7279fc6badc92497d72cccda95c966632b12493264927a9ae6ffe16cfc54ffa1cb5affc18dcff00f1ca',
  'e7fc59ff002356b3ff005fb71ffa31ab9fa00fffd9',
].join('');

const ALPHA_PNG_HEX = [
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  '0000000d49444154789c6360f8cfc0f01f00050001ff89993d1d',
  '0000000049454e44ae426082',
].join('');

const ascii = (value) => Buffer.from(`${value}\0`, 'ascii');
const short = (value) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};
const long = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};
const rational = (numerator, denominator = 1) => Buffer.concat([
  long(numerator),
  long(denominator),
]);

function stripAppMetadata(jpeg) {
  const chunks = [jpeg.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker === 0xda) {
      chunks.push(jpeg.subarray(offset));
      break;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker !== 0xe1 && marker !== 0xed) {
      chunks.push(jpeg.subarray(offset, offset + length + 2));
    }
    offset += length + 2;
  }
  return Buffer.concat(chunks);
}

function makeIfd(entries, dataStart) {
  const directory = Buffer.alloc(2 + (entries.length * 12) + 4);
  directory.writeUInt16LE(entries.length, 0);
  const data = [];
  let dataOffset = dataStart;

  entries.forEach(({ tag, type, count, value }, index) => {
    const entryOffset = 2 + (index * 12);
    directory.writeUInt16LE(tag, entryOffset);
    directory.writeUInt16LE(type, entryOffset + 2);
    directory.writeUInt32LE(count, entryOffset + 4);
    if (value.length <= 4) {
      value.copy(directory, entryOffset + 8);
    } else {
      directory.writeUInt32LE(dataOffset, entryOffset + 8);
      data.push(value);
      dataOffset += value.length;
    }
  });

  return { directory, data, nextOffset: dataOffset };
}

function makeExifPayload({ offsetTimeOriginal = null, includeGps = false } = {}) {
  const make = ascii('Elsewhere');
  const model = ascii('Fixture One');
  const date = ascii('2024:10:12 08:42:00');
  const offset = offsetTimeOriginal === null ? null : ascii(offsetTimeOriginal);
  const lens = ascii('Fixture Lens');
  const makerNote = ascii('private-maker-note');
  const serial = ascii('private-device-serial');
  const unknown = ascii('private-unknown-tag');

  const ifd0Count = includeGps ? 5 : 4;
  const ifd0Size = 2 + (ifd0Count * 12) + 4;
  const exifCount = offset === null ? 9 : 10;
  const exifSize = 2 + (exifCount * 12) + 4;
  const gpsSize = includeGps ? 2 + (4 * 12) + 4 : 0;
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifd0Size;
  const gpsOffset = exifOffset + exifSize;
  let dataOffset = gpsOffset + gpsSize;

  const ifd0 = makeIfd([
    { tag: 0x0112, type: 3, count: 1, value: short(6) },
    { tag: 0x010f, type: 2, count: make.length, value: make },
    { tag: 0x0110, type: 2, count: model.length, value: model },
    { tag: 0x8769, type: 4, count: 1, value: long(exifOffset) },
    ...(includeGps ? [{ tag: 0x8825, type: 4, count: 1, value: long(gpsOffset) }] : []),
  ], dataOffset);
  dataOffset = ifd0.nextOffset;

  const exif = makeIfd([
    { tag: 0x9003, type: 2, count: date.length, value: date },
    ...(offset === null ? [] : [{ tag: 0x9011, type: 2, count: offset.length, value: offset }]),
    { tag: 0xa434, type: 2, count: lens.length, value: lens },
    { tag: 0x920a, type: 5, count: 1, value: rational(35) },
    { tag: 0x829d, type: 5, count: 1, value: rational(28, 10) },
    { tag: 0x8827, type: 3, count: 1, value: short(125) },
    { tag: 0x829a, type: 5, count: 1, value: rational(1, 125) },
    { tag: 0x927c, type: 7, count: makerNote.length, value: makerNote },
    { tag: 0xa431, type: 2, count: serial.length, value: serial },
    { tag: 0xc7a1, type: 2, count: unknown.length, value: unknown },
  ], dataOffset);
  dataOffset = exif.nextOffset;

  const gps = includeGps ? makeIfd([
    { tag: 0x0001, type: 2, count: 2, value: ascii('N').subarray(0, 2) },
    { tag: 0x0002, type: 5, count: 3, value: Buffer.concat([rational(13), rational(45), rational(2268, 100)]) },
    { tag: 0x0003, type: 2, count: 2, value: ascii('E').subarray(0, 2) },
    { tag: 0x0004, type: 5, count: 3, value: Buffer.concat([rational(100), rational(30), rational(648, 100)]) },
  ], dataOffset) : null;

  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(ifd0Offset, 4);

  return Buffer.concat([
    Buffer.from('Exif\0\0', 'binary'),
    header,
    ifd0.directory,
    exif.directory,
    ...(gps ? [gps.directory] : []),
    ...ifd0.data,
    ...exif.data,
    ...(gps ? gps.data : []),
  ]);
}

function app1(payload) {
  return appSegment(0xe1, payload);
}

function appSegment(marker, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xff00 | marker, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

export const strictUtf8Bytes = () => Buffer.from('Elsewhere\n\u65c5\u7a0b\n', 'utf8');
export const malformedUtf8Bytes = () => Buffer.from([0x45, 0x6c, 0x73, 0x65, 0xc3, 0x28]);
export const minimalPdfBytes = () => Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n', 'ascii');
export const alphaPngBytes = () => Buffer.from(ALPHA_PNG_HEX, 'hex');

export function exifJpegBytes(options = {}) {
  const base = stripAppMetadata(Buffer.from(BASE_JPEG_HEX, 'hex'));
  const xmp = Buffer.from('http://ns.adobe.com/xap/1.0/\0<private-xmp/>', 'ascii');
  const icc = Buffer.from('ICC_PROFILE\0private-icc', 'ascii');
  return Buffer.concat([
    base.subarray(0, 2),
    app1(makeExifPayload(options)),
    app1(xmp),
    appSegment(0xe2, icc),
    base.subarray(2),
  ]);
}

export function corruptExifJpegBytes() {
  const base = stripAppMetadata(Buffer.from(BASE_JPEG_HEX, 'hex'));
  const corrupt = Buffer.from('Exif\0\0II*\0\xff\xff\xff\xff', 'binary');
  return Buffer.concat([base.subarray(0, 2), app1(corrupt), base.subarray(2)]);
}

export function pngWithCompressedMetadataBytes(expandedBytes = 256) {
  const png = alphaPngBytes();
  const metadataOffset = 33;
  const compressedText = Buffer.concat([
    Buffer.from('Raw profile type exif\0\0', 'ascii'),
    deflateSync(Buffer.alloc(expandedBytes, 0x41)),
  ]);
  return Buffer.concat([
    png.subarray(0, metadataOffset),
    pngChunk('zTXt', compressedText),
    png.subarray(metadataOffset),
  ]);
}

export const minimalHeicBytes = () => Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00,
  0x68, 0x65, 0x69, 0x63,
  0x6d, 0x69, 0x66, 0x31,
]);
