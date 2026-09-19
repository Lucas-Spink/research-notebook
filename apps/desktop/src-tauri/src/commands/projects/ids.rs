use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

/// Whether `text` is a ULID: 26 characters of Crockford Base32, uppercase,
/// the first at most `7` so the value fits 128 bits (spec 5.2).
fn is_ulid(text: &str) -> bool {
    const CROCKFORD: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut chars = text.chars();
    text.len() == 26
        && matches!(chars.next(), Some('0'..='7'))
        && chars.all(|c| CROCKFORD.contains(c))
}

/// A ULID that has been checked, so a command never receives free text where
/// an identifier belongs. The value is only used as a key in the settings
/// file, never as part of a path.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Type)]
pub struct Ulid(String);

impl Ulid {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for Ulid {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        if is_ulid(&text) {
            Ok(Self(text))
        } else {
            Err("expected an uppercase Crockford Base32 ULID".to_owned())
        }
    }
}

// Written by hand rather than with `#[serde(try_from)]`, which makes the
// generated bindings split this type into two identical aliases.
impl<'de> Deserialize<'de> for Ulid {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_ulid() {
        assert!(Ulid::try_from("01JAX9Q2B7N4M8T6V3W5Y1Z0KC".to_owned()).is_ok());
    }

    #[test]
    fn rejects_everything_else() {
        for bad in [
            "",
            "01JAX9Q2B7N4M8T6V3W5Y1Z0K",
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KCC",
            "01jax9q2b7n4m8t6v3w5y1z0kc",
            "81JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KI",
            "../../../etc/passwd/../../..",
            "01JAX9Q2B7N4M8T6V3W5Y1Z0K\u{e9}",
        ] {
            assert!(Ulid::try_from(bad.to_owned()).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn deserialising_checks_the_value() {
        assert!(serde_json::from_str::<Ulid>("\"01JAX9Q2B7N4M8T6V3W5Y1Z0KC\"").is_ok());
        assert!(serde_json::from_str::<Ulid>("\"nope\"").is_err());
    }
}
