//! FR-PRJ-01 and FR-PRJ-02 (S2-T05): creating a project's `_notebook/`
//! layout in a new or existing folder, and reading `project.yaml` back.
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

use common::{make_dir_link, snapshot_outside_notebook_except, TestProject};
use nb_fs::{CreateError, NewProject, ProjectRoot, ReadError};

const PROJECT_YAML: &str =
    "format_version: 1\nid: \"01JAX9Q2B7N4M8T6V3W5Y1Z0KC\"\nname: \"Batch\"\n";
const HYGIENE: [&str; 2] = [".gitignore", ".gitattributes"];

fn new_project() -> NewProject<'static> {
    NewProject {
        project_yaml: PROJECT_YAML,
        bibliography_json: "[]\n",
        evidence_in_git: false,
    }
}

#[test]
fn creates_the_layout_in_a_folder_without_a_notebook() {
    let project = TestProject::without_notebook();

    ProjectRoot::create(project.root(), &new_project()).unwrap();

    assert_eq!(
        project.read("_notebook/project.yaml"),
        PROJECT_YAML.as_bytes()
    );
    assert_eq!(project.read("_notebook/bibliography.json"), b"[]\n");
    assert!(!project.read("_notebook/README.md").is_empty());
    for folder in ["questions", "experiments", "styles"] {
        assert!(
            project.on_disk(&format!("_notebook/{folder}")).is_dir(),
            "_notebook/{folder} should exist"
        );
    }
}

#[test]
fn leaves_the_analysis_files_alone_in_an_existing_folder() {
    let project = TestProject::without_notebook();
    let before = snapshot_outside_notebook_except(project.root(), &HYGIENE);

    ProjectRoot::create(project.root(), &new_project()).unwrap();

    assert_eq!(
        snapshot_outside_notebook_except(project.root(), &HYGIENE),
        before
    );
}

#[test]
fn accepts_an_empty_notebook_folder() {
    let project = TestProject::new();
    assert!(ProjectRoot::create(project.root(), &new_project()).is_ok());
    assert_eq!(
        project.read("_notebook/project.yaml"),
        PROJECT_YAML.as_bytes()
    );
}

#[test]
fn the_created_project_can_be_opened_and_written_to() {
    let project = TestProject::without_notebook();
    let created = ProjectRoot::create(project.root(), &new_project()).unwrap();
    assert_eq!(
        created.project.notebook_dir(),
        ProjectRoot::open(project.root()).unwrap().notebook_dir()
    );
}

#[test]
fn readme_gives_the_recovery_command() {
    let project = TestProject::without_notebook();
    ProjectRoot::create(project.root(), &new_project()).unwrap();
    let readme = String::from_utf8(project.read("_notebook/README.md")).unwrap();
    // Spec A.3.
    assert!(readme.contains("pandoc experiment.md --citeproc"));
    assert!(readme.contains("--bibliography ../../bibliography.json"));
    assert!(readme.contains("--csl ../../styles/nature.csl"));
    assert!(readme.ends_with('\n') && !readme.ends_with("\n\n"));
    assert!(!readme.contains('\r'));
}

#[test]
fn leaves_no_temporary_files() {
    let project = TestProject::without_notebook();
    ProjectRoot::create(project.root(), &new_project()).unwrap();
    assert!(project.temp_files().is_empty());
}

#[test]
fn refuses_when_a_project_already_exists_and_changes_nothing() {
    let project = TestProject::new();
    fs::write(project.on_disk("_notebook/project.yaml"), b"mine\n").unwrap();
    let before = snapshot_outside_notebook_except(project.root(), &[]);

    let error = ProjectRoot::create(project.root(), &new_project()).unwrap_err();

    assert!(matches!(error, CreateError::NotEmpty { .. }), "{error:?}");
    assert_eq!(project.read("_notebook/project.yaml"), b"mine\n");
    assert!(!project.exists("_notebook/README.md"));
    assert_eq!(
        snapshot_outside_notebook_except(project.root(), &[]),
        before
    );
}

#[test]
fn refuses_a_notebook_folder_that_holds_any_file() {
    let project = TestProject::new();
    fs::write(project.on_disk("_notebook/notes.txt"), b"keep\n").unwrap();

    let error = ProjectRoot::create(project.root(), &new_project()).unwrap_err();

    assert!(matches!(error, CreateError::NotEmpty { .. }), "{error:?}");
    assert_eq!(project.read("_notebook/notes.txt"), b"keep\n");
    assert!(!project.exists("_notebook/project.yaml"));
}

#[test]
fn refuses_a_notebook_that_is_a_file() {
    let project = TestProject::without_notebook();
    fs::write(project.on_disk("_notebook"), b"a file\n").unwrap();

    let error = ProjectRoot::create(project.root(), &new_project()).unwrap_err();

    assert!(
        matches!(error, CreateError::NotebookInvalid { .. }),
        "{error:?}"
    );
    assert_eq!(project.read("_notebook"), b"a file\n");
}

#[test]
fn refuses_a_notebook_that_is_a_link() {
    let project = TestProject::without_notebook();
    make_dir_link(&project.on_disk("_notebook"), &project.on_disk("results"));
    let before = snapshot_outside_notebook_except(project.root(), &[]);

    let error = ProjectRoot::create(project.root(), &new_project()).unwrap_err();

    assert!(
        matches!(error, CreateError::NotebookInvalid { .. }),
        "{error:?}"
    );
    assert!(!project.exists("results/project.yaml"));
    assert_eq!(
        snapshot_outside_notebook_except(project.root(), &[]),
        before
    );
}

#[test]
fn refuses_a_notebook_folder_spelt_in_another_case() {
    let project = TestProject::without_notebook();
    fs::create_dir(project.on_disk("_Notebook")).unwrap();

    let error = ProjectRoot::create(project.root(), &new_project()).unwrap_err();

    assert!(
        matches!(error, CreateError::NotebookInvalid { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_project_folder_that_does_not_exist() {
    let project = TestProject::without_notebook();
    let missing = project.on_disk("no-such-folder");

    let error = ProjectRoot::create(&missing, &new_project()).unwrap_err();

    assert!(matches!(error, CreateError::Root { .. }), "{error:?}");
    assert!(!missing.exists());
}

#[test]
fn refuses_a_project_folder_that_is_a_file() {
    let project = TestProject::without_notebook();
    let error = ProjectRoot::create(&project.on_disk("README.md"), &new_project()).unwrap_err();
    assert!(matches!(error, CreateError::Root { .. }), "{error:?}");
}

#[test]
fn reads_project_yaml_as_text() {
    let project = TestProject::without_notebook();
    let created = ProjectRoot::create(project.root(), &new_project()).unwrap();
    assert_eq!(created.project.read_project_yaml().unwrap(), PROJECT_YAML);
    assert_eq!(project.open().read_project_yaml().unwrap(), PROJECT_YAML);
}

#[test]
fn reading_keeps_a_byte_order_mark_and_crlf_for_the_parser() {
    let project = TestProject::new();
    fs::write(
        project.on_disk("_notebook/project.yaml"),
        "\u{feff}format_version: 1\r\n",
    )
    .unwrap();
    // Encoding is normalised by packages/format, the only parser (rule 2).
    assert_eq!(
        project.open().read_project_yaml().unwrap(),
        "\u{feff}format_version: 1\r\n"
    );
}

#[test]
fn reading_a_missing_project_yaml_is_reported() {
    let project = TestProject::new();
    let error = project.open().read_project_yaml().unwrap_err();
    assert!(matches!(error, ReadError::Missing { .. }), "{error:?}");
}

#[test]
fn reading_text_that_is_not_utf8_is_reported_and_leaves_the_file_alone() {
    let project = TestProject::new();
    fs::write(
        project.on_disk("_notebook/project.yaml"),
        [0xff, 0xfe, 0x00],
    )
    .unwrap();
    let error = project.open().read_project_yaml().unwrap_err();
    assert!(matches!(error, ReadError::NotUtf8 { .. }), "{error:?}");
    assert_eq!(project.read("_notebook/project.yaml"), [0xff, 0xfe, 0x00]);
}

#[test]
fn reading_a_project_yaml_that_is_a_folder_is_reported() {
    let project = TestProject::new();
    fs::create_dir(project.on_disk("_notebook/project.yaml")).unwrap();
    assert!(project.open().read_project_yaml().is_err());
}

#[cfg(unix)]
#[test]
fn reading_refuses_a_project_yaml_that_links_outside_the_notebook() {
    let project = TestProject::new();
    std::os::unix::fs::symlink(
        project.on_disk("README.md"),
        project.on_disk("_notebook/project.yaml"),
    )
    .unwrap();
    let error = project.open().read_project_yaml().unwrap_err();
    assert!(
        matches!(error, ReadError::EscapesNotebook { .. }),
        "{error:?}"
    );
}

#[test]
fn a_folder_counts_as_a_project_when_it_holds_project_yaml() {
    let project = TestProject::without_notebook();
    assert!(!ProjectRoot::is_project_folder(project.root()));
    assert!(!ProjectRoot::is_project_folder(&project.on_disk("missing")));

    fs::create_dir(project.on_disk("_notebook")).unwrap();
    assert!(!ProjectRoot::is_project_folder(project.root()));

    fs::write(project.on_disk("_notebook/project.yaml"), PROJECT_YAML).unwrap();
    assert!(ProjectRoot::is_project_folder(project.root()));
}
