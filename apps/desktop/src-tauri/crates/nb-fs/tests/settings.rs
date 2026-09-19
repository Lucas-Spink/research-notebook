//! FR-PRJ-03 and FR-PRJ-07 (S2-T05): application settings, which hold the
//! recent projects and, per machine, the paths of external roots. Settings
//! are not part of any project, so a damaged or newer settings file must be
//! left exactly as it is rather than overwritten.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs;

use nb_fs::settings::{Settings, SettingsError, SettingsStore, MAX_RECENT_PROJECTS};
use proptest::prelude::*;
use tempfile::TempDir;

const A: &str = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
const B: &str = "01JAXA1C5D8E2F4G6H7J9K0M1N";
const C: &str = "01JAXQ8M3K7T2V9R4W6Y5Z0B1C";

fn ids(settings: &Settings) -> Vec<&str> {
    settings
        .recent_projects
        .iter()
        .map(|p| p.id.as_str())
        .collect()
}

fn store() -> (TempDir, SettingsStore) {
    let dir = tempfile::Builder::new()
        .prefix("nb-settings-")
        .tempdir()
        .unwrap();
    // The folder need not exist yet on a first run.
    let store = SettingsStore::new(dir.path().join("config"));
    (dir, store)
}

#[test]
fn a_first_run_has_no_settings_file_and_loads_empty() {
    let (_dir, store) = store();
    assert_eq!(store.load().unwrap(), Settings::default());
}

#[test]
fn saved_settings_load_back_and_the_folder_is_created() {
    let (dir, store) = store();
    let mut settings = Settings::default();
    settings.remember(A, "Organoids", "C:/work/organoids");
    settings.set_external_root(A, B, "D:/shared/raw");

    store.save(&settings).unwrap();

    assert!(dir.path().join("config/settings.json").is_file());
    assert_eq!(store.load().unwrap(), settings);
}

#[test]
fn saving_leaves_no_temporary_file() {
    let (dir, store) = store();
    store.save(&Settings::default()).unwrap();
    let names: Vec<_> = fs::read_dir(dir.path().join("config"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["settings.json"]);
}

#[test]
fn the_file_is_readable_json_with_a_version() {
    let (dir, store) = store();
    let mut settings = Settings::default();
    settings.remember(A, "Organoids", "/work/organoids");
    store.save(&settings).unwrap();

    let text = fs::read_to_string(dir.path().join("config/settings.json")).unwrap();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(value["version"], 1);
    assert_eq!(value["recent_projects"][0]["id"], A);
    assert!(text.ends_with('\n'));
}

#[test]
fn remembering_puts_the_project_first() {
    let mut settings = Settings::default();
    settings.remember(A, "One", "/p/one");
    settings.remember(B, "Two", "/p/two");
    assert_eq!(ids(&settings), [B, A]);
}

#[test]
fn remembering_a_project_again_moves_it_to_the_front_and_updates_it() {
    let mut settings = Settings::default();
    settings.remember(A, "One", "/p/one");
    settings.remember(B, "Two", "/p/two");
    settings.remember(A, "One renamed", "/moved/one");

    assert_eq!(ids(&settings), [A, B]);
    let first = settings.recent_projects.first().unwrap();
    assert_eq!(
        (first.name.as_str(), first.path.as_str()),
        ("One renamed", "/moved/one")
    );
}

#[test]
fn a_folder_holds_one_project_so_an_older_entry_for_it_is_replaced() {
    let mut settings = Settings::default();
    settings.remember(A, "Old occupant", "/p/shared");
    settings.remember(B, "New occupant", "/p/shared");
    assert_eq!(ids(&settings), [B]);
}

#[test]
fn the_list_is_capped_and_drops_the_oldest() {
    let mut settings = Settings::default();
    for n in 0..MAX_RECENT_PROJECTS + 5 {
        settings.remember(&format!("ID{n:024}"), "P", &format!("/p/{n}"));
    }
    assert_eq!(settings.recent_projects.len(), MAX_RECENT_PROJECTS);
    assert_eq!(
        settings.recent_projects.first().unwrap().id,
        format!("ID{:024}", MAX_RECENT_PROJECTS + 4)
    );
}

#[test]
fn forgetting_removes_only_the_recent_entry_and_its_root_paths_stay() {
    let mut settings = Settings::default();
    settings.remember(A, "One", "/p/one");
    settings.set_external_root(A, B, "/raw");
    settings.forget(A);
    assert!(settings.recent_projects.is_empty());
    // A project that is only forgotten from the list may be opened again.
    assert_eq!(settings.external_root(A, B), Some("/raw"));
}

#[test]
fn finds_a_recent_project_by_id() {
    let mut settings = Settings::default();
    settings.remember(A, "One", "/p/one");
    assert_eq!(settings.recent(A).unwrap().path, "/p/one");
    assert!(settings.recent(B).is_none());
}

#[test]
fn external_root_paths_are_kept_per_project() {
    let mut settings = Settings::default();
    settings.set_external_root(A, C, "/machine/raw-a");
    settings.set_external_root(B, C, "/machine/raw-b");
    assert_eq!(settings.external_root(A, C), Some("/machine/raw-a"));
    assert_eq!(settings.external_root(B, C), Some("/machine/raw-b"));
    assert_eq!(settings.external_root(A, B), None);
}

#[test]
fn setting_an_external_root_again_replaces_its_path() {
    let mut settings = Settings::default();
    settings.set_external_root(A, C, "/old");
    settings.set_external_root(A, C, "/new");
    assert_eq!(settings.external_root(A, C), Some("/new"));
}

#[test]
fn clearing_an_external_root_removes_it() {
    let mut settings = Settings::default();
    settings.set_external_root(A, C, "/raw");
    settings.clear_external_root(A, C);
    assert_eq!(settings.external_root(A, C), None);
    let text = serde_json::to_string(&settings).unwrap();
    assert!(
        !text.contains(A),
        "an empty project entry should not remain: {text}"
    );
}

#[test]
fn update_loads_changes_and_saves() {
    let (_dir, store) = store();
    store.update(|s| s.remember(A, "One", "/p/one")).unwrap();
    store.update(|s| s.remember(B, "Two", "/p/two")).unwrap();
    assert_eq!(ids(&store.load().unwrap()), [B, A]);
}

#[test]
fn a_damaged_settings_file_is_reported_and_never_overwritten() {
    let (dir, store) = store();
    fs::create_dir_all(dir.path().join("config")).unwrap();
    let path = dir.path().join("config/settings.json");
    fs::write(&path, b"{ this is not json").unwrap();

    assert!(matches!(store.load(), Err(SettingsError::Damaged { .. })));
    assert!(matches!(
        store.update(|s| s.remember(A, "One", "/p/one")),
        Err(SettingsError::Damaged { .. })
    ));
    assert_eq!(fs::read(&path).unwrap(), b"{ this is not json");
}

#[test]
fn settings_with_the_wrong_shape_are_treated_as_damaged() {
    let (dir, store) = store();
    fs::create_dir_all(dir.path().join("config")).unwrap();
    let path = dir.path().join("config/settings.json");
    fs::write(&path, br#"{"version": 1, "recent_projects": "nope"}"#).unwrap();
    assert!(matches!(store.load(), Err(SettingsError::Damaged { .. })));
    assert_eq!(
        fs::read(&path).unwrap(),
        br#"{"version": 1, "recent_projects": "nope"}"#
    );
}

#[test]
fn settings_from_a_newer_version_are_reported_and_never_overwritten() {
    let (dir, store) = store();
    fs::create_dir_all(dir.path().join("config")).unwrap();
    let path = dir.path().join("config/settings.json");
    let newer = br#"{"version": 2, "something_new": true}"#;
    fs::write(&path, newer).unwrap();

    assert!(matches!(
        store.load(),
        Err(SettingsError::Newer { found: 2 })
    ));
    assert!(store.update(|s| s.forget(A)).is_err());
    assert_eq!(fs::read(&path).unwrap(), newer);
}

#[test]
fn a_folder_where_the_settings_file_should_be_is_refused() {
    let (dir, store) = store();
    fs::create_dir_all(dir.path().join("config/settings.json")).unwrap();
    assert!(store.save(&Settings::default()).is_err());
    assert!(dir.path().join("config/settings.json").is_dir());
}

proptest! {
    // Whatever is remembered, in any order: no duplicate ids or paths, the
    // cap holds, and the last project remembered is first.
    #[test]
    fn the_recent_list_keeps_its_invariants(
        steps in proptest::collection::vec((0usize..40, 0usize..40), 1..120)
    ) {
        let mut settings = Settings::default();
        for (id, path) in &steps {
            settings.remember(&format!("ID{id:024}"), "P", &format!("/p/{path}"));
        }
        let recent = &settings.recent_projects;
        prop_assert!(recent.len() <= MAX_RECENT_PROJECTS);
        let mut seen_ids = std::collections::HashSet::new();
        let mut seen_paths = std::collections::HashSet::new();
        for entry in recent {
            prop_assert!(seen_ids.insert(entry.id.clone()));
            prop_assert!(seen_paths.insert(entry.path.clone()));
        }
        let (last_id, last_path) = steps.last().unwrap();
        prop_assert_eq!(&recent[0].id, &format!("ID{last_id:024}"));
        prop_assert_eq!(&recent[0].path, &format!("/p/{last_path}"));
    }
}
