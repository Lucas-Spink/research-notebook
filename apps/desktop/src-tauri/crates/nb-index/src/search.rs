use crate::records::FtsKind;
use crate::store::Index;
use crate::IndexError;

/// One full-text match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    /// The notebook file the text came from, project-relative.
    pub file: String,
    pub kind: FtsKind,
    /// The id of the record the text belongs to.
    pub owner: String,
    pub text: String,
}

impl Index {
    /// Full-text search over titles, sections, display names, filenames and
    /// source titles (spec 6.6), best matches first. Every word must match,
    /// and each matches as a word start, ignoring case and accents. The
    /// query is text, not FTS5 syntax: quotes, operators and brackets are
    /// searched for, never interpreted.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, IndexError> {
        let Some(expression) = match_expression(query) else {
            return Ok(Vec::new());
        };
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let mut statement = self.conn.prepare_cached(
            "SELECT file, kind, owner, text FROM fts WHERE fts MATCH ?1 \
             ORDER BY rank, rowid LIMIT ?2",
        )?;
        let rows = statement.query_map(rusqlite::params![expression, limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut hits = Vec::new();
        for row in rows {
            let (file, kind, owner, text) = row?;
            let kind = FtsKind::from_db(&kind).ok_or_else(|| IndexError::Damaged {
                reason: format!("unknown full-text kind `{kind}`"),
            })?;
            hits.push(SearchHit {
                file,
                kind,
                owner,
                text,
            });
        }
        Ok(hits)
    }
}

/// Turns typed text into an FTS5 expression: each word a quoted prefix
/// phrase, all of them required. Words with no letter or digit are dropped,
/// since FTS5 would index nothing for them. `None` if no word is left.
fn match_expression(query: &str) -> Option<String> {
    let words: Vec<String> = query
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .map(|word| format!("\"{}\"*", word.replace('"', "\"\"")))
        .collect();
    (!words.is_empty()).then(|| words.join(" "))
}
