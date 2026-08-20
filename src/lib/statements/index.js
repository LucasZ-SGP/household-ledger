import { OCBC_PARSER } from "./ocbc.js";

// Ordered list of known statement formats. Adding a bank means writing a module
// with detect()/parse() and registering it here — nothing else changes.
export const PARSERS = [OCBC_PARSER];

export function detectParser(pages) {
  for (const parser of PARSERS) {
    try {
      if (parser.detect(pages)) return parser;
    } catch {
      // a broken detector must not block the others
    }
  }
  return null;
}
