---
description: 'Query the knowledge graph index'
argument-hint: '[query string]'
allowed-tools: ['Bash(cat:*)', 'Bash(grep:*)', 'Read']
---

# /knowledge

Search the project knowledge graph at `docs/knowledge/`. If no query is provided, show the entries grouped by tag. With a query, filter to entries whose title, slug, or tags match.

Show entries via:

```!
node -e "
const j=JSON.parse(require('fs').readFileSync('docs/knowledge/index.json','utf8'));
const q=(process.argv[1]||'').toLowerCase();
const rows=j.entries.filter(e=>!q || e.title.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q) || e.tags.some(t=>t.toLowerCase().includes(q)));
if(rows.length===0){console.log('no matches'); process.exit(0);}
for(const e of rows){console.log(\`- [\${e.status}] \${e.slug}: \${e.title} (tags: \${e.tags.join(', ')})\`);}
" "$ARGUMENTS"
```
