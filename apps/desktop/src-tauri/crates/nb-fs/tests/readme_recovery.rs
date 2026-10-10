//! S6-G07 (S6-T10): the recovery command in the generated README (spec A.3)
//! works. The command is read out of the README `nb-fs` writes, then run
//! with Pandoc on a copy of the typical fixture. Pandoc must be installed;
//! a missing Pandoc fails the test rather than skipping it.
// disallowed_methods: tests copy a fixture into a temporary directory; the
// std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;
use std::path::Path;
use std::process::Command;

use common::TestProject;
use nb_fs::{NewProject, ProjectRoot};

const TYPICAL: &str = "../../../../../fixtures/projects/format-v1/typical";
/// The experiment the README's example names, and the fixture's own.
const README_EXPERIMENT: &str = "EXP-042";
const FIXTURE_EXPERIMENT: &str = "EXP-001";

/// A minimal numeric in-text style. Written for this test so it needs no
/// licence; the README only needs `styles/nature.csl` to be a valid style.
const STYLE: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
    <title>Recovery test</title>
    <id>https://research-notebook.invalid/styles/recovery-test</id>
    <updated>2026-01-01T00:00:00+00:00</updated>
  </info>
  <citation collapse="citation-number">
    <layout prefix="[" suffix="]" delimiter=",">
      <text variable="citation-number"/>
    </layout>
  </citation>
  <bibliography>
    <layout>
      <text variable="citation-number" suffix=". "/>
      <text variable="title"/>
    </layout>
  </bibliography>
</style>
"#;

const BIBLIOGRAPHY: &str = r#"[{"id":"z:u:SMIT2222","type":"book","title":"Widgets and Gadgets","author":[{"family":"Smith","given":"Jane"}],"issued":{"date-parts":[[2020]]}}]
"#;

/// The README written for a new project.
fn generated_readme() -> String {
    let project = TestProject::without_notebook();
    ProjectRoot::create(
        project.root(),
        &NewProject {
            project_yaml:
                "format_version: 1\nid: \"01JAX9Q2B7N4M8T6V3W5Y1Z0KC\"\nname: \"Batch\"\n",
            bibliography_json: "[]\n",
            evidence_in_git: false,
        },
    )
    .unwrap();
    String::from_utf8(project.read("_notebook/README.md")).unwrap()
}

/// The indented code block that holds the command, joined across `\`
/// continuations: the `cd` line, then the Pandoc arguments.
fn recovery_command(readme: &str) -> (String, Vec<String>) {
    let block: Vec<&str> = readme
        .lines()
        .skip_while(|line| !line.trim_start().starts_with("cd "))
        .take_while(|line| line.starts_with("    "))
        .collect();
    let directory = block[0].trim().strip_prefix("cd ").unwrap().to_string();
    let command = block[1..]
        .iter()
        .map(|line| line.trim().trim_end_matches('\\'))
        .collect::<Vec<_>>()
        .join(" ");
    let mut words = command.split_whitespace().map(str::to_string);
    assert_eq!(words.next().as_deref(), Some("pandoc"), "README: {block:?}");
    (directory, words.collect())
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn run_pandoc(directory: &Path, args: &[String]) -> std::process::Output {
    Command::new("pandoc")
        .args(args)
        .current_dir(directory)
        .output()
        .expect("Pandoc must be installed to run the recovery command test")
}

#[test]
fn the_readme_command_renders_an_experiment_with_its_bibliography() {
    let (directory, args) = recovery_command(&generated_readme());

    // A copy, so the fixture stays untouched. The fixture cites nothing, so
    // the copy gets one source and one citation for Pandoc to resolve.
    let temp = tempfile::tempdir().unwrap();
    let notebook = temp.path().join("_notebook");
    copy_dir(
        &Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(TYPICAL)
            .join("_notebook"),
        &notebook,
    );
    fs::create_dir_all(notebook.join("styles")).unwrap();
    fs::write(notebook.join("styles/nature.csl"), STYLE).unwrap();
    fs::write(notebook.join("bibliography.json"), BIBLIOGRAPHY).unwrap();
    let experiment = notebook.join("experiments").join(FIXTURE_EXPERIMENT);
    let text = fs::read_to_string(experiment.join("experiment.md")).unwrap();
    fs::write(
        experiment.join("experiment.md"),
        format!("{text}\nCounts follow the usual method [@z:u:SMIT2222].\n"),
    )
    .unwrap();

    let directory = temp
        .path()
        .join(directory.replace(README_EXPERIMENT, FIXTURE_EXPERIMENT));
    let args: Vec<String> = args
        .iter()
        .map(|arg| arg.replace(README_EXPERIMENT, FIXTURE_EXPERIMENT))
        .collect();

    // The command exactly as the README gives it.
    let output = run_pandoc(&directory, &args);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(directory.join("EXP-001.docx").is_file());

    // A .docx is a zip, so the same command writing HTML shows what
    // Pandoc put in it.
    let mut as_text = args.clone();
    *as_text.last_mut().unwrap() = "EXP-001.html".to_string();
    let output = run_pandoc(&directory, &as_text);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let rendered = fs::read_to_string(directory.join("EXP-001.html")).unwrap();
    assert!(rendered.contains("csl-bib-body"), "{rendered}");
    assert!(rendered.contains("Widgets and Gadgets"), "{rendered}");
}
