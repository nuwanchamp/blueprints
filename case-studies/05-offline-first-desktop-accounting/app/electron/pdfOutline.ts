// Reads the bookmarks Chromium writes into a PDF (printToPDF with generateDocumentOutline) and says which page each
// heading lands on. That is how the report's contents page gets real page numbers: print once, read the pages,
// fill them in, print again. Chromium's PDFs keep these objects uncompressed, so a small reader is enough.

/** "(2. Sales)" or "<FEFF00320…>" → text */
function pdfString(raw: string): string {
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/\s+/g, '')
    const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let s = ''
      for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
      return s
    }
    return String.fromCharCode(...bytes)
  }
  const body = raw.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[c] ?? c)
  // A literal string that starts with a byte-order mark is UTF-16BE too
  if (body.charCodeAt(0) === 0xfe && body.charCodeAt(1) === 0xff) {
    let s = ''
    for (let i = 2; i + 1 < body.length; i += 2) s += String.fromCharCode((body.charCodeAt(i) << 8) | body.charCodeAt(i + 1))
    return s
  }
  return body
}

/** Heading text → the page it is on (1 = first page), for every bookmark in the PDF. */
export function bookmarkPages(pdf: Uint8Array): Map<string, number> {
  const text = Buffer.from(pdf).toString('latin1')
  const objects = new Map<number, string>()
  for (const m of text.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[2])

  // Pages in reading order: walk the page tree from the catalog's /Pages
  const order: number[] = []
  const walk = (id: number) => {
    const obj = objects.get(id) ?? ''
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(obj)
    if (/\/Type\s*\/Pages\b/.test(obj) && kids) for (const k of kids[1].matchAll(/(\d+) 0 R/g)) walk(Number(k[1]))
    else if (/\/Type\s*\/Page\b/.test(obj)) order.push(id)
  }
  const root = /\/Type\s*\/Catalog[\s\S]*?\/Pages\s+(\d+) 0 R/.exec(text)
  if (root) walk(Number(root[1]))

  const pages = new Map<string, number>()
  for (const obj of objects.values()) {
    const title = /\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/.exec(obj)
    const dest = /\/Dest\s*\[\s*(\d+) 0 R/.exec(obj)
    if (!title || !dest) continue
    const page = order.indexOf(Number(dest[1]))
    const name = pdfString(title[1])
    if (page >= 0 && !pages.has(name)) pages.set(name, page + 1)
  }
  return pages
}
