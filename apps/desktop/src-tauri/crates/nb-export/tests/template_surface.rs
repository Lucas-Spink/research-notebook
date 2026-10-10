//! The advisories ignored in `deny.toml` for the Typst dependency chain
//! (ADR-0056) are only unreachable while the fixed template stays small. This
//! fails if the template starts to load a CSL style, a custom syntax, a
//! bibliography, a file or a package, or the exporter starts to load any
//! font other than the embedded ones.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

const TEMPLATE: &str = include_str!("../src/project.typ");
const PROJECT_RS: &str = include_str!("../src/project.rs");
const WORLD_RS: &str = include_str!("../src/world.rs");

/// The template without its comment lines, which may name things it does not use.
fn code() -> String {
    TEMPLATE
        .lines()
        .filter(|line| !line.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn the_template_loads_nothing_that_parses_xml_yaml_syntaxes_or_packages() {
    let code = code();
    for forbidden in [
        "bibliography(", // reaches the CSL (XML) parser through `style:`
        "cite(",
        "syntaxes:", // custom syntax definitions are YAML
        "theme:",
        "xml(",
        "yaml(",
        "toml(",
        "csv(",
        "cbor(",
        "read(",
        "image(",
        "#import",
        "#include",
        "@preview",
        "@local",
        "eval(",
        "plugin(",
    ] {
        assert!(
            !code.contains(forbidden),
            "the template must not use `{forbidden}`"
        );
    }
}

#[test]
fn the_template_reads_only_its_own_data_and_attaches_the_two_json_files() {
    let code = code();
    assert_eq!(code.matches("json(\"/data.json\")").count(), 1);
    assert_eq!(code.matches("pdf.attach(").count(), 2);
    assert!(code.contains("\"/notebook.json\""));
    assert!(code.contains("\"/bibliography.json\""));
}

#[test]
fn only_the_embedded_fonts_are_ever_loaded() {
    assert!(WORLD_RS.contains("typst_kit::fonts::embedded()"));
    for forbidden in ["fonts::system", "FontSearcher", "search_system", "fontdb"] {
        assert!(
            !WORLD_RS.contains(forbidden) && !PROJECT_RS.contains(forbidden),
            "fonts must not be searched for: `{forbidden}`"
        );
    }
}
