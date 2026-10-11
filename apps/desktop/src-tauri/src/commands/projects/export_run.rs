//! The stamp that names one HTML or PDF export run (issue #102). It crosses the
//! IPC boundary as text and is checked on arrival, so a command never holds a
//! raw string that could name a path.

use nb_archive::ExportStamp;
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

/// An export run's stamp, such as `2026-10-11T14-30-05Z`: the UTC instant it
/// was made, with `-` for the colons.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ExportRun(String);

impl ExportRun {
    /// The validated stamp `nb-archive` names the run's folder or file by.
    pub(crate) fn stamp(&self) -> Result<ExportStamp, String> {
        ExportStamp::parse(&self.0).map_err(|e| e.to_string())
    }
}

impl TryFrom<String> for ExportRun {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        ExportStamp::parse(&text).map_err(|e| e.to_string())?;
        Ok(Self(text))
    }
}

// Written by hand for the same reason as `VersionPath`: `#[serde(try_from)]`
// makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for ExportRun {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
// The workspace denies unwrap outside tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn a_well_formed_stamp_is_accepted_from_the_webview() {
        let run: ExportRun = serde_json::from_str("\"2026-10-11T14-30-05Z\"").unwrap();
        assert_eq!(run.stamp().unwrap().as_str(), "2026-10-11T14-30-05Z");
    }

    #[test]
    fn anything_else_is_refused_before_a_command_runs() {
        for bad in ["\"../x\"", "\"2026-10-11T14:30:05Z\"", "\"\"", "\"a/b\""] {
            assert!(serde_json::from_str::<ExportRun>(bad).is_err(), "{bad}");
        }
    }
}
