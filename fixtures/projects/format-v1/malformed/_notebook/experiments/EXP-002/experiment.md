---
id: "01JAX000000000000000000005"
ref: "EXP-002"
question: "01JAX000000000000000000002"
title: "A duplicated frontmatter key"
title: "The second title makes this invalid YAML"
status: "planned"
created: "2026-01-06T09:00:04Z"
updated: "2026-01-06T09:00:04Z"
---

## Methods

`title` is written twice above. Notebook files reject duplicate keys
(format-v1.md 3.4): a syntax error, not a schema one, because the document
is never built.
