const bytesEqual = (bytes, offset, expected) => (
  expected.every((value, index) => bytes[offset + index] === value)
);

const ascii = (value) => Array.from(value, (character) => character.charCodeAt(0));

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

export function detectBinaryFormat(input) {
  if (!(input instanceof Uint8Array)) return null;
  const bytes = input;

  if (bytes.length >= 3 && bytesEqual(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (bytes.length >= 8
    && bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (bytes.length >= 12
    && bytesEqual(bytes, 0, ascii('RIFF'))
    && bytesEqual(bytes, 8, ascii('WEBP'))) {
    return 'webp';
  }
  if (bytes.length >= 5 && bytesEqual(bytes, 0, ascii('%PDF-'))) return 'pdf';
  if (bytes.length >= 12 && bytesEqual(bytes, 4, ascii('ftyp'))) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (HEIC_BRANDS.has(brand)) return 'heic';
    if (HEIF_BRANDS.has(brand)) return 'heif';
  }
  return null;
}
