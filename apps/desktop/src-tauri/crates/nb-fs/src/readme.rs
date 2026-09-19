/// The guide written to `_notebook/README.md` when a project is created
/// (spec 5.1). It is for someone who finds the folder without the
/// application, so it says what the files are and how to rebuild a document
/// from them (spec A.3).
pub(crate) const README: &str = "\
# Research notebook

This folder is the record of a research project, kept by Research Notebook.
Everything in it is plain text or a copy of a file you captured, so it can be
read, searched and kept under version control without the application.

## What is here

- `project.yaml`: the project's settings, the order of its questions and
  experiments, and the layout of the table.
- `questions/`: one Markdown file for each question.
- `experiments/`: one folder for each experiment, holding `experiment.md`
  (the written sections), `artefacts.yaml` (the artefacts, their versions and
  checksums), and the captured files in `evidence/` and `methods/`.
- `bibliography.json`: a CSL-JSON copy of every source the notebook cites.
- `styles/`: the citation style in use.

Your analysis files, such as scripts, data and results, live outside this
folder and are never changed by the application.

## Rebuilding an experiment as a document

With [Pandoc](https://pandoc.org) installed, this turns an experiment into a
Word document with its citations formatted:

    cd _notebook/experiments/EXP-042
    pandoc experiment.md --citeproc \\
      --bibliography ../../bibliography.json \\
      --csl ../../styles/nature.csl \\
      -o EXP-042.docx

## Editing by hand

The files can be edited in any text editor. Keep the `---` lines around the
top of each Markdown file, and leave the `id` values alone: they are how the
notebook tells one record from another. Files the application cannot read are
opened read-only and are never overwritten.
";
