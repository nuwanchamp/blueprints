import { describe, expect, it } from 'vitest'
import { bookmarkPages } from './pdfOutline'

/** A tiny PDF laid out the way Chromium writes one: a page tree (here nested) and bookmarks pointing at pages. */
const utf16 = (s: string) => `<FEFF${[...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>`
const pdf = (objs: string[]) => new TextEncoder().encode(`%PDF-1.4\n${objs.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join('')}%%EOF`)

describe('bookmark pages', () => {
  it('finds the page each heading starts on, through a nested page tree and Chinese titles', () => {
    const file = pdf([
      '<</Type /Catalog /Pages 2 0 R /Outlines 9 0 R>>', // 1
      '<</Type /Pages /Kids [3 0 R 4 0 R 8 0 R] /Count 4>>', // 2
      '<</Type /Page /Parent 2 0 R>>', // 3: page 1
      '<</Type /Pages /Kids [5 0 R 6 0 R] /Parent 2 0 R>>', // 4
      '<</Type /Page /Parent 4 0 R>>', // 5: page 2
      '<</Type /Page /Parent 4 0 R>>', // 6: page 3
      '<</Title (unused)>>', // 7
      '<</Type /Page /Parent 2 0 R>>', // 8: page 4
      '<</Type /Outlines /First 10 0 R>>', // 9
      '<</Title (1. Summary)\n/Dest [5 0 R /XYZ 0 800 0] /Next 11 0 R>>', // 10
      `<</Title ${utf16('2. 销售')}\n/Dest [8 0 R /XYZ 0 800 0] /Next 12 0 R>>`, // 11
      '<</Title (3. Costs \\(all\\))\n/Dest [6 0 R /XYZ 0 800 0]>>', // 12
    ])
    const pages = bookmarkPages(file)
    expect(pages.get('1. Summary')).toBe(2)
    expect(pages.get('2. 销售')).toBe(4)
    expect(pages.get('3. Costs (all)')).toBe(3)
    expect(pages.has('unused')).toBe(false)
  })

  it('gives nothing for a PDF without bookmarks', () => {
    expect(bookmarkPages(pdf(['<</Type /Catalog /Pages 2 0 R>>', '<</Type /Pages /Kids [3 0 R]>>', '<</Type /Page>>'])).size).toBe(0)
  })
})
