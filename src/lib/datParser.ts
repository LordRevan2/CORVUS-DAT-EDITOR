import { DatEntry } from '../types';

export function parseDatFile(buffer: ArrayBuffer): DatEntry[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 4) {
    throw new Error("Invalid DAT file: too small");
  }

  const recordCount = view.getUint32(0, true);
  const entries: DatEntry[] = [];
  
  const indexOffset = 4;
  let stringsOffset = indexOffset + (recordCount * 12);
  
  let totalStringBytes = 0;
  for (let i = 0; i < recordCount; i++) {
    const textLen = view.getUint32(indexOffset + i * 12 + 4, true);
    totalStringBytes += textLen * 2;
  }
  let keysOffset = stringsOffset + totalStringBytes;

  const utf16Decoder = new TextDecoder('utf-16le');
  const asciiDecoder = new TextDecoder('ascii');

  for (let i = 0; i < recordCount; i++) {
    const entryIndexOffset = indexOffset + i * 12;
    const hash = view.getUint32(entryIndexOffset, true);
    const textLength = view.getUint32(entryIndexOffset + 4, true);
    const keyLength = view.getUint32(entryIndexOffset + 8, true);

    const textByteLength = textLength * 2;
    let text = "";
    if (stringsOffset + textByteLength <= buffer.byteLength) {
      const textBuffer = buffer.slice(stringsOffset, stringsOffset + textByteLength);
      text = utf16Decoder.decode(textBuffer);
      if (text.endsWith('\0')) {
        text = text.slice(0, -1);
      }
    }
    stringsOffset += textByteLength;

    let key = "";
    if (keysOffset + keyLength <= buffer.byteLength) {
      const keyBuffer = buffer.slice(keysOffset, keysOffset + keyLength);
      key = asciiDecoder.decode(keyBuffer);
      // Key may have trailing null byte, but EAW keys often don't.
      if (key.endsWith('\0')) {
        key = key.slice(0, -1);
      }
    }
    keysOffset += keyLength;

    entries.push({ hash, key, text, originalIndex: i });
  }
  
  return entries;
}

export function writeDatFile(entries: DatEntry[], targetLanguage?: string): ArrayBuffer {
  // We need to calculate the new string and key lengths
  let totalSize = 4; // record count
  totalSize += entries.length * 12; // 12 bytes per index entry
  
  let totalTextLengthBytes = 0;
  let totalKeyLengthBytes = 0;

  // Add null terminators if they were stripped? 
  // Standard EAW DAT stores exact length without null terminator.
  
  for (const entry of entries) {
    const textToWrite = targetLanguage && entry.translations && entry.translations[targetLanguage] !== undefined 
      ? entry.translations[targetLanguage] 
      : entry.text;
    totalTextLengthBytes += textToWrite.length * 2;
    totalKeyLengthBytes += entry.key.length;
  }
  
  totalSize += totalTextLengthBytes + totalKeyLengthBytes;
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  
  view.setUint32(0, entries.length, true);
  
  let indexOffset = 4;
  let textOffset = 4 + entries.length * 12;
  let keyOffset = textOffset + totalTextLengthBytes;
  
  for (const entry of entries) {
    const textToWrite = targetLanguage && entry.translations && entry.translations[targetLanguage] !== undefined 
      ? entry.translations[targetLanguage] 
      : entry.text;

    view.setUint32(indexOffset, entry.hash, true);
    view.setUint32(indexOffset + 4, textToWrite.length, true);
    view.setUint32(indexOffset + 8, entry.key.length, true);
    indexOffset += 12;
    
    // Write text
    for (let i = 0; i < textToWrite.length; i++) {
      view.setUint16(textOffset, textToWrite.charCodeAt(i), true);
      textOffset += 2;
    }

    // Write key
    for (let i = 0; i < entry.key.length; i++) {
      view.setUint8(keyOffset, entry.key.charCodeAt(i));
      keyOffset += 1;
    }
  }
  
  return buffer;
}
