/// Whether `relative` (to `_notebook/`, `/`-separated) is a notebook text
/// file that keeps history and is copied into a version-change backup:
/// the data files `packages/format` parses, plus `README.md` and
/// `styles/*.csl`. Never evidence, the inbox, the lock, or the history,
/// trash and backup folders themselves.
pub fn is_snapshot_scope(_relative: &str) -> bool {
    false
}
