use crate::watch::is_notebook_data_path;

/// Whether `relative` (to `_notebook/`, `/`-separated) is a notebook text
/// file that keeps history and is copied into a version-change backup:
/// the data files `packages/format` parses, plus `README.md` and
/// `styles/*.csl`. Never evidence, the inbox, the lock, or the history,
/// trash and backup folders themselves.
pub fn is_snapshot_scope(relative: &str) -> bool {
    if is_notebook_data_path(relative) {
        return true;
    }
    let segments: Vec<&str> = relative.split('/').collect();
    match segments.as_slice() {
        ["README.md"] => true,
        ["styles", name] => !name.starts_with('.') && name.ends_with(".csl"),
        _ => false,
    }
}
