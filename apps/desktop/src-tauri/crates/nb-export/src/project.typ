// Fixed Typst template for the project PDF (FR-ARC-06, ADR-0007, ADR-0056).
// This file is the only Typst markup involved in the export. The project is
// read back as data through `json("/data.json")`; the World decides what that
// path holds, so a researcher's wording can never become markup.

#set page(paper: "a4", margin: 2cm, numbering: "1")
#set text(size: 10.5pt)
#set heading(numbering: none)

#let data = json("/data.json")

// The two files the PDF carries (PDF/A-3b).
#pdf.attach(
  "/notebook.json",
  relationship: "data",
  mime-type: "application/json",
  description: "The notebook as structured data (notebook.json)",
)
#pdf.attach(
  "/bibliography.json",
  relationship: "supplement",
  mime-type: "application/json",
  description: "The sources of the project as CSL-JSON (bibliography.json)",
)

#let joined(parts) = if parts.len() == 0 { [] } else { parts.join() }

#let inline(node) = {
  let t = node.t
  if t == "text" { node.s }
  else if t == "em" { emph(joined(node.c.map(inline))) }
  else if t == "strong" { strong(joined(node.c.map(inline))) }
  else if t == "code" { raw(node.s) }
  else if t == "cite" { emph(node.s) }
  else if t == "br" { linebreak() }
  else if t == "link" { link(node.href, joined(node.c.map(inline))) }
  else { node.at("s", default: "") }
}

#let block-of(node) = {
  let t = node.t
  if t == "p" { par(joined(node.c.map(inline))) }
  else if t == "h" { heading(level: node.level, joined(node.c.map(inline))) }
  else if t == "ul" { list(..node.items.map(item => joined(item.map(block-of)))) }
  else if t == "ol" { enum(start: node.start, ..node.items.map(item => joined(item.map(block-of)))) }
  else if t == "code" { raw(node.text, block: true) }
  else if t == "quote" { quote(block: true, joined(node.c.map(block-of))) }
  else if t == "raw" { raw(node.text, block: true) }
  else { [] }
}

#let blocks(nodes) = for node in nodes { block-of(node) }

#set document(title: data.title)

#align(center, text(size: 20pt, weight: "bold", data.title))
#v(1em)

#for question in data.questions [
  #heading(level: 1, [#question.ref #question.title])
  #blocks(question.motivation)
]

#for experiment in data.experiments [
  #heading(level: 1, [#experiment.ref #experiment.title])
  #list(
    [Status: #experiment.status],
    ..if experiment.question != none { ([Question: #experiment.question],) } else { () },
    ..if experiment.started != none { ([Started: #experiment.started],) } else { () },
    ..if experiment.completed != none { ([Completed: #experiment.completed],) } else { () },
  )
  #blocks(experiment.preamble)
  #for section in experiment.sections [
    #heading(level: 2, section.heading)
    #blocks(section.blocks)
  ]
  #if experiment.artefacts.len() > 0 [
    #heading(level: 2, [Artefacts])
    #for artefact in experiment.artefacts [
      - #strong(artefact.name)
        #for line in artefact.lines [
          #linebreak() #line
        ]
    ]
  ]
  #if experiment.literature.len() > 0 [
    #heading(level: 2, [Literature])
    #blocks(experiment.literature)
  ]
]

#if data.bibliography.len() > 0 [
  #heading(level: 1, [Bibliography])
  #for entry in data.bibliography [
    #par(joined(entry.map(inline)))
  ]
]

#if data.notExported.len() > 0 [
  #heading(level: 1, [Not exported])
  Another question or experiment has the same ID or reference, so these were left out:
  #data.notExported.join(", ")
]
