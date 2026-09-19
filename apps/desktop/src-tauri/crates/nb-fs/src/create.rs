//! Creating a project (FR-PRJ-01): the `_notebook/` layout, its first files,
//! and the repository hygiene entries.

use std::fs;
use std::io;
use std::path::Path;

use crate::error::{CreateError, WriteError};
use crate::hygiene::{HygieneFile, HygieneOutcome};
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::readme::README;

/// Folders created empty so a new project has the layout of spec 5.1. The
/// others (`inbox/`, `backups/`, `.history/`, `.trash/`, `exports/`) are
/// created by the code that first needs them.
const FOLDERS: [&str; 3] = [
    "_notebook/questions",
    "_notebook/experiments",
    "_notebook/styles",
];

/// What a new project starts with. The texts come from `packages/format`, the
/// only code that writes notebook files' contents; this crate stores them
/// without reading them.
#[derive(Debug, Clone, Copy)]
pub struct NewProject<'a> {
    /// The canonical text of `project.yaml`.
    pub project_yaml: &'a str,
    /// The canonical text of an empty `bibliography.json`.
    pub bibliography_json: &'a str,
    /// The project's `capture.evidence_in_git`, which decides whether
    /// `.gitignore` excludes the evidence and methods folders (spec 5.12).
    pub evidence_in_git: bool,
}

/// A project that was just created.
#[derive(Debug)]
pub struct Created {
    pub project: ProjectRoot,
    /// What happened to each repository hygiene file. A failure here does
    /// not undo the project.
    pub hygiene: Vec<(HygieneFile, HygieneOutcome)>,
}

impl ProjectRoot {
    /// Creates a project in the folder `root`, which must already exist. The
    /// folder may hold anything: only `_notebook/` is created inside it, and
    /// the two hygiene files are appended to.
    ///
    /// Nothing is overwritten. It refuses unless `_notebook/` is absent or an
    /// empty folder, so an existing project, or anything a person put there,
    /// is never replaced. `project.yaml` is written last: a project exists
    /// once that file does, and a failure earlier leaves no project. It can
    /// leave the folders and files already made, which the next attempt will
    /// then refuse until they are removed by hand.
    pub fn create(root: &Path, new: &NewProject<'_>) -> Result<Created, CreateError> {
        let canonical = fs::canonicalize(root).map_err(|source| CreateError::Root {
            path: root.to_path_buf(),
            source,
        })?;
        if !canonical.is_dir() {
            return Err(CreateError::Root {
                path: root.to_path_buf(),
                source: io::Error::new(io::ErrorKind::NotADirectory, "not a folder"),
            });
        }
        prepare_notebook(root, &canonical)?;
        let project = ProjectRoot::open(root)?;

        for folder in FOLDERS {
            project.create_folder(&relative(folder)?)?;
        }
        project.write_atomic(&relative("_notebook/README.md")?, README.as_bytes())?;
        project.write_atomic(
            &relative("_notebook/bibliography.json")?,
            new.bibliography_json.as_bytes(),
        )?;
        project.write_atomic(
            &relative("_notebook/project.yaml")?,
            new.project_yaml.as_bytes(),
        )?;

        let hygiene = HygieneFile::ALL
            .into_iter()
            .map(|file| (file, project.add_hygiene(file, new.evidence_in_git)))
            .collect();
        Ok(Created { project, hygiene })
    }
}

fn relative(path: &str) -> Result<ProjectRelPath, WriteError> {
    Ok(ProjectRelPath::parse(path)?)
}

/// Makes sure `_notebook/` in `canonical_root` is a real, empty folder,
/// creating it if absent. Anything else is refused untouched.
fn prepare_notebook(root: &Path, canonical_root: &Path) -> Result<(), CreateError> {
    let invalid = || CreateError::NotebookInvalid {
        path: root.to_path_buf(),
    };
    // A folder spelt `_Notebook` is the same folder on a case-insensitive
    // disk and a different one elsewhere; either way it is ambiguous.
    let entries = fs::read_dir(canonical_root).map_err(|source| CreateError::Root {
        path: root.to_path_buf(),
        source,
    })?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.eq_ignore_ascii_case(NOTEBOOK_DIR) && name != NOTEBOOK_DIR {
            return Err(invalid());
        }
    }

    let notebook = canonical_root.join(NOTEBOOK_DIR);
    match fs::symlink_metadata(&notebook) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&notebook).map_err(|source| CreateError::Io {
                operation: "create folder",
                path: root.to_path_buf(),
                source,
            })
        }
        Err(source) => Err(CreateError::Io {
            operation: "inspect",
            path: root.to_path_buf(),
            source,
        }),
        Ok(meta) => {
            if meta.file_type().is_symlink()
                || !meta.is_dir()
                || fs::canonicalize(&notebook).ok().as_deref() != Some(notebook.as_path())
            {
                return Err(invalid());
            }
            let mut entries = fs::read_dir(&notebook).map_err(|source| CreateError::Io {
                operation: "read folder",
                path: root.to_path_buf(),
                source,
            })?;
            if entries.next().is_some() {
                return Err(CreateError::NotEmpty {
                    path: root.to_path_buf(),
                });
            }
            Ok(())
        }
    }
}
