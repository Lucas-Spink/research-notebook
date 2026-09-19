//! The debounce: a burst of raw events (an atomic write is several) becomes
//! one report per file, after the burst has settled. Driven by an injected
//! clock, so nothing sleeps.

use std::time::{Duration, Instant};

use nb_fs::watch::Coalescer;

const WINDOW: Duration = Duration::from_millis(300);
const MAX_WAIT: Duration = Duration::from_millis(2000);

fn ms(n: u64) -> Duration {
    Duration::from_millis(n)
}

fn coalescer() -> (Coalescer, Instant) {
    (Coalescer::new(WINDOW, MAX_WAIT), Instant::now())
}

#[test]
fn a_burst_for_one_file_is_one_report_after_it_settles() {
    let (mut c, t0) = coalescer();
    c.record("questions/Q-01.md", t0);
    c.record("questions/Q-01.md", t0 + ms(20));
    c.record("questions/Q-01.md", t0 + ms(40));
    assert!(c.take_due(t0 + ms(339)).paths.is_empty(), "still settling");
    let due = c.take_due(t0 + ms(340));
    assert_eq!(due.paths, ["questions/Q-01.md"]);
    assert!(!due.overflow);
}

#[test]
fn a_report_is_taken_once() {
    let (mut c, t0) = coalescer();
    c.record("project.yaml", t0);
    assert_eq!(c.take_due(t0 + WINDOW).paths.len(), 1);
    assert!(c.take_due(t0 + WINDOW * 5).paths.is_empty());
    assert_eq!(c.next_due(), None);
}

#[test]
fn every_new_event_restarts_the_wait() {
    let (mut c, t0) = coalescer();
    c.record("project.yaml", t0);
    c.record("project.yaml", t0 + ms(250));
    assert!(c.take_due(t0 + ms(400)).paths.is_empty());
    assert_eq!(c.take_due(t0 + ms(550)).paths, ["project.yaml"]);
}

#[test]
fn a_file_that_never_stops_changing_is_still_reported() {
    let (mut c, t0) = coalescer();
    let mut t = t0;
    while t < t0 + MAX_WAIT {
        c.record("project.yaml", t);
        t += ms(100);
    }
    assert_eq!(c.take_due(t0 + MAX_WAIT).paths, ["project.yaml"]);
}

#[test]
fn files_settle_independently_and_come_out_sorted() {
    let (mut c, t0) = coalescer();
    c.record("questions/Q-02.md", t0);
    c.record("project.yaml", t0 + ms(200));
    assert_eq!(c.take_due(t0 + ms(300)).paths, ["questions/Q-02.md"]);
    assert_eq!(c.take_due(t0 + ms(500)).paths, ["project.yaml"]);

    c.record("questions/Q-03.md", t0 + ms(600));
    c.record("bibliography.json", t0 + ms(600));
    assert_eq!(
        c.take_due(t0 + ms(900)).paths,
        ["bibliography.json", "questions/Q-03.md"]
    );
}

#[test]
fn paths_that_are_not_data_files_are_dropped() {
    let (mut c, t0) = coalescer();
    c.record(".history/project.yaml", t0);
    c.record("questions/.Q-01.md.1.1.tmp", t0);
    c.record("experiments/EXP-042/evidence/plot.pdf", t0);
    c.record(".lock", t0);
    assert_eq!(c.next_due(), None);
    assert!(c.take_due(t0 + WINDOW * 10).paths.is_empty());
}

#[test]
fn the_temp_file_of_an_atomic_write_does_not_hide_the_real_file() {
    let (mut c, t0) = coalescer();
    // Create the temporary file, write it, rename it over the target.
    c.record("questions/.Q-01.md.7.0.tmp", t0);
    c.record("questions/.Q-01.md.7.0.tmp", t0 + ms(2));
    c.record("questions/Q-01.md", t0 + ms(5));
    c.record("questions/.Q-01.md.7.0.tmp", t0 + ms(5));
    assert_eq!(c.take_due(t0 + ms(305)).paths, ["questions/Q-01.md"]);
}

#[test]
fn next_due_is_when_the_earliest_file_settles() {
    let (mut c, t0) = coalescer();
    assert_eq!(c.next_due(), None);
    c.record("questions/Q-01.md", t0);
    c.record("project.yaml", t0 + ms(100));
    assert_eq!(c.next_due(), Some(t0 + WINDOW));
}

#[test]
fn an_overflow_is_reported_once_it_settles() {
    let (mut c, t0) = coalescer();
    c.record_overflow(t0);
    assert!(!c.take_due(t0 + ms(100)).overflow);
    let due = c.take_due(t0 + WINDOW);
    assert!(due.overflow);
    assert!(!c.take_due(t0 + WINDOW * 2).overflow);
}

#[test]
fn an_overflow_does_not_swallow_the_files_seen_with_it() {
    let (mut c, t0) = coalescer();
    c.record("project.yaml", t0);
    c.record_overflow(t0 + ms(10));
    let due = c.take_due(t0 + ms(400));
    assert!(due.overflow);
    assert_eq!(due.paths, ["project.yaml"]);
}
