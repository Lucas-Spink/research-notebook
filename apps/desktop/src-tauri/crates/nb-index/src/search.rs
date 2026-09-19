use crate::records::FtsKind;
use crate::store::Index;
use crate::IndexError;

/// One full-text match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    /// The notebook file the text came from.
    pub file: String,
    pub kind: FtsKind,
    pub owner: String,
    pub text: String,
}

impl Index {
    pub fn search(&self, _query: &str, _limit: usize) -> Result<Vec<SearchHit>, IndexError> {
        Ok(Vec::new())
    }
}
