//! The URIs the source details panel hands to the operating system
//! (FR-CIT-04). Each is assembled from parts checked against spec 5.7's
//! grammar, because the opener passes them to `cmd /C start` on Windows,
//! where characters such as `&` and `|` would be read as shell syntax.

use crate::is_item_key;

/// The path segment Zotero's `zotero://` URIs use for a library: `u` is the
/// user library, `g<digits>` a group (spec 5.7).
fn uri_library(library: &str) -> Option<String> {
    if library == "u" {
        return Some("library".to_string());
    }
    let id = library.strip_prefix('g')?;
    (!id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())).then(|| format!("groups/{id}"))
}

/// `zotero://select/...`: shows the item in Zotero's library pane.
pub fn item_uri(library: &str, key: &str) -> Option<String> {
    let library = uri_library(library)?;
    is_item_key(key).then(|| format!("zotero://select/{library}/items/{key}"))
}

/// `zotero://open-pdf/...`: opens a PDF attachment in Zotero's reader.
pub fn pdf_uri(library: &str, attachment_key: &str) -> Option<String> {
    let library = uri_library(library)?;
    is_item_key(attachment_key)
        .then(|| format!("zotero://open-pdf/{library}/items/{attachment_key}"))
}

/// Characters a DOI suffix may hold here. A narrower set than the DOI
/// standard allows, on purpose: every shell and URL metacharacter is
/// outside it, so no escaping is needed and none can be got wrong. A DOI
/// outside it simply gets no link.
fn is_safe_doi_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ';' | '(' | ')' | '/' | ':' | '-')
}

/// `https://doi.org/<doi>` for a plain DOI, else `None`.
pub fn doi_uri(doi: &str) -> Option<String> {
    let (prefix, suffix) = doi.split_once('/')?;
    let registrant = prefix.strip_prefix("10.")?;
    let valid = (4..=9).contains(&registrant.len())
        && registrant.bytes().all(|b| b.is_ascii_digit())
        && !suffix.is_empty()
        && suffix.chars().all(is_safe_doi_char);
    valid.then(|| format!("https://doi.org/{doi}"))
}
