#!/usr/bin/env node
// scripts/knowledge-index.mjs
//
// Scans docs/knowledge/ for Markdown entries with YAML frontmatter and emits
// docs/knowledge/INDEX.md (human-readable, grouped by tag) and
// docs/knowledge/index.json (flat, machine-readable).
//
// Frontmatter schema (all fields required unless marked optional):
//   slug:        string, must equal the path relative to docs/knowledge/ with the .md extension stripped
//   title:       string
//   type:        string (one of: decision, pattern, anti-pattern, component, runbook, incident, glossary)
//   tags:        list of strings
//   related:     list of slug strings; may be empty
//   sourceFiles: list of repo-relative paths; may be empty
//   status:      one of: current, superseded, deprecated
//   updated:     ISO date (YYYY-MM-DD)
//
// Exits 0 on success, non-zero on schema violation.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = 'docs/knowledge'
const INDEX_MD = join(ROOT, 'INDEX.md')
const INDEX_JSON = join(ROOT, 'index.json')

const ALLOWED_TYPES = new Set([
  'decision',
  'pattern',
  'anti-pattern',
  'component',
  'runbook',
  'incident',
  'glossary',
])
const ALLOWED_STATUS = new Set(['current', 'superseded', 'deprecated'])

function collapseInlineArrays(block, file) {
  const lines = block.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Detect `key:` followed by a `[` continuation; combine until matching `]`.
    const keyOnly = /^([A-Za-z][A-Za-z0-9_-]*):\s*$/.exec(line)
    if (keyOnly && i + 1 < lines.length && lines[i + 1].trim().startsWith('[')) {
      const buf = [keyOnly[1] + ': ']
      i += 1
      while (i < lines.length) {
        const piece = lines[i].trim()
        buf.push(piece)
        if (piece.endsWith(']') || piece.endsWith('],')) break
        i += 1
      }
      if (i === lines.length) {
        throw new Error(`${file}: unterminated multi-line inline array for key ${keyOnly[1]}`)
      }
      out.push(
        buf
          .join(' ')
          .replace(/\s*,\s*/g, ', ')
          .replace(/\[\s+/g, '[')
          .replace(/\s+\]/g, ']'),
      )
      i += 1
      continue
    }
    out.push(line)
    i += 1
  }
  return out.join('\n')
}

function listMarkdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) listMarkdownFiles(full, out)
    else if (name.endsWith('.md') && name !== 'INDEX.md') out.push(full)
  }
  return out
}

function parseFrontmatter(text, file) {
  if (!text.startsWith('---\n')) {
    throw new Error(`${file}: missing leading YAML frontmatter`)
  }
  const end = text.indexOf('\n---\n', 4)
  if (end < 0) throw new Error(`${file}: unterminated frontmatter`)
  const block = text.slice(4, end)

  // Collapse multi-line inline arrays (Prettier's preferred wrap form for long
  // [a, b, c] frontmatter values) back to one line before parsing.
  const collapsed = collapseInlineArrays(block, file)

  const out = {}
  let currentKey = null
  for (const rawLine of collapsed.split('\n')) {
    if (rawLine.trim() === '') continue
    if (rawLine.startsWith('  - ')) {
      if (!currentKey) throw new Error(`${file}: list item without key`)
      if (typeof out[currentKey] === 'string') out[currentKey] = []
      out[currentKey].push(stripQuotes(rawLine.slice(4).trim()))
      continue
    }
    if (rawLine.startsWith('  ') && currentKey === null) {
      throw new Error(`${file}: unexpected indent`)
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(rawLine)
    if (!m) throw new Error(`${file}: cannot parse frontmatter line: ${rawLine}`)
    const [, key, rest] = m
    currentKey = key
    if (rest === '' || rest === '[]') {
      out[key] = rest === '[]' ? [] : ''
      continue
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim()
      out[key] =
        inner === ''
          ? []
          : inner
              .split(',')
              .map((s) => stripQuotes(s.trim()))
              .filter((s) => s !== '')
      continue
    }
    out[key] = stripQuotes(rest)
  }
  return out
}

function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

function validate(meta, file) {
  const required = ['slug', 'title', 'type', 'tags', 'related', 'sourceFiles', 'status', 'updated']
  for (const k of required) {
    if (!(k in meta)) throw new Error(`${file}: missing required frontmatter key: ${k}`)
  }
  if (!ALLOWED_TYPES.has(meta.type)) {
    throw new Error(`${file}: invalid type ${meta.type}; allowed: ${[...ALLOWED_TYPES].join(', ')}`)
  }
  if (!ALLOWED_STATUS.has(meta.status)) {
    throw new Error(
      `${file}: invalid status ${meta.status}; allowed: ${[...ALLOWED_STATUS].join(', ')}`,
    )
  }
  const expectedSlug = relative(ROOT, file).split(sep).join('/').replace(/\.md$/, '')
  if (meta.slug !== expectedSlug) {
    throw new Error(`${file}: slug ${meta.slug} does not match path-derived slug ${expectedSlug}`)
  }
  if (!Array.isArray(meta.tags)) throw new Error(`${file}: tags must be a list`)
  if (!Array.isArray(meta.related)) throw new Error(`${file}: related must be a list`)
  if (!Array.isArray(meta.sourceFiles)) throw new Error(`${file}: sourceFiles must be a list`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) {
    throw new Error(`${file}: updated must be ISO date YYYY-MM-DD`)
  }
}

function renderIndexMd(entries) {
  const lines = []
  lines.push('<!-- AUTO-GENERATED by `pnpm knowledge:index`. Do not edit by hand. -->')
  lines.push('')
  lines.push('# Knowledge Graph Index')
  lines.push('')
  lines.push(`Total entries: ${entries.length}.`)
  lines.push('')
  lines.push(
    'Each entry is a Markdown file with YAML frontmatter under `docs/knowledge/`. This index is auto-generated; the entries themselves are the source of truth.',
  )
  lines.push('')
  const byTag = new Map()
  for (const e of entries) {
    for (const t of e.tags) {
      if (!byTag.has(t)) byTag.set(t, [])
      byTag.get(t).push(e)
    }
  }
  const sortedTags = [...byTag.keys()].sort()
  for (const tag of sortedTags) {
    lines.push(`## Tag: \`${tag}\``)
    lines.push('')
    const tagEntries = byTag
      .get(tag)
      .slice()
      .sort((a, b) => a.slug.localeCompare(b.slug))
    for (const e of tagEntries) {
      lines.push(`- [${e.title}](${e.slug}.md) (status: ${e.status}, updated: ${e.updated})`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderIndexJson(entries) {
  const sorted = entries.slice().sort((a, b) => a.slug.localeCompare(b.slug))
  return JSON.stringify({ generatedAt: 'auto', entries: sorted }, null, 2) + '\n'
}

function main() {
  let files
  try {
    files = listMarkdownFiles(ROOT)
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`docs/knowledge does not exist; nothing to index`)
      process.exit(1)
    }
    throw e
  }
  const entries = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const meta = parseFrontmatter(text, file)
    validate(meta, file)
    entries.push(meta)
  }
  writeFileSync(INDEX_MD, renderIndexMd(entries))
  writeFileSync(INDEX_JSON, renderIndexJson(entries))
  console.log(`indexed ${entries.length} entries; wrote ${INDEX_MD} and ${INDEX_JSON}`)
}

main()
