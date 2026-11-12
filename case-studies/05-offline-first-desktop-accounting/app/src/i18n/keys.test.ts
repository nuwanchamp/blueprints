import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'
import zh from './zh.json'

type Tree = { [k: string]: string | Tree }

const flat = (tree: Tree, prefix = ''): string[] => Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : flat(v, `${prefix}${k}.`)))
const enKeys = new Set(flat(en as Tree))
const zhKeys = new Set(flat(zh as Tree))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

// "x.y" is satisfied by "x.y", or by plural forms "x.y_one" / "x.y_other"
const has = (keys: Set<string>, k: string) => keys.has(k) || keys.has(`${k}_one`) || keys.has(`${k}_other`)

describe('translations', () => {
  const used = new Set<string>()
  for (const file of sources('src')) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1])
  }

  it('every key the code asks for exists in English and in Chinese', () => {
    const missingEn = [...used].filter((k) => !has(enKeys, k))
    const missingZh = [...used].filter((k) => !has(zhKeys, k))
    expect(missingEn).toEqual([])
    expect(missingZh).toEqual([])
  })

  it('English and Chinese have the same keys (apart from plural forms Chinese does not need)', () => {
    const strip = (k: string) => k.replace(/_(one|other)$/, '')
    const e = new Set([...enKeys].map(strip))
    const z = new Set([...zhKeys].map(strip))
    expect([...e].filter((k) => !z.has(k))).toEqual([])
    expect([...z].filter((k) => !e.has(k))).toEqual([])
  })
})
