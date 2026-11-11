/**
 * Questions and answers a writer typed into the ARTICLE BODY, read back out as data.
 *
 * WHY THIS EXISTS. A post has a dedicated FAQ panel in the editor, and that panel is what
 * publishes FAQPage schema. Writers do not use it. They do what every writer does and type
 * the FAQ into the article: a "Frequently Asked Questions" heading, then each question in
 * bold, then its answer. The client's review found exactly that on a live post — four
 * perfectly good questions, visible to every reader, and no schema at all, because to a
 * search engine they are one heading and eight paragraphs.
 *
 * So the page now recognises that shape and publishes it as schema. The structured panel
 * still wins wherever it has been filled in (see where this is called), so nothing a writer
 * entered deliberately is overridden by a guess.
 *
 * IT DOES NOT CHANGE WHAT IS RENDERED. The questions are already on the page, in the body,
 * where the writer put them. Only the JSON-LD is added. That is also what keeps this within
 * Google's rule for FAQ markup: the marked-up content has to be visible on the page, and it
 * is — it is the page.
 *
 * CONSERVATIVE BY DESIGN, and every rule below errs towards missing a question rather than
 * inventing one. A wrong FAQPage — a "question" that is really a subheading, an "answer"
 * that is half the next section — is worse than none: it is structured data asserting
 * something the page does not say. So:
 *
 *   • It only looks inside a section whose heading says FAQ or "frequently asked".
 *   • A question must END WITH A QUESTION MARK. That single rule is what stops "Conclusion"
 *     or "Pricing" being read as a question when a writer groups their FAQ under
 *     subheadings or forgets to close the section.
 *   • An answer must have text. A question followed by nothing is dropped.
 *   • The section ends at the next heading of the same or higher level that is not itself a
 *     question, or at a horizontal rule.
 *
 * NO NPM DEPENDENCIES, deliberately — only lib/html-entities.ts, which has none either. The
 * published page calls it on the server, and the admin
 * editor calls it in the browser to show a writer what will be published. lib/blog.ts
 * imports the SQLite driver and cannot be used from the editor, so this lives on its own.
 *
 * REGULAR EXPRESSIONS OVER SANITISED MARKUP, not a parser. The input is post HTML that has
 * already been through sanitizePostHtml, which normalises it to a small, known set of tags
 * with no attributes worth parsing — the same assumption splitForMidCta in lib/blog.ts
 * makes, and for the same reason: nothing here is a security boundary, and the shapes being
 * looked for are unambiguous.
 */

import { decodeHtmlEntities } from '@/lib/content/html-entities'

export type ExtractedFaq = { question: string; answer: string }

/** Void elements never open a level, so they must not move the depth counter. */
const VOID_TAGS = new Set(['img', 'hr', 'br', 'col', 'wbr'])

/** Cheap pre-check: does the phrase appear anywhere at all? Most posts stop here. */
const FAQ_PHRASE = /\b(?:faqs?|frequently\s+asked\s+questions?)\b/i

/**
 * A heading that NAMES an FAQ section, as opposed to one that merely mentions FAQs.
 *
 * The phrase has to be what the heading is, give or take a short lead-in or a subject:
 *
 *   ✓ FAQ · FAQs · Frequently Asked Questions (FAQs) · Paid Marketing FAQs
 *   ✓ Frequently asked questions about performance marketing · Common FAQs
 *   ✗ Why FAQs matter for SEO · How to write FAQ schema · 5 FAQ mistakes to avoid
 *
 * The rejected ones are exactly the headings a marketing blog writes when the ARTICLE is
 * about FAQs, and the bold questions under them are examples, not the page's own questions.
 * Publishing those as FAQPage schema would describe the page wrongly.
 */
const PHRASE = String.raw`(?:faqs?|frequently\s+asked\s+questions?)(?:\s*\(\s*faqs?\s*\))?`
const FAQ_HEADING = new RegExp(
  String.raw`^(?:(?:[\w'’&-]+\s+){0,4}${PHRASE}|(?:(?:the|our|common|top|some|more)\s+)*${PHRASE}\s+(?:about|on|for|regarding)\b.*)[\s:.?!]*$`,
  'i'
)

type Block = { tag: string; html: string }

/**
 * The document's top-level elements, in order.
 *
 * THE DEPTH COUNTER IS THE WHOLE POINT, for the reason splitForMidCta gives: splitting on
 * closing tags alone would treat a paragraph inside a blockquote or a table cell as a block
 * of its own, and an answer containing a table would be cut into pieces. Only elements that
 * start and end at depth zero are blocks.
 */
function topLevelBlocks(html: string): Block[] {
  const blocks: Block[] = []
  const tag = /<(\/?)([a-z0-9]+)[^>]*?(\/?)>/gi
  let depth = 0
  let start = -1
  let name = ''
  let match: RegExpExecArray | null

  while ((match = tag.exec(html)) !== null) {
    const [full, closing, tagName, selfClosing] = match
    const lower = tagName.toLowerCase()

    if (VOID_TAGS.has(lower) || selfClosing === '/') {
      /* A top-level void element is a block on its own. Only <hr> means anything here —
         it ends an FAQ section — but recording all of them keeps the walk honest. */
      if (depth === 0) blocks.push({ tag: lower, html: full })
      continue
    }

    if (!closing) {
      if (depth === 0) {
        start = match.index
        name = lower
      }
      depth++
    } else {
      depth--
      if (depth === 0 && start !== -1) {
        blocks.push({ tag: name, html: html.slice(start, match.index + full.length) })
        start = -1
      }
      /* Unbalanced markup — a stray closing tag — should never reach here from the
         sanitiser, but a negative depth would silently swallow the rest of the post. */
      if (depth < 0) depth = 0
    }
  }
  return blocks
}

/**
 * Named and numeric entities, decoded through the shared table.
 *
 * It was a local list once, with the right ordering but a short set of names. Sharing it
 * means a question and a post title decode identically, and the argument for why `&amp;`
 * goes last lives in exactly one place: lib/html-entities.ts.
 */
const decodeEntities = decodeHtmlEntities

/**
 * The readable text of a fragment.
 *
 * LIST ITEMS ARE JOINED WITH A SEMICOLON rather than run together. An answer that is a
 * bulleted list of tools would otherwise arrive in the schema as "Google Analytics HubSpot
 * Meta Ads Manager" — one unpunctuated run that a search engine quoting the answer would
 * quote exactly like that.
 */
function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<\/li>\s*(?=<li)/gi, '; ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(?:p|li|h[1-6]|blockquote|tr|td|th)>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    /* A list item's own </p> becomes a space just before the joining semicolon, which
       leaves "Google Analytics ; HubSpot". Closed up after the fact rather than by special-
       casing paragraphs inside list items, because the space can come from either side. */
    .replace(/\s+;/g, ';')
    .trim()
}

/** "1. What is X?" → "What is X?"; also "Q1:", "Q:", "1)", "Question 2 -". */
function cleanQuestion(text: string): string {
  return text.replace(/^(?:q(?:uestion)?\s*\d*\s*[:.)\-–]\s*|\d+\s*[.):\-–]\s*)/i, '').trim()
}

/** "A: Yes." / "Ans. Yes." → "Yes." — the mirror of the question prefix. */
function cleanAnswer(text: string): string {
  return text.replace(/^(?:a(?:ns(?:wer)?)?\s*\d*\s*[:.)\-–]\s*)/i, '').trim()
}

const isQuestion = (text: string) => text.trim().endsWith('?')

function headingLevel(tag: string): number | null {
  const match = /^h([1-6])$/.exec(tag)
  return match ? Number(match[1]) : null
}

/**
 * A paragraph that opens with bold text, split into the bold part and whatever follows.
 *
 * Covers both shapes writers use:
 *   <p><strong>1. Is X better?</strong></p>                 — question alone, answer next
 *   <p><strong>Is X better?</strong> Generally, yes.</p>    — question and answer inline
 */
function leadingBold(html: string): { bold: string; rest: string } | null {
  const match = /^<p[^>]*>\s*<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*)<\/p>$/i.exec(html.trim())
  if (!match) return null
  return { bold: textOf(match[2]), rest: textOf(match[3]) }
}

/**
 * The FAQ pairs in a post body, or an empty list.
 *
 * Only the FIRST FAQ section is read. A post with two is unusual enough that guessing how
 * they relate is not worth the risk of publishing them as one.
 */
export function extractBodyFaqs(html: string): ExtractedFaq[] {
  if (!html || !FAQ_PHRASE.test(html)) return []

  const blocks = topLevelBlocks(html)
  const startIndex = blocks.findIndex(
    (block) => headingLevel(block.tag) !== null && FAQ_HEADING.test(textOf(block.html).replace(/\s+/g, ' ').trim())
  )
  if (startIndex === -1) return []

  const sectionLevel = headingLevel(blocks[startIndex].tag)!
  const pairs: ExtractedFaq[] = []
  let question: string | null = null
  let answer: string[] = []

  const flush = () => {
    const text = cleanAnswer(answer.join(' ').replace(/\s+/g, ' ').trim())
    if (question && text) pairs.push({ question, answer: text })
    question = null
    answer = []
  }

  for (const block of blocks.slice(startIndex + 1)) {
    const level = headingLevel(block.tag)

    /* A rule is a writer drawing a line under the section. */
    if (block.tag === 'hr') break

    if (level !== null) {
      const text = cleanQuestion(textOf(block.html))
      if (isQuestion(text)) {
        /* Question as a heading — at any level, including the FAQ heading's own. */
        flush()
        question = text
        continue
      }
      /* A non-question heading at or above the FAQ heading's level is the next section. */
      if (level <= sectionLevel) break
      /* A lower non-question heading is a grouping label inside the FAQ ("Billing"). It
         closes the current answer but belongs to nothing itself. */
      flush()
      continue
    }

    const bold = block.tag === 'p' ? leadingBold(block.html) : null
    if (bold) {
      const text = cleanQuestion(bold.bold)
      if (isQuestion(text)) {
        flush()
        question = text
        if (bold.rest) answer.push(bold.rest)
        continue
      }
    }

    /* Everything else is answer text — but only once a question is open. Prose between the
       FAQ heading and its first question ("Here are the ones we hear most") is an intro,
       not an answer to anything. */
    if (question) {
      const text = textOf(block.html)
      if (text) answer.push(text)
    }
  }
  flush()

  return pairs
}
