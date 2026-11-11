/**
 * Turning HTML entities back into the characters they stand for, for text that is NOT HTML.
 *
 * WHY THIS EXISTS. A post's title, description, byline description, FAQ questions and
 * answers are plain strings. Nothing parses them, so whatever is typed or pasted into them
 * is what gets stored and what gets shown. Paste a title copied out of an HTML source —
 * which is what anyone does when they lift a headline from a page, a CMS export or a
 * generated article — and the field holds
 *
 *     The MVP Trap: Why &quot;Minimum&quot; Doesn&#39;t Mean &quot;Done&quot;
 *
 * and that is what a reader sees, letter for letter. It was reported as "the rich editor
 * cannot fetch special characters", and the reason it only affects these fields is that
 * the article body does not have the problem: the body goes through sanitize-html, whose
 * parser decodes entities on the way in, so a pasted `&quot;` is already a quote by the
 * time it is stored.
 *
 * SO THE PLAIN FIELDS GET THE SAME TREATMENT the body gets for free.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * WHY DECODING THESE FIELDS IS SAFE, which is the question worth asking of anything that
 * turns `&lt;` back into `<`. These values are only ever rendered as TEXT: React escapes
 * them again on the way out, Next's metadata escapes them into `<title>` and `<meta>`, and
 * lib/schema.tsx escapes `<` into `<` before any JSON-LD reaches the page. Every
 * `dangerouslySetInnerHTML` in the app takes the sanitised post body, the pasted HTML page
 * or a JSON-LD blob — never one of these fields.
 *
 * THAT IS AN INVARIANT, NOT AN OBSERVATION. If a title, description or FAQ answer is ever
 * rendered through dangerouslySetInnerHTML, a decoded `<script>` in one of them becomes a
 * real tag. Don't; they are text.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * `&amp;` IS DECODED LAST, and the order is the whole correctness argument.
 *
 * Text that is *meant* to read `&quot;` is written `&amp;quot;`. Decode `&amp;` first and
 * it becomes `&quot;`, which the next rule then turns into `"` — the original meaning
 * destroyed, and silently. Decoding it last leaves `&amp;quot;` untouched by every other
 * rule (there is no `&` in front of `quot;` at that point) and yields `&quot;`, which is
 * what the writer typed. The numeric passes run first for the same reason: `&amp;#39;`
 * must survive as the text "&#39;".
 *
 * This is exactly the bug the previous decoder in lib/post-page-meta.ts had — it replaced
 * `&amp;` first — and it is why that one is gone in favour of this.
 */

/**
 * The named entities worth carrying. Deliberately NOT the full HTML5 table of 2,000-odd:
 * this is the set that turns up in prose a person wrote — typographic punctuation, currency,
 * legal marks, the arithmetic signs — plus the five that are structural.
 *
 * `amp` is absent on purpose. It is handled last, on its own. See the header.
 */
const NAMED: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  // Typographic punctuation: the ones a word processor inserts without being asked.
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  prime: '′',
  Prime: '″',
  laquo: '«',
  raquo: '»',
  // Marks and symbols.
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  // Currency.
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  // Arithmetic and fractions.
  times: '×',
  divide: '÷',
  plusmn: '±',
  minus: '−',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  // Arrows, which turn up in headings more than you would think.
  rarr: '→',
  larr: '←',
  harr: '↔',
}

const NAMED_PATTERN = new RegExp(`&(${Object.keys(NAMED).join('|')});`, 'g')

/** A code point a browser would actually render. Anything else is left as written. */
function fromCodePoint(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null
  /* Lone surrogates are not characters; String.fromCodePoint throws on them. */
  if (code >= 0xd800 && code <= 0xdfff) return null
  return String.fromCodePoint(code)
}

/**
 * Decodes HTML entities in a plain-text value.
 *
 * Unknown entities are left exactly as they are — `&thinsp;` stays `&thinsp;` rather than
 * becoming a mangled guess, and a bare `&` in "R&D" is never touched, because it is not an
 * entity and the ampersand rule only matches the complete `&amp;`.
 */
export function decodeHtmlEntities(text: string): string {
  /* The overwhelmingly common case: no ampersand, nothing to do, no allocations. */
  if (!text || !text.includes('&')) return text

  return text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => fromCodePoint(parseInt(hex, 16)) ?? whole)
    .replace(/&#(\d+);/g, (whole, dec: string) => fromCodePoint(Number(dec)) ?? whole)
    .replace(NAMED_PATTERN, (whole, name: string) => NAMED[name] ?? whole)
    .replace(/&amp;/g, '&')
}
