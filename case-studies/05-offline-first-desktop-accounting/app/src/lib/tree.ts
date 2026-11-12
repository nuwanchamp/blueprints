// Small helpers for two- and three-level lists (expense categories, income channels).

export interface TreeNode<T> {
  item: T
  /** 0 for a top-level item. */
  depth: number
  children: TreeNode<T>[]
}

/** Builds a forest from rows that point at their parent. Order within each level follows the input order. */
export function buildTree<T extends { id: number; parentId: number | null }>(items: T[]): TreeNode<T>[] {
  const nodes = new Map<number, TreeNode<T>>(items.map((item) => [item.id, { item, depth: 0, children: [] }]))
  const roots: TreeNode<T>[] = []
  for (const node of nodes.values()) {
    const parent = node.item.parentId === null ? undefined : nodes.get(node.item.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const setDepth = (n: TreeNode<T>, d: number) => {
    n.depth = d
    n.children.forEach((c) => setDepth(c, d + 1))
  }
  roots.forEach((r) => setDepth(r, 0))
  return roots
}

/** Depth-first list, parents before their children. */
export function flatten<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)])
}

/** Keeps a node if it matches, with its whole subtree, or if something below it matches (then only the matching branches). */
export function filterTree<T>(nodes: TreeNode<T>[], hit: (item: T) => boolean): TreeNode<T>[] {
  const out: TreeNode<T>[] = []
  for (const n of nodes) {
    if (hit(n.item)) out.push(n)
    else {
      const kids = filterTree(n.children, hit)
      if (kids.length) out.push({ ...n, children: kids })
    }
  }
  return out
}
