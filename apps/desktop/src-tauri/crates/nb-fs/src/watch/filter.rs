/// Whether `relative` (relative to `_notebook/`, `/`-separated) is a notebook
/// data file: one of the files `packages/format` parses (format-v1.md
/// section 1). Everything else in `_notebook/` is either not parsed
/// (evidence, history, trash, inbox, the lock, the README) or is a temporary
/// file of an atomic write, whose name starts with a dot (ADR-0020).
///
/// `nb-index` scans the same set; `tests/watch_agreement.rs` there keeps the
/// two in step.
pub fn is_notebook_data_path(relative: &str) -> bool {
    let segments: Vec<&str> = relative.split('/').collect();
    match segments.as_slice() {
        ["project.yaml" | "bibliography.json"] => true,
        ["questions", name] => visible(name) && name.ends_with(".md"),
        ["experiments", folder, "experiment.md" | "artefacts.yaml"] => visible(folder),
        _ => false,
    }
}

/// Whether `relative` is a folder that holds notebook data files or the
/// folders that do: `questions`, `experiments` and each folder in it. When
/// one of these is removed or renamed, some platforms report only the folder
/// and not the files that went with it.
pub fn is_notebook_data_folder(relative: &str) -> bool {
    let segments: Vec<&str> = relative.split('/').collect();
    match segments.as_slice() {
        ["questions" | "experiments"] => true,
        ["experiments", folder] => visible(folder),
        _ => false,
    }
}

/// A name that is not empty and not hidden, which also excludes `.` and `..`.
fn visible(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.')
}
