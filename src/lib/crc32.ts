export function crc32(str: string): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c;
  }
  
  let c = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Empire at War hashes the ASCII keys
    c = table[(c ^ code) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
