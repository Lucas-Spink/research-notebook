//! Spec 5.12 (S2-T05): the repository hygiene entries added to the project
//! root `.gitignore` and `.gitattributes` when a project is created. These
//! are the only files the application writes outside `_notebook/`, so the
//! tests are strict about what may change: existing lines are never removed
//! or altered, and nothing else at the root is touched.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;

use common::{snapshot_outside_notebook_except, TestProject};
use nb_fs::hygiene::{append_missing_lines, HygieneFile, HygieneOutcome};
use nb_fs::{NewProject, ProjectRoot};
use proptest::prelude::*;

fn create(project: &TestProject, evidence_in_git: bool) -> nb_fs::Created {
    ProjectRoot::create(
        project.root(),
        &NewProject {
            project_yaml: "format_version: 1\n",
            bibliography_json: "[]\n",
            evidence_in_git,
        },
    )
    .unwrap()
}

fn lines(bytes: &[u8]) -> Vec<String> {
    String::from_utf8(bytes.to_vec())
        .unwrap()
        .lines()
        .map(str::to_owned)
        .collect()
}

#[test]
fn gitignore_lists_the_spec_entries() {
    assert_eq!(
        HygieneFile::GitIgnore.lines(false),
        [
            "_notebook/.lock",
            "_notebook/.history/",
            "_notebook/.trash/",
            "_notebook/inbox/",
            "_notebook/backups/",
            "_notebook/experiments/*/evidence/",
            "_notebook/experiments/*/methods/",
        ]
    );
}

#[test]
fn gitignore_leaves_out_evidence_and_methods_when_evidence_is_in_git() {
    assert_eq!(
        HygieneFile::GitIgnore.lines(true),
        [
            "_notebook/.lock",
            "_notebook/.history/",
            "_notebook/.trash/",
            "_notebook/inbox/",
            "_notebook/backups/",
        ]
    );
}

#[test]
fn gitattributes_lists_the_spec_entries() {
    let expected = [
        "_notebook/**/*.md text eol=lf",
        "_notebook/**/*.yaml text eol=lf",
        "_notebook/**/*.json text eol=lf",
        "_notebook/**/*.csl text eol=lf",
    ];
    assert_eq!(HygieneFile::GitAttributes.lines(false), expected);
    assert_eq!(HygieneFile::GitAttributes.lines(true), expected);
}

#[test]
fn creates_both_files_when_absent() {
    let project = TestProject::without_notebook();
    let created = create(&project, false);

    let ignore = lines(&project.read(".gitignore"));
    assert_eq!(ignore[0], "# .gitignore (added by Research Notebook)");
    assert_eq!(ignore[1..], HygieneFile::GitIgnore.lines(false));
    let attributes = lines(&project.read(".gitattributes"));
    assert_eq!(
        attributes[0],
        "# .gitattributes (added by Research Notebook)"
    );
    assert_eq!(attributes[1..], HygieneFile::GitAttributes.lines(false));

    assert_eq!(created.hygiene.len(), 2);
    assert!(created
        .hygiene
        .iter()
        .all(|(_, outcome)| matches!(outcome, HygieneOutcome::Added)));
}

#[test]
fn omits_the_evidence_entries_when_evidence_is_in_git() {
    let project = TestProject::without_notebook();
    create(&project, true);
    let ignore = lines(&project.read(".gitignore"));
    assert!(!ignore
        .iter()
        .any(|l| l.contains("evidence") || l.contains("methods")));
    assert!(ignore.contains(&"_notebook/.lock".to_owned()));
}

#[test]
fn keeps_existing_lines_and_appends_after_them() {
    let project = TestProject::without_notebook();
    let original = b"target/\n*.log\n# my notes\n";
    fs::write(project.on_disk(".gitignore"), original).unwrap();

    create(&project, false);

    let after = project.read(".gitignore");
    assert!(
        after.starts_with(original),
        "existing lines must come first"
    );
    assert!(lines(&after).contains(&"_notebook/.trash/".to_owned()));
}

#[test]
fn adds_a_line_break_when_the_last_line_has_none() {
    let project = TestProject::without_notebook();
    fs::write(project.on_disk(".gitignore"), b"target/").unwrap();

    create(&project, false);

    let after = lines(&project.read(".gitignore"));
    assert_eq!(after[0], "target/");
    assert_eq!(after[1], "# .gitignore (added by Research Notebook)");
}

#[test]
fn follows_the_line_endings_of_an_existing_file() {
    let project = TestProject::without_notebook();
    fs::write(
        project.on_disk(".gitattributes"),
        b"* text=auto\r\n*.png binary\r\n",
    )
    .unwrap();

    create(&project, false);

    let after = project.read(".gitattributes");
    let text = String::from_utf8(after).unwrap();
    assert!(text.starts_with("* text=auto\r\n*.png binary\r\n"));
    assert!(
        !text.replace("\r\n", "").contains('\n'),
        "every line break should stay CRLF: {text:?}"
    );
}

#[test]
fn adds_only_the_entries_that_are_missing() {
    let project = TestProject::without_notebook();
    fs::write(
        project.on_disk(".gitignore"),
        b"_notebook/.lock\n_notebook/inbox/\n",
    )
    .unwrap();

    create(&project, false);

    let after = lines(&project.read(".gitignore"));
    for line in HygieneFile::GitIgnore.lines(false) {
        assert_eq!(
            after.iter().filter(|l| l.as_str() == line).count(),
            1,
            "{line} should appear exactly once"
        );
    }
}

#[test]
fn a_file_that_already_has_every_entry_is_not_rewritten() {
    let project = TestProject::without_notebook();
    let mut content = String::from("# mine\n");
    for line in HygieneFile::GitIgnore.lines(false) {
        content.push_str(line);
        content.push('\n');
    }
    fs::write(project.on_disk(".gitignore"), &content).unwrap();
    let modified = fs::metadata(project.on_disk(".gitignore"))
        .unwrap()
        .modified()
        .unwrap();

    let created = create(&project, false);

    assert_eq!(project.read(".gitignore"), content.as_bytes());
    assert_eq!(
        fs::metadata(project.on_disk(".gitignore"))
            .unwrap()
            .modified()
            .unwrap(),
        modified
    );
    assert!(created
        .hygiene
        .iter()
        .any(|(file, outcome)| *file == HygieneFile::GitIgnore
            && matches!(outcome, HygieneOutcome::Unchanged)));
}

#[test]
fn touches_nothing_else_at_the_project_root() {
    let project = TestProject::without_notebook();
    let before =
        snapshot_outside_notebook_except(project.root(), &[".gitignore", ".gitattributes"]);
    create(&project, false);
    assert_eq!(
        snapshot_outside_notebook_except(project.root(), &[".gitignore", ".gitattributes"]),
        before
    );
}

#[test]
fn a_hygiene_file_that_cannot_be_written_does_not_undo_the_project() {
    let project = TestProject::without_notebook();
    // A folder where the file should be: refused, never replaced.
    fs::create_dir(project.on_disk(".gitignore")).unwrap();

    let created = create(&project, false);

    assert!(project.exists("_notebook/project.yaml"));
    assert!(project.on_disk(".gitignore").is_dir());
    assert!(created.hygiene.iter().any(|(file, outcome)| {
        *file == HygieneFile::GitIgnore && matches!(outcome, HygieneOutcome::Failed(_))
    }));
    // The other file is still handled.
    assert!(project.exists(".gitattributes"));
}

#[test]
fn applying_the_entries_twice_changes_nothing_the_second_time() {
    let header = HygieneFile::GitIgnore.header();
    let wanted = HygieneFile::GitIgnore.lines(false);
    let once = append_missing_lines(b"target/\n", header, &wanted).unwrap();
    assert_eq!(append_missing_lines(&once, header, &wanted), None);
}

proptest! {
    // Whatever the existing file holds, its bytes come first, every wanted
    // entry is present afterwards, and a second application is a no-op.
    #[test]
    fn existing_content_is_never_removed_or_altered(
        existing in proptest::collection::vec(any::<u8>(), 0..300),
        crlf in any::<bool>(),
    ) {
        let mut existing = existing;
        if crlf {
            existing.extend_from_slice(b"\r\nkeep\r\n");
        }
        let header = HygieneFile::GitAttributes.header();
        let wanted = HygieneFile::GitAttributes.lines(false);

        if let Some(after) = append_missing_lines(&existing, header, &wanted) {
            prop_assert!(after.starts_with(&existing) || after.starts_with(&[existing.as_slice(), b"\n"].concat()) || after.starts_with(&[existing.as_slice(), b"\r\n"].concat()));
            for line in &wanted {
                prop_assert!(
                    after.split(|b| *b == b'\n').any(|l| l.strip_suffix(b"\r").unwrap_or(l) == line.as_bytes()),
                    "{line} missing"
                );
            }
            prop_assert_eq!(append_missing_lines(&after, header, &wanted), None);
        } else {
            // Nothing was added, so every wanted entry was already there.
            for line in &wanted {
                prop_assert!(
                    existing.split(|b| *b == b'\n').any(|l| l.strip_suffix(b"\r").unwrap_or(l) == line.as_bytes())
                );
            }
        }
    }
}
