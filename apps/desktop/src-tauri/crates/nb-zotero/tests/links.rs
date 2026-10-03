//! S5-T07 (FR-CIT-04): the URIs the source details panel opens are built
//! only from validated parts, so nothing a cached bibliography holds can
//! change which program is launched or smuggle shell syntax into `cmd`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use nb_zotero::links::{doi_uri, item_uri, pdf_uri};

#[test]
fn links_select_an_item_in_the_user_library() {
    assert_eq!(
        item_uri("u", "ABCD2345").as_deref(),
        Some("zotero://select/library/items/ABCD2345")
    );
}

#[test]
fn links_select_an_item_in_a_group_library() {
    assert_eq!(
        item_uri("g123", "ABCD2345").as_deref(),
        Some("zotero://select/groups/123/items/ABCD2345")
    );
}

#[test]
fn links_open_a_pdf_attachment_in_either_library_kind() {
    assert_eq!(
        pdf_uri("u", "WXYZ6789").as_deref(),
        Some("zotero://open-pdf/library/items/WXYZ6789")
    );
    assert_eq!(
        pdf_uri("g42", "WXYZ6789").as_deref(),
        Some("zotero://open-pdf/groups/42/items/WXYZ6789")
    );
}

#[test]
fn links_refuse_a_malformed_library_or_key() {
    for library in ["", "x", "g", "g1/../2", "g1a", "u/", "U"] {
        assert_eq!(item_uri(library, "ABCD2345"), None, "library {library:?}");
        assert_eq!(pdf_uri(library, "ABCD2345"), None, "library {library:?}");
    }
    for key in [
        "",
        "abcd2345",
        "ABCD234",
        "ABCD23456",
        "ABCD234&",
        "ABCD2341",
    ] {
        assert_eq!(item_uri("u", key), None, "key {key:?}");
        assert_eq!(pdf_uri("u", key), None, "key {key:?}");
    }
}

#[test]
fn links_open_a_plain_doi_at_doi_org() {
    assert_eq!(
        doi_uri("10.1000/xyz-123_(a);b:c").as_deref(),
        Some("https://doi.org/10.1000/xyz-123_(a);b:c")
    );
}

#[test]
fn links_refuse_a_doi_with_shell_or_url_syntax() {
    for doi in [
        "",
        "not a doi",
        "10.1000/a&calc",
        "10.1000/a|b",
        "10.1000/a^b",
        "10.1000/a%41",
        "10.1000/a\"b",
        "10.1000/a b",
        "10.1000/a<b>",
        "10.1000/a?x=1",
        "10.1000/a#frag",
        "javascript:alert(1)",
        "https://evil.example/10.1000/x",
        "10.1000/",
        "10.1000/a\nb",
    ] {
        assert_eq!(doi_uri(doi), None, "doi {doi:?}");
    }
}
