//! What the index stores for one notebook file. `nb-index` never sees file
//! text: `packages/format` is the only parser (AGENTS.md rule 2), so the
//! caller parses a file there and hands over these rows. Every row is
//! derived data; deleting the index loses nothing (P1).
//!
//! Fields are plain text and numbers as the parser validated them. The rows
//! carry no file path: the index files each row under the file it came from,
//! so replacing or removing a file replaces or removes exactly its rows.

/// The rows of one file. A file of another kind leaves its other lists empty.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FileRecords {
    pub questions: Vec<QuestionRow>,
    pub experiments: Vec<ExperimentRow>,
    pub artefacts: Vec<ArtefactRow>,
    pub versions: Vec<VersionRow>,
    pub groups: Vec<GroupRow>,
    pub memberships: Vec<MembershipRow>,
    pub refs: Vec<RefRow>,
    pub citations: Vec<CitationRow>,
    pub sources: Vec<SourceRow>,
    pub fts: Vec<FtsEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuestionRow {
    pub id: String,
    /// The question's `ref` key, such as `Q-01`.
    pub reference: String,
    pub title: String,
    pub created: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExperimentRow {
    pub id: String,
    pub reference: String,
    /// The owning question's id.
    pub question: String,
    pub title: String,
    pub status: String,
    pub started: Option<String>,
    pub completed: Option<String>,
    pub created: String,
    pub updated: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtefactRow {
    pub id: String,
    /// The experiment id whose `artefacts.yaml` holds it.
    pub experiment: String,
    pub name: String,
    pub role: String,
    pub mode: String,
    pub kind: String,
    pub source_root: String,
    pub source_path: String,
    pub created: String,
    /// `link.sha256` and `link.size`, present for link mode only.
    pub link_sha256: Option<String>,
    pub link_size: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionRow {
    pub artefact: String,
    pub number: i64,
    pub file: String,
    pub sha256: String,
    pub size: i64,
    pub captured: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GroupRow {
    pub id: String,
    pub experiment: String,
    /// The enclosing group, or `None` for a top-level group.
    pub parent: Option<String>,
    pub name: String,
    /// Display order among its siblings.
    pub position: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MembershipRow {
    pub group: String,
    pub artefact: String,
    /// Display order within the group.
    pub position: i64,
}

/// An artefact reference found in a section (spec 5.6).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefRow {
    pub experiment: String,
    pub section: String,
    pub artefact: String,
    /// The version named by the reference, absent for link mode.
    pub version: Option<i64>,
    /// Character offset of the reference in the section text.
    pub offset: i64,
}

/// One citation in a section (spec 5.7).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CitationRow {
    pub experiment: String,
    pub section: String,
    pub citekey: String,
    /// Which bracketed cluster of the section holds it.
    pub cluster: i64,
    /// Place within the cluster.
    pub position: i64,
}

/// A bibliography entry (spec 5.9).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRow {
    pub citekey: String,
    pub title: Option<String>,
    pub status: String,
}

/// What a full-text entry came from (spec 6.6).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FtsKind {
    Title,
    Section,
    Name,
    Filename,
    SourceTitle,
}

impl FtsKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Title => "title",
            Self::Section => "section",
            Self::Name => "name",
            Self::Filename => "filename",
            Self::SourceTitle => "source_title",
        }
    }

    pub(crate) fn from_db(text: &str) -> Option<Self> {
        Some(match text {
            "title" => Self::Title,
            "section" => Self::Section,
            "name" => Self::Name,
            "filename" => Self::Filename,
            "source_title" => Self::SourceTitle,
            _ => return None,
        })
    }
}

/// One searchable piece of text and the record it belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FtsEntry {
    pub kind: FtsKind,
    /// The id of the question, experiment, artefact or source (its citekey)
    /// the text belongs to.
    pub owner: String,
    pub text: String,
}
