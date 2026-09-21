//! Which files keep history and go into a version-change backup.

use nb_fs::history::is_snapshot_scope;

#[test]
fn the_data_files_readme_and_styles_are_in_scope() {
    for relative in [
        "project.yaml",
        "bibliography.json",
        "README.md",
        "questions/Q-001.md",
        "experiments/EXP-001/experiment.md",
        "experiments/EXP-001/artefacts.yaml",
        "styles/nature.csl",
    ] {
        assert!(is_snapshot_scope(relative), "{relative}");
    }
}

#[test]
fn everything_else_is_out_of_scope() {
    for relative in [
        "",
        ".lock",
        "inbox/req-1/request.json",
        "inbox/req-1/payload.csv",
        "experiments/EXP-001/evidence/plot.csv",
        "experiments/EXP-001/methods/run.R",
        "experiments/EXP-001/notes.md",
        "experiments/EXP-001/sub/experiment.md",
        ".history/experiments/EXP-001/experiment.md/2026-09-21T10-15-00Z.md",
        ".trash/2026-09-21T10-15-00Z/questions/Q-001.md",
        "backups/2026-09-21T10-15-00Z-before-0.2.0/project.yaml",
        "exports/report.pdf",
        "questions/.hidden.md",
        "questions/Q-001.txt",
        "questions/sub/Q-002.md",
        "styles/nested/x.csl",
        "styles/nature.xml",
        ".project.yaml.4242.0.tmp",
        "questions/.Q-001.md.4242.0.tmp",
        "README.md/extra",
        "Readme.md",
    ] {
        assert!(!is_snapshot_scope(relative), "{relative:?}");
    }
}
