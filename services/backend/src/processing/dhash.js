const DHASH_PATTERN = /^[a-f0-9]{16}$/;

function requireDHash(value, name) {
  if (typeof value !== 'string' || !DHASH_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a 16-character lowercase hexadecimal dHash`);
  }
  return value;
}

export function encodeDHash(grayscale9x8) {
  if (!(grayscale9x8 instanceof Uint8Array) || grayscale9x8.length !== 72) {
    throw new TypeError('grayscale9x8 must contain exactly 72 one-byte values');
  }

  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    const offset = row * 9;
    for (let column = 0; column < 8; column += 1) {
      hash <<= 1n;
      if (grayscale9x8[offset + column] > grayscale9x8[offset + column + 1]) {
        hash |= 1n;
      }
    }
  }
  return hash.toString(16).padStart(16, '0');
}

export function splitDHashBands(hash) {
  requireDHash(hash, 'hash');
  return Array.from({ length: 8 }, (_, index) => `${index}:${hash.slice(index * 2, index * 2 + 2)}`);
}

export function hammingDistance64(a, b) {
  requireDHash(a, 'a');
  requireDHash(b, 'b');
  let difference = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  for (let bit = 0; bit < 64 && difference !== 0n; bit += 1) {
    distance += Number(difference & 1n);
    difference >>= 1n;
  }
  return distance;
}
