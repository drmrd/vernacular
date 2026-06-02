---
description: 'Scaffold a new Architecture Decision Record'
argument-hint: '<short-slug> "Title for the ADR"'
allowed-tools: ['Bash', 'Read', 'Write']
---

# /adr

Scaffold a new ADR under `docs/knowledge/decisions/`. The next ADR number is computed from the existing files. Replace the placeholders with the title from `$ARGUMENTS` (everything after the first space).

```!
node -e "
const fs=require('fs');
const path=require('path');
const dir='docs/knowledge/decisions';
const args=(process.argv[1]||'').trim();
const m=args.match(/^(\S+)\s+\"(.+)\"$/) || args.match(/^(\S+)\s+(.+)$/);
if(!m){console.error('usage: /adr <short-slug> \"Title for the ADR\"'); process.exit(1);}
const slugSuffix=m[1];
const title=m[2];
const existing=fs.readdirSync(dir).filter(f=>f.startsWith('ADR-')).map(f=>parseInt(f.slice(4,8),10));
const next=(existing.length?Math.max(...existing):0)+1;
const num=String(next).padStart(4,'0');
const fileName=\`ADR-\${num}-\${slugSuffix}.md\`;
const slug=\`decisions/ADR-\${num}-\${slugSuffix}\`;
const today=new Date().toISOString().slice(0,10);
const body=\`---\\nslug: \${slug}\\ntitle: 'ADR-\${num}: \${title}'\\ntype: decision\\ntags: []\\nrelated: []\\nsourceFiles: []\\nstatus: current\\nupdated: \${today}\\n---\\n\\n# ADR-\${num}: \${title}\\n\\n## Status\\n\\nProposed.\\n\\n## Context\\n\\n[Describe the situation that requires a decision.]\\n\\n## Decision\\n\\n[State the decision in one paragraph.]\\n\\n## Consequences\\n\\n[List the consequences, both positive and negative.]\\n\\n## References\\n\\n[Links to related ADRs, spec sections, or external sources.]\\n\`;
fs.writeFileSync(path.join(dir,fileName), body);
console.log('created '+path.join(dir,fileName));
console.log('remember to fill in tags, related, sourceFiles, and the body, then run \`pnpm knowledge:index\`.');
" "$ARGUMENTS"
```
