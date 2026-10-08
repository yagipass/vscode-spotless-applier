export interface TextReplacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function minimalEdit(
  original: string,
  formatted: string,
): TextReplacement | undefined {
  if (original === formatted) {
    return undefined;
  }
  const shorter = Math.min(original.length, formatted.length);
  let prefix = 0;
  while (
    prefix < shorter &&
    original.charCodeAt(prefix) === formatted.charCodeAt(prefix)
  ) {
    prefix++;
  }
  if (prefix > 0 && splitsCharacter(original, prefix)) {
    prefix--;
  }
  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    original.charCodeAt(original.length - 1 - suffix) ===
      formatted.charCodeAt(formatted.length - 1 - suffix)
  ) {
    suffix++;
  }
  if (suffix > 0 && splitsCharacter(original, original.length - suffix)) {
    suffix--;
  }
  return {
    start: prefix,
    end: original.length - suffix,
    text: formatted.slice(prefix, formatted.length - suffix),
  };
}

function splitsCharacter(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  const surrogatePair =
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  const crlf = before === 0x0d && after === 0x0a;
  return surrogatePair || crlf;
}
