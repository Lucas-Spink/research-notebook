//! Turning an absolute path the person chose into the location
//! `artefacts.yaml` records (ADR-0044 point 1): a root and a path relative
//! to it. Only metadata is read, never the file's bytes.
//!
//! The path is resolved through any links first, so a link inside the
//! project that points elsewhere is judged by where it points (format-v1.md:
//! "A path resolves outside the project root or a registered external root,
//! including by symlink: rejected").

use std::fs;
use std::path::{Component, Path, PathBuf};

use nb_fs::NOTEBOOK_DIR;

use super::super::open::{SourcePath, SourceRoot};
use super::types::{Refusal, SourceLocation};

/// A file that can be captured: where it is, and its size in bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Located {
    pub location: SourceLocation,
    pub size: u64,
}

/// Where `file` sits: under `project_root` (preferred), or under one of
/// `externals` (an external root's id and folder on this machine). A folder
/// in `externals` that does not exist is passed over.
pub(super) fn locate(
    file: &Path,
    project_root: &Path,
    externals: &[(String, PathBuf)],
) -> Result<Located, Refusal> {
    let metadata = fs::metadata(file).map_err(|_| Refusal::Unreadable)?;
    if !metadata.is_file() {
        return Err(Refusal::NotAFile);
    }
    let resolved = file.canonicalize().map_err(|_| Refusal::Unreadable)?;
    let project = project_root
        .canonicalize()
        .map_err(|_| Refusal::Unreadable)?;
    if resolved.starts_with(project.join(NOTEBOOK_DIR)) {
        return Err(Refusal::InsideNotebook);
    }
    let within = |root: &Path, id: &str| -> Option<SourceLocation> {
        let relative = resolved.strip_prefix(root).ok()?;
        location(id, relative)
    };
    let found = within(&project, "project").or_else(|| {
        externals.iter().find_map(|(id, folder)| {
            let folder = folder.canonicalize().ok()?;
            within(&folder, id)
        })
    });
    match found {
        Some(location) => Ok(Located {
            location,
            size: metadata.len(),
        }),
        None => Err(Refusal::OutsideRoots),
    }
}

/// `relative` as a forward-slash `SourcePath` under `root`, or `None` when
/// it has no file name or a segment the format cannot hold.
fn location(root: &str, relative: &Path) -> Option<SourceLocation> {
    let segments: Option<Vec<String>> = relative
        .components()
        .map(|component| match component {
            Component::Normal(part) => part.to_str().map(str::to_owned),
            _ => None,
        })
        .collect();
    let joined = segments?.join("/");
    Some(SourceLocation {
        root: SourceRoot::try_from(root.to_owned()).ok()?,
        path: SourcePath::try_from(joined).ok()?,
    })
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const ROOT_ID: &str = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

    fn folder(prefix: &str) -> TempDir {
        tempfile::Builder::new().prefix(prefix).tempdir().unwrap()
    }

    fn file(at: &Path, relative: &str, bytes: &[u8]) -> PathBuf {
        let path = at.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }

    fn located(root: &str, path: &str, size: u64) -> Located {
        Located {
            location: SourceLocation {
                root: SourceRoot::try_from(root.to_owned()).unwrap(),
                path: SourcePath::try_from(path.to_owned()).unwrap(),
            },
            size,
        }
    }

    /// A folder link, made the way nb-fs's own tests make one: a junction on
    /// Windows, which needs no special privilege, and a symlink elsewhere.
    fn link_folder(link: &Path, target: &Path) {
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, link).unwrap();
        #[cfg(windows)]
        {
            let native = |path: &Path| path.to_string_lossy().replace('/', "\\");
            let output = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(native(link))
                .arg(native(target))
                .output()
                .unwrap();
            assert!(output.status.success(), "mklink /J failed");
        }
    }

    #[test]
    fn a_file_in_the_project_is_located_under_the_project_root() {
        let project = folder("nb-proj-");
        let chosen = file(project.path(), "results/pca/scores.csv", b"a,b\n");
        assert_eq!(
            locate(&chosen, project.path(), &[]),
            Ok(located("project", "results/pca/scores.csv", 4))
        );
    }

    #[test]
    fn a_file_under_an_external_root_is_located_under_that_root() {
        let project = folder("nb-proj-");
        let external = folder("nb-ext-");
        let chosen = file(external.path(), "runs/7/counts.h5", b"12345");
        let externals = [(ROOT_ID.to_owned(), external.path().to_path_buf())];
        assert_eq!(
            locate(&chosen, project.path(), &externals),
            Ok(located(ROOT_ID, "runs/7/counts.h5", 5))
        );
    }

    #[test]
    fn a_file_outside_the_project_and_every_root_is_refused() {
        let project = folder("nb-proj-");
        let elsewhere = folder("nb-else-");
        let chosen = file(elsewhere.path(), "notes.txt", b"x");
        assert_eq!(
            locate(&chosen, project.path(), &[]),
            Err(Refusal::OutsideRoots)
        );
    }

    #[test]
    fn a_file_reached_through_a_link_to_outside_the_project_is_refused() {
        let project = folder("nb-proj-");
        let elsewhere = folder("nb-else-");
        file(elsewhere.path(), "secret.txt", b"x");
        link_folder(&project.path().join("shortcut"), elsewhere.path());
        let through_link = project.path().join("shortcut").join("secret.txt");
        assert_eq!(
            locate(&through_link, project.path(), &[]),
            Err(Refusal::OutsideRoots)
        );
    }

    #[test]
    fn a_file_inside_the_notebook_folder_is_refused() {
        let project = folder("nb-proj-");
        let chosen = file(
            project.path(),
            "_notebook/experiments/EXP-001/evidence/a.png",
            b"x",
        );
        assert_eq!(
            locate(&chosen, project.path(), &[]),
            Err(Refusal::InsideNotebook)
        );
    }

    #[test]
    fn a_folder_or_a_missing_file_is_refused() {
        let project = folder("nb-proj-");
        fs::create_dir_all(project.path().join("results")).unwrap();
        assert_eq!(
            locate(&project.path().join("results"), project.path(), &[]),
            Err(Refusal::NotAFile)
        );
        assert_eq!(
            locate(&project.path().join("gone.csv"), project.path(), &[]),
            Err(Refusal::Unreadable)
        );
    }

    #[test]
    fn an_external_root_whose_folder_is_gone_is_passed_over() {
        let project = folder("nb-proj-");
        let external = folder("nb-ext-");
        let chosen = file(external.path(), "a.csv", b"x");
        let externals = [
            (ROOT_ID.to_owned(), project.path().join("no-such-folder")),
            (
                "01JAX9Q2B7N4M8T6V3W5Y1Z0KD".to_owned(),
                external.path().to_path_buf(),
            ),
        ];
        assert_eq!(
            locate(&chosen, project.path(), &externals),
            Ok(located("01JAX9Q2B7N4M8T6V3W5Y1Z0KD", "a.csv", 1))
        );
    }
}
