//! The name of one export run (issue #102): the UTC instant it was made, such
//! as `2026-10-11T14-30-05Z`. Each HTML and PDF export is kept under its own
//! stamp, so a later run never replaces an earlier one. The shape is checked
//! here, not trusted from the caller, so a stamp can never carry a separator,
//! a dot-dot or a drive letter into a path.

/// A validated export stamp: `YYYY-MM-DDTHH-MM-SSZ`, digits and fixed
/// separators only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportStamp(String);

/// The text is not an export stamp.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidStamp;

// By hand: this crate has no `thiserror`, and one message is not worth the dependency.
impl std::fmt::Display for InvalidStamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("an export stamp looks like 2026-10-11T14-30-05Z")
    }
}

impl std::error::Error for InvalidStamp {}

/// `D` is a digit, any other character is that character.
const SHAPE: &[u8; 20] = b"DDDD-DD-DDTDD-DD-DDZ";

impl ExportStamp {
    /// Accepts exactly the shape `YYYY-MM-DDTHH-MM-SSZ`.
    pub fn parse(text: &str) -> Result<Self, InvalidStamp> {
        let bytes = text.as_bytes();
        let fits = bytes.len() == SHAPE.len()
            && bytes.iter().zip(SHAPE).all(|(&found, &wanted)| {
                if wanted == b'D' {
                    found.is_ascii_digit()
                } else {
                    found == wanted
                }
            });
        if fits {
            Ok(Self(text.to_owned()))
        } else {
            Err(InvalidStamp)
        }
    }

    /// The stamp as text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn accepts_the_shape_the_application_writes() {
        assert_eq!(
            ExportStamp::parse("2026-10-11T14-30-05Z").map(|s| s.0),
            Ok("2026-10-11T14-30-05Z".to_owned())
        );
    }

    #[test]
    fn refuses_anything_that_could_change_a_path() {
        for bad in [
            "",
            "..",
            "../2026-10-11T14-30-05Z",
            "2026-10-11T14:30:05Z",
            "2026-10-11T14-30-05",
            "2026-10-11T14-30-05Z/",
            "2026-10-11T14-30-05Z\\x",
            "C:-10-11T14-30-05Z",
            " 026-10-11T14-30-05Z",
            "2026-10-11t14-30-05z",
        ] {
            assert_eq!(ExportStamp::parse(bad), Err(InvalidStamp), "{bad:?}");
        }
    }

    proptest! {
        /// Whatever the text, an accepted stamp is twenty ASCII characters of
        /// digits and `-`, `T`, `Z`: never a separator, a dot or a colon.
        #[test]
        fn an_accepted_stamp_is_always_a_plain_file_name(text in ".{0,40}") {
            if let Ok(stamp) = ExportStamp::parse(&text) {
                prop_assert_eq!(stamp.as_str().len(), 20);
                prop_assert!(stamp
                    .as_str()
                    .chars()
                    .all(|c| c.is_ascii_digit() || matches!(c, '-' | 'T' | 'Z')));
            }
        }

        #[test]
        fn every_well_formed_stamp_is_accepted(
            y in 0u32..10000, mo in 0u32..100, d in 0u32..100,
            h in 0u32..100, mi in 0u32..100, s in 0u32..100,
        ) {
            let text = format!("{y:04}-{mo:02}-{d:02}T{h:02}-{mi:02}-{s:02}Z");
            prop_assert!(ExportStamp::parse(&text).is_ok());
        }
    }
}
