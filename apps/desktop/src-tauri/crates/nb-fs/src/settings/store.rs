use std::fs;
use std::io;
use std::path::PathBuf;

use serde::Serialize;

use super::model::Settings;
use crate::atomic::{self, Destination, RealIo};
use crate::error::WriteError;
use crate::target::check_target;

/// The settings file's name inside the settings folder.
pub const SETTINGS_FILE: &str = "settings.json";

/// The version this build reads and writes. A higher one was written by a
/// newer build, whose meaning this one cannot know.
const SETTINGS_VERSION: u32 = 1;

/// Why settings could not be loaded or saved. A damaged or newer file is
/// reported and left exactly as it is: it is never replaced with defaults.
#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("the settings file cannot be read: {reason}")]
    Damaged { reason: String },
    #[error("the settings file is from a newer version ({found})")]
    Newer { found: u32 },
    #[error("cannot read the settings file: {0}")]
    Read(io::Error),
    #[error(transparent)]
    Write(#[from] WriteError),
}

/// The file as written: the version, then the settings.
#[derive(Serialize)]
struct FileRef<'a> {
    version: u32,
    #[serde(flatten)]
    settings: &'a Settings,
}

/// The application's settings folder, such as `%APPDATA%\<app id>` (spec
/// 9.4). It is the one place outside a project the application writes, and
/// the only file in it is `settings.json`, replaced atomically.
#[derive(Debug, Clone)]
pub struct SettingsStore {
    dir: PathBuf,
}

impl SettingsStore {
    /// `dir` need not exist yet; the first save creates it.
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// Loads the settings. A missing file, as on a first run, gives the
    /// defaults.
    pub fn load(&self) -> Result<Settings, SettingsError> {
        let bytes = match fs::read(self.dir.join(SETTINGS_FILE)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Settings::default()),
            Err(e) => return Err(SettingsError::Read(e)),
        };
        let damaged = |reason: String| SettingsError::Damaged { reason };
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| damaged(e.to_string()))?;
        let version = value
            .get("version")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| damaged("it has no version".to_owned()))?;
        if version > u64::from(SETTINGS_VERSION) {
            return Err(SettingsError::Newer {
                found: u32::try_from(version).unwrap_or(u32::MAX),
            });
        }
        serde_json::from_value(value).map_err(|e| damaged(e.to_string()))
    }

    /// Saves the settings, creating the folder if needed. The file is
    /// replaced atomically, and a link, a folder or a read-only file in its
    /// place is refused.
    pub fn save(&self, settings: &Settings) -> Result<(), SettingsError> {
        let write_error = |operation, source| WriteError::Io {
            operation,
            path: SETTINGS_FILE.to_owned(),
            source,
        };
        let mut text = serde_json::to_string_pretty(&FileRef {
            version: SETTINGS_VERSION,
            settings,
        })
        .map_err(|e| SettingsError::Damaged {
            reason: e.to_string(),
        })?;
        text.push('\n');

        fs::create_dir_all(&self.dir).map_err(|e| write_error("create folder", e))?;
        let permissions = check_target(&self.dir, SETTINGS_FILE, SETTINGS_FILE)?;
        let destination = Destination {
            dir: &self.dir,
            name: SETTINGS_FILE,
            display: SETTINGS_FILE,
            permissions,
        };
        atomic::write(&mut RealIo, &destination, text.as_bytes())?;
        Ok(())
    }

    /// Loads, changes and saves the settings, returning what was saved. If
    /// the file cannot be loaded, nothing is written.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> Result<Settings, SettingsError> {
        let mut settings = self.load()?;
        change(&mut settings);
        self.save(&settings)?;
        Ok(settings)
    }
}
