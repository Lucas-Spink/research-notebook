// Fixed Typst template for S1-T06 (spec 7.12, ADR-0007). This file is the
// only Typst markup source involved in an export: it is committed and
// reviewed like any other source file. All experiment content is read back
// as data through `json("/data.json")` and `image("/figure.svg")` — the
// World implementation in lib.rs is the only thing that decides what bytes
// those virtual paths resolve to, so caller-supplied text can never become
// Typst markup, however it is worded.

#set page(paper: "a4")
#set text(size: 11pt)

#let data = json("/data.json")

= #data.title

#data.notes

#figure(
  image("/figure.svg", width: 80%),
  caption: [#data.figure-caption],
)
