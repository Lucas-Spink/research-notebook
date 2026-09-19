//! Which paths under `_notebook/` count as notebook data files: the files
//! `packages/format` parses (format-v1.md section 1), the same set `nb-index`
//! scans.

use nb_fs::watch::is_notebook_data_path;

#[test]
fn the_files_the_format_layer_parses_are_data_files() {
    for path in [
        "project.yaml",
        "bibliography.json",
        "questions/Q-01.md",
        "experiments/EXP-042/experiment.md",
        "experiments/EXP-042/artefacts.yaml",
    ] {
        assert!(is_notebook_data_path(path), "{path}");
    }
}

#[test]
fn nothing_else_is() {
    for path in [
        "",
        ".lock",
        "README.md",
        "styles/nature.csl",
        ".history/questions/Q-01.md",
        ".trash/experiments/EXP-042/experiment.md",
        "inbox/01JAX/request.json",
        "backups/2026/project.yaml",
        "exports/manifest.csv",
        "experiments/EXP-042/evidence/plot.pdf",
        "experiments/EXP-042/methods/run.R",
        "experiments/EXP-042/notes.md",
        "experiments/EXP-042/evidence/experiment.md",
        "experiments/experiment.md",
        "experiments/EXP-042/sub/experiment.md",
        "questions/sub/Q-01.md",
        "questions/readme.txt",
        "questions/.Q-01.md.1.1.tmp",
        "experiments/EXP-042/.experiment.md.1.1.tmp",
        ".project.yaml.1.1.tmp",
        "project.yaml.tmp",
    ] {
        assert!(!is_notebook_data_path(path), "{path}");
    }
}

#[test]
fn a_path_that_is_not_relative_is_not_a_data_file() {
    for path in [
        "/project.yaml",
        "../project.yaml",
        "questions/../project.yaml",
        "C:/project.yaml",
        "questions\\Q-01.md",
    ] {
        assert!(!is_notebook_data_path(path), "{path}");
    }
}
