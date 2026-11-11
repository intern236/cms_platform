import sanitizeHtml from 'sanitize-html'
/* The head-reading half, in a module with no dependencies so the admin editor can
   import it without dragging sanitize-html into the browser bundle. */
import { maskForScanning, pageDescription, pageTitle } from '@/lib/content/post-page-meta'
import { scopeStyleBlocks } from '@/lib/content/scope-css'

export {
  asPostFormat,
  pageBodyText,
  pageTitle,
  pageDescription,
  pageWordCount,
  type PostFormat,
} from '@/lib/content/post-page-meta'

/**
 * The second kind of post: a whole HTML page, pasted in and published as itself.
 *
 * WHY THERE ARE TWO. The rich editor in the admin produces a narrow, known set of tags,
 * and lib/blog.ts sanitises against exactly that set — see the note there, which is the
 * stored-XSS boundary for everything the editor writes. This is the other one. A writer who
 * arrives with a finished page, styles and layout and schema included, has nothing that
 * survives that allowlist: `<style>` goes, every class goes, every wrapper `<div>` goes, and
 * what is left is a column of paragraphs. The request was to be able to publish the page as
 * it is, so this is a second boundary drawn around a much wider set, and it is a separate
 * module rather than a second option object in lib/blog.ts because it has to be readable on
 * its own. A security control nobody can find is a security control nobody checks.
 *
 * SEPARATE ALSO BECAUSE IT HAS NO DATABASE IMPORT. lib/blog.ts pulls in the SQLite driver,
 * which is why no client component can touch it. Everything here is pure string work, so the
 * editor, the published page and the preview can all share one definition rather than
 * mirroring constants by hand.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * WHAT IS ALLOWED, AND WHAT IS NOT
 *
 * KEPT, VERBATIM: every structural, semantic, media, table and form element; every
 * attribute that is not listed below; `<style>` blocks and their CSS; inline `style`
 * attributes; classes and ids; `<link rel="stylesheet">`; `<title>` and `<meta>`; HTML
 * comments; and `<script type="application/ld+json">`, because JSON-LD is data rather than
 * code and is most of what "SEO included" means on a page like this.
 *
 * REMOVED:
 *
 *   `<script>` (anything but ld+json), WITH ITS CONTENTS. This was the explicit decision:
 *   a post body is rendered into a public page on this site's own origin, so a script
 *   stored in one runs for every reader of that post, for as long as it stays published.
 *   Admin authentication is the only thing standing in front of the paste, and
 *   "authenticated" describes a person, not every request that ever carries their cookie.
 *   The cost is real and worth stating plainly: a pasted page whose tabs, accordions or
 *   animations are driven by JavaScript will render correctly and sit still.
 *
 *   `on*` ATTRIBUTES. onclick, onload, onerror and the rest are script by another name, and
 *   an onerror on a broken image is the single most common way a "no scripts" rule is got
 *   around.
 *
 *   `srcdoc` ON AN IFRAME. A frame's srcdoc document inherits the embedding origin, so it
 *   is a same-origin script channel wearing an iframe's clothes. `src` is untouched: a
 *   frame pointing at another site runs that site's code in that site's origin, which is
 *   not ours to be attacked through.
 *
 *   `http-equiv`. `<meta http-equiv="refresh">` is a redirect, and a redirect stored in a
 *   post body is a way to send this site's readers somewhere else under this site's name.
 *
 *   `javascript:` AND EVERY OTHER SCHEME not on the list below, anywhere a URL is read.
 *   `data:` survives on images only, where a base64 PNG is ordinary; on a link it is a way
 *   to open an attacker-authored document from this origin's address bar.
 *
 *   `<object>`, `<embed>`, `<applet>`, `<base>`, `<frame>`, `<frameset>` — all plugin or
 *   document-hijacking surfaces with no legitimate use in an article. They are absent from
 *   the allowlist rather than filtered out, which is the safer direction: a tag nobody
 *   thought of is refused by default instead of admitted by default.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * IF SCRIPTS EVER HAVE TO RUN, the change is one line: delete the `exclusiveFilter` at the
 * end of PAGE_SANITIZE_OPTIONS below, which is the only thing removing them. Deleting it
 * also makes the paragraph above about every reader of every post true, which is the whole
 * of what is being traded. Do not do it to make one pasted page's carousel work. The safe
 * way to get that specific thing is a named allowlist: support the two or three embeds
 * actually used, each validated here by name.
 */


/**
 * The allowlist: broad, explicit, and an allowlist rather than a blocklist.
 *
 * `allowedTags: false` would have been one word instead of this, and it means "allow
 * everything", which admits `<script>` and every tag invented after this was written. An
 * enumerated list refuses the unknown by default. That is the whole reason it is worth
 * typing out.
 *
 * `script` IS ON THE LIST ON PURPOSE, and the exclusiveFilter below then removes every one
 * of them that is not `type="application/ld+json"`. It has to be admitted here first
 * because a tag that is never allowed cannot be inspected — and sanitize-html's default
 * `nonTextTags` is what makes the removal take the script's *contents* with it rather than
 * leaving the code behind as visible text.
 */
const ALLOWED_TAGS = [
  /* Document scaffolding. Kept so a pasted page arrives whole and htmlPostDocument() below
     can find its own <body> rather than guessing. */
  'html', 'head', 'body', 'title', 'meta', 'link', 'style', 'script',
  /* Layout and sectioning */
  'header', 'footer', 'main', 'nav', 'section', 'article', 'aside', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'address',
  /* Text */
  'p', 'br', 'hr', 'wbr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'code', 'kbd', 'samp', 'var',
  'pre', 'blockquote', 'a', 'bdi', 'bdo', 'ruby', 'rt', 'rp',
  /* Lists and figures */
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  /* Tables. `colgroup` and `col` ARE allowed here where the editor's own allowlist refuses
     them: there they carried pixel widths from a 900px admin panel into a phone layout,
     here they are part of a page somebody laid out deliberately. */
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  /* Media */
  'img', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'canvas', 'map', 'area',
  /* SVG, which is how most pasted pages draw their icons */
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'circle', 'ellipse', 'rect', 'line',
  'polyline', 'polygon', 'text', 'tspan', 'desc', 'clipPath', 'mask', 'pattern', 'filter',
  'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feMerge', 'feMergeNode',
  'linearGradient', 'radialGradient', 'stop', 'foreignObject',
  /* Forms. Harmless without script: a form can do what a link can do, which is navigate. */
  'form', 'label', 'input', 'textarea', 'select', 'option', 'optgroup', 'button',
  'fieldset', 'legend', 'output', 'progress', 'meter', 'datalist',
  /* Disclosure */
  'details', 'summary', 'dialog', 'noscript',
]

/** URL schemes, and the one exception. See the note on `data:` in the header. */
const SCHEMES = ['https', 'http', 'mailto', 'tel']
const IMAGE_SCHEMES = ['https', 'http', 'data']

/**
 * SVG's camelCase attributes, keyed by the lowercase name they arrive as.
 *
 * WHY THIS EXISTS. sanitize-html's parser lowercases attribute names, which is correct for
 * HTML — where they are case-insensitive — and wrong for SVG, where they are not.
 * `viewBox` arrives as `viewbox`, and an `svg` element with no viewBox does not scale: the
 * icon renders at its intrinsic size or not at all. Since almost every pasted page draws
 * its icons in inline SVG, that is not a corner case, it is most of them.
 *
 * IT IS NOT STRICTLY NECESSARY, AND IT IS STILL WORTH HAVING. The HTML parser in every
 * browser runs an "adjust SVG attributes" step over foreign content that maps `viewbox`
 * back to `viewBox` on the way in, so the lowercased output would in fact render. Relying
 * on that means the stored markup is wrong and only accidentally works — it breaks the
 * moment anyone copies a post's HTML back out, feeds it to a tool that is not a browser,
 * or renders it in an XML context where the fix-up does not apply.
 *
 * TAGS NEED NO EQUIVALENT. sanitize-html matches allowedTags against the tag's original
 * spelling and passes it through unchanged, so `clipPath` and `linearGradient` are allowed
 * and emitted as written, which is why both appear in camelCase in ALLOWED_TAGS above.
 * Getting that wrong is not cosmetic like this one: an unmatched tag is discarded.
 */
const SVG_ATTRIBUTE_CASE = new Map(
  [
    'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'spreadMethod',
    'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits',
    'maskUnits', 'maskContentUnits', 'filterUnits', 'primitiveUnits',
    'markerUnits', 'markerWidth', 'markerHeight', 'refX', 'refY',
    'stdDeviation', 'baseFrequency', 'numOctaves', 'edgeMode', 'kernelMatrix',
    'kernelUnitLength', 'xChannelSelector', 'yChannelSelector', 'tableValues',
    'surfaceScale', 'diffuseConstant', 'specularConstant', 'specularExponent',
    'startOffset', 'textLength', 'lengthAdjust', 'pathLength',
    'requiredExtensions', 'systemLanguage',
    'attributeName', 'repeatCount', 'keyTimes', 'keySplines', 'calcMode',
  ].map((name) => [name.toLowerCase(), name] as const)
)

function isInlineImage(attribute: string, value: string): boolean {
  return (
    (attribute === 'src' || attribute === 'srcset' || attribute === 'poster') &&
    /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(value.trim())
  )
}

const PAGE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  /**
   * EVERY ATTRIBUTE, then a filter. The pasted page's whole appearance lives in its
   * classes, ids, data-attributes, ARIA, width/height, srcset and inline styles, and
   * enumerating those is a list nobody could keep complete — the first attribute missed
   * silently breaks somebody's layout with no error anywhere. So the direction is reversed
   * here and only here: allow the lot, then take away the handful that are executable.
   * The filter is in transformTags below and is the thing to read.
   */
  allowedAttributes: false,
  /* Required by sanitize-html to allow `<style>` and `<script>` at all. It is a warning
     switch, not a behaviour one: without it the library logs and carries on. Both are
     deliberate here and both are constrained below. */
  allowVulnerableTags: true,
  allowedSchemes: SCHEMES,
  allowedSchemesByTag: {
    img: IMAGE_SCHEMES,
    source: IMAGE_SCHEMES,
    video: IMAGE_SCHEMES,
    audio: IMAGE_SCHEMES,
  },
  /* `//evil.example/x.png` inherits whatever scheme the page was served over and is a
     favourite way to smuggle a URL past a check that only reads the start of the string. */
  allowProtocolRelative: false,
  transformTags: {
    /**
     * The attribute filter, applied to every element.
     *
     * `'*'` runs before sanitize-html decides what to keep, and because allowedAttributes
     * is false whatever this returns is what ships. Three families go, and each is a
     * script channel rather than a style choice — see the header for why.
     */
    '*': (tagName, attribs) => {
      const kept: Record<string, string> = {}
      for (const [name, value] of Object.entries(attribs)) {
        const lower = name.toLowerCase()
        if (lower.startsWith('on')) continue
        if (lower === 'srcdoc') continue
        if (lower === 'http-equiv') continue
        /**
         * The one attribute whose VALUE is filtered rather than its name.
         *
         * `expression()` is IE's old way of putting JavaScript in a stylesheet and no
         * browser in service has run it for a decade, so this is insurance rather than a
         * live defence — but it costs one comparison, and the alternative is a note
         * explaining why the only executable thing CSS ever had is the one thing not
         * checked. `javascript:` in a `url()` is the same story.
         */
        if (lower === 'style' && /expression\s*\(|javascript\s*:/i.test(value)) continue
        /* data: URLs are allowed for one purpose only — inline raster images — and
           never as a link, frame or document, whatever attribute carries them. */
        if (/^data:/i.test(value.replace(/[\u0000-\u0020]/g, '')) && !isInlineImage(lower, value)) continue
        /* Lowercase everywhere except SVG's case-sensitive names, which are restored to
           their canonical spelling — from the lowercased key, so an author who typed
           VIEWBOX gets a working viewBox too. See SVG_ATTRIBUTE_CASE. */
        kept[SVG_ATTRIBUTE_CASE.get(lower) ?? name] = value
      }
      return { tagName, attribs: kept }
    },
  },
  /**
   * The script rule. Anything that is not structured data is removed outright, contents
   * included — sanitize-html's default `nonTextTags` list carries `script`, which is what
   * makes the removal take the code with it instead of dropping it into the page as text.
   *
   * A BREAKOUT CANNOT SURVIVE THIS, and it is worth saying why rather than hoping. The
   * check runs on parsed elements, not on the raw string: `</script><script>bad()` typed
   * inside a JSON-LD block ends that element at the first `</script>` exactly as a browser
   * would, and the second element then arrives here with no `type` and is discarded.
   */
  exclusiveFilter: (frame) =>
    (frame.tag === 'script' && frame.attribs.type !== 'application/ld+json') ||
    /* A <link> may only pull in a stylesheet — not preload, prefetch, import or
       anything else that makes the visitor's browser fetch on the page's behalf. */
    (frame.tag === 'link' && (frame.attribs.rel ?? '').toLowerCase().trim() !== 'stylesheet'),
}

/* ---- Comments -------------------------------------------------------------------
   sanitize-html drops HTML comments and offers no option to keep them, and the request
   named comments explicitly — a pasted page's comments are usually its section markers and
   its notes to the next person. So they are lifted out before sanitising and put back
   after.

   WHY PUTTING THEM BACK IS SAFE, which is the only interesting part. The pattern is
   non-greedy, so a captured comment ends at the FIRST `-->` — exactly where an HTML parser
   ends it. That means the text between the delimiters can never itself contain `-->`, so
   restoring the original string cannot close the comment early and let markup out. What
   goes back is a comment, and it re-parses as one.

   The token is text, not markup, so sanitisation carries it through untouched; a comment
   that sat inside a dropped <script> loses its token with the script and its entry is
   simply never used. */
/**
 * Raw-text elements are output by the sanitiser exactly as written, which is safe in
 * an HTML document but NOT if a browser ends up parsing that text as markup (inside
 * SVG or MathML a <style> is not raw text). Escaping `<` in them closes that door:
 * CSS reads `\3c ` as `<`, and JSON reads `\u003c` as `<`, so nothing legitimate
 * changes — but the text can no longer form a tag.
 */
function escapeRawText(html: string): string {
  return html
    .replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_m, open: string, css: string, close: string) => open + css.replace(/</g, '\\3c ') + close
    )
    .replace(
      /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (_m, open: string, json: string, close: string) =>
        open + json.replace(/</g, '\\u003c') + close
    )
}

/**
 * SECURITY: HTML COMMENTS ARE DROPPED, NOT PRESERVED.
 *
 * An earlier version set comments aside before sanitising and put them back
 * afterwards, so a pasted page kept its comments. That was exploitable: when a
 * comment ends up inside a raw-text element (an unclosed <style>, say), the browser
 * does not read it as a comment at all, and a `</style>` inside it closes the
 * element early — letting whatever follows run as markup. Comments never change what
 * a visitor sees, so the only safe amount of them to keep is none.
 */
export function sanitizePagePostHtml(html: string): string {
  return escapeRawText(sanitizeHtml(html, PAGE_SANITIZE_OPTIONS))
}

/**
 * A stored page, taken apart for rendering.
 *
 * WHY IT HAS TO BE TAKEN APART AT ALL. The root layout owns `<html>` and `<body>` for every
 * route on this site — Next's App Router allows exactly one root layout and a page cannot
 * replace it — so a stored document's own `<html>` and `<body>` tags cannot be emitted as
 * the real ones. They would be nested inside the real pair, where the browser discards them
 * and keeps their contents. Which is the right outcome, but only by luck, and it leaves
 * `<title>` and `<meta>` stranded in the body doing nothing.
 *
 * So this reads the parts that belong somewhere specific and hands the rest over whole:
 * the title and description go to Next's metadata where they become real head tags, the
 * styles are re-emitted at the top of the content so the CSS still applies, and the body is
 * the page.
 *
 * REGULAR EXPRESSIONS, ON PURPOSE, AND ONLY HERE. Parsing HTML with them is a bad idea in
 * general and a fine one for this: the input has already been through a real parser in
 * sanitizePagePostHtml above, so what arrives is normalised, `<script>` is gone, and the
 * four things being looked for are unambiguous. Nothing about safety rests on these
 * patterns — they run after the boundary, not as part of it.
 */
/**
 * The class every HTML post is wrapped in, and the scope its stylesheet is confined to.
 *
 * ONE CONSTANT, TWO CONSUMERS, and they have to agree exactly or the page loses all its
 * styling at once: <HtmlPost> puts this class on the wrapper, and htmlPostDocument()
 * rewrites every selector in the page’s CSS to sit under it. See lib/scope-css.ts for
 * why the rewriting happens at all.
 */
export const HTML_POST_SCOPE_CLASS = 'cms-html-post'
const HTML_POST_SCOPE = `.${HTML_POST_SCOPE_CLASS}`

export type HtmlPostDocument = {
  /** The document's own <title>, where it has one. */
  title: string | null
  /** The document's own meta description, where it has one. */
  description: string | null
  /** Its <style> blocks and stylesheet links, re-emitted with the body. Scoped. */
  head: string
  /** Whether the page brought its own JSON-LD, so the site knows not to add a second. */
  hasStructuredData: boolean
  /** Everything inside <body>, or the whole document when there is no body tag. */
  body: string
}

export function htmlPostDocument(html: string): HtmlPostDocument {
  /* Both from lib/post-page-meta.ts, which is where they live so the admin editor can
     read the same two values out of an unsaved paste and show the writer what was found. */
  const title = pageTitle(html)
  const description = pageDescription(html)

  /**
   * EVERY POSITION BELOW IS FOUND IN THE MASKED COPY AND SLICED OUT OF THE ORIGINAL.
   *
   * maskForScanning blanks the inside of comments, `<style>` and `<script>` while keeping
   * the string the same length, so an index into it is an index into `html`. That is the
   * whole mechanism, and it exists because the first realistic page put through this format
   * broke it twice over: a CSS comment mentioning `<body>` was matched by the body pattern,
   * so the published page began mid-sentence, and a commented-out `<style>` block would
   * have been lifted into the head and applied for real. Both are ordinary things to find
   * in a page somebody hands you. See the note on maskForScanning.
   */
  const scan = maskForScanning(html)

  /** Everything `pattern` matches in the scan, taken from the same offsets in the original. */
  const slice = (pattern: RegExp): { text: string; start: number; end: number }[] =>
    [...scan.matchAll(pattern)].map((match) => ({
      text: html.slice(match.index, match.index + match[0].length),
      start: match.index,
      end: match.index + match[0].length,
    }))

  /* Style blocks, stylesheet links and the page's own structured data, in the order they
     appeared. All three are valid in a body — <link rel=stylesheet> explicitly so in HTML5,
     <style> universally supported there — which is what lets the page keep its appearance
     and its schema without a head to put them in. Taken from the whole document rather than
     from a matched <head>, because a page whose head was stripped by whatever produced it
     still has its styles somewhere. */
  const lifted = [
    ...slice(/<style\b[^>]*>[\s\S]*?<\/style>/gi),
    ...slice(/<link\b[^>]+rel=["']stylesheet["'][^>]*>/gi),
    ...slice(/<script\b[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi),
  ].sort((a, b) => a.start - b.start)

  /**
   * SCOPED ON THE WAY OUT, and this is the line that keeps the rest of the site intact.
   *
   * The post now renders with the real header above it and the real footer below, so a
   * pasted `body { background: … }` or `h2 { font-size: 27px }` would reach both of them.
   * Every selector in every `<style>` block is rewritten to sit under the post's own
   * wrapper; the markup around them is untouched. See lib/scope-css.ts.
   *
   * A `<link rel="stylesheet">` cannot be scoped — its rules live in a file this code never
   * sees. Inline styles are contained; a linked framework is not.
   */
  const head = scopeStyleBlocks(lifted.map((entry) => entry.text).join('\n'), HTML_POST_SCOPE)

  /* Whether the page brought its own JSON-LD. The post page uses it to decide whether to
     emit BlogPostingSchema, because two descriptions of one URL is how a page ends up
     telling a search engine two different things about itself. */
  const hasStructuredData = /<script[^>]+ld\+json/i.test(head)

  /* A fragment rather than a full document is a perfectly normal paste — somebody copying
     the interesting half — so with no <body> the whole string is the body. The closing tag
     is found with lastIndexOf so a page that mentions </body> in its own prose does not cut
     the article short. */
  const open = /<body\b[^>]*>/i.exec(scan)
  const bodyStart = open ? open.index + open[0].length : 0
  const closeIndex = scan.toLowerCase().lastIndexOf('</body>')
  const bodyEnd = open && closeIndex > bodyStart ? closeIndex : html.length

  /* What has to come out of the body: everything lifted into the head above, which would
     otherwise be emitted twice, and the document-level tags that are either meaningless
     here or already handled — <html>/<head>/<body> because the root layout owns the real
     ones, <title> and <meta> because they went to Next's metadata and would render as
     stray text or a stray tag if left. Removed back to front so each removal cannot move
     the offsets of the ones still to come. */
  const remove = [
    ...lifted,
    ...slice(/<\/?(?:html|head|body)\b[^>]*>/gi),
    ...slice(/<title\b[^>]*>[\s\S]*?<\/title>/gi),
    ...slice(/<meta\b[^>]*>/gi),
  ]
    .filter((entry) => entry.start >= bodyStart && entry.end <= bodyEnd)
    .sort((a, b) => b.start - a.start)

  let body = html.slice(bodyStart, bodyEnd)
  for (const entry of remove) {
    body = body.slice(0, entry.start - bodyStart) + body.slice(entry.end - bodyStart)
  }

  return { title, description, head, hasStructuredData, body: body.trim() }
}


