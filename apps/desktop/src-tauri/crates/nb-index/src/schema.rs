/// The layout version this build writes. Any other value found in a
/// database triggers a full rebuild (spec 6.6).
pub const SCHEMA_VERSION: i64 = 1;

/// Every table, in the order the dump lists them.
pub(crate) const TABLES: [&str; 11] = [
    "files",
    "questions",
    "experiments",
    "artefacts",
    "versions",
    "groups",
    "memberships",
    "refs",
    "citations",
    "sources",
    "fts",
];
