//! One watcher per project for the running application, started when a
//! project opens and stopped when it closes or the application exits.

use std::fs;
use std::time::Duration;

use nb_fs::watch::WatchRegistry;

use crate::common::{rel, TestProject};

const REPORT_WITHIN: Duration = Duration::from_secs(15);
const QUIET_FOR: Duration = Duration::from_millis(1500);

fn write(project: &TestProject, notebook_path: &str, text: &str) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

#[test]
fn a_project_that_is_not_watched_has_no_changes_to_poll() {
    let project = TestProject::new();
    let registry = WatchRegistry::new();
    assert!(registry.poll(&project.open()).is_none());
    assert!(registry
        .wait(&project.open(), Duration::from_millis(10))
        .is_none());
}

#[test]
fn a_started_project_reports_its_changes() {
    let project = TestProject::new();
    let registry = WatchRegistry::new();
    registry.start(&project.open()).unwrap();
    assert!(registry.poll(&project.open()).unwrap().is_empty());

    write(&project, "questions/Q-01.md", "hello\n");
    let batch = registry.wait(&project.open(), REPORT_WITHIN).unwrap();
    assert_eq!(batch.changes.len(), 1);
    assert_eq!(batch.changes[0].path, rel("_notebook/questions/Q-01.md"));
    // Taking a batch empties it.
    assert!(registry.poll(&project.open()).unwrap().is_empty());
}

#[test]
fn starting_a_project_twice_keeps_one_watcher() {
    let project = TestProject::new();
    let registry = WatchRegistry::new();
    registry.start(&project.open()).unwrap();
    registry.start(&project.open()).unwrap();
    write(&project, "questions/Q-01.md", "hello\n");
    let batch = registry.wait(&project.open(), REPORT_WITHIN).unwrap();
    assert_eq!(batch.changes.len(), 1);
    assert!(registry
        .wait(&project.open(), QUIET_FOR)
        .unwrap()
        .is_empty());
}

#[test]
fn a_stopped_project_is_no_longer_watched_and_can_be_started_again() {
    let project = TestProject::new();
    let registry = WatchRegistry::new();
    registry.start(&project.open()).unwrap();
    registry.stop(&project.open());
    assert!(registry.poll(&project.open()).is_none());
    // Stopping twice is harmless.
    registry.stop(&project.open());

    registry.start(&project.open()).unwrap();
    write(&project, "questions/Q-01.md", "hello\n");
    assert_eq!(
        registry
            .wait(&project.open(), REPORT_WITHIN)
            .unwrap()
            .changes
            .len(),
        1
    );
}

#[test]
fn projects_are_watched_independently() {
    let a = TestProject::new();
    let b = TestProject::new();
    let registry = WatchRegistry::new();
    registry.start(&a.open()).unwrap();
    registry.start(&b.open()).unwrap();

    write(&a, "project.yaml", "a\n");
    let batch = registry.wait(&a.open(), REPORT_WITHIN).unwrap();
    assert_eq!(batch.changes.len(), 1);
    assert!(registry.wait(&b.open(), QUIET_FOR).unwrap().is_empty());
}

#[test]
fn stopping_everything_stops_every_project() {
    let a = TestProject::new();
    let b = TestProject::new();
    let registry = WatchRegistry::new();
    registry.start(&a.open()).unwrap();
    registry.start(&b.open()).unwrap();
    registry.stop_all();
    assert!(registry.poll(&a.open()).is_none());
    assert!(registry.poll(&b.open()).is_none());
}
