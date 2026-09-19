//! Stale, unreadable and future-dated locks: takeover needs confirmation.

use nb_fs::lock::{AcquireOutcome, LockInfo, Timestamp, STALE_AFTER_SECONDS};
use proptest::prelude::*;

use crate::common::TestProject;
use crate::{held, notebook_files, plant_lock, FakeEnv, LOCK, START};

/// A project whose lock was written by `lab-pc` at the start and never refreshed.
fn abandoned() -> TestProject {
    let project = TestProject::new();
    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    project
}

fn taker_at(offset: i64) -> FakeEnv {
    let env = FakeEnv::new("laptop", 200);
    env.set(START + offset);
    env
}

#[test]
fn five_minutes_without_a_heartbeat_makes_a_lock_stale_and_not_before() {
    let project = abandoned();

    let just_before = project
        .open()
        .acquire_lock(&taker_at(STALE_AFTER_SECONDS - 1), false)
        .unwrap();
    assert!(
        matches!(just_before, AcquireOutcome::Live(_)),
        "{just_before:?}"
    );

    let at_the_limit = project
        .open()
        .acquire_lock(&taker_at(STALE_AFTER_SECONDS), false)
        .unwrap();
    assert!(
        matches!(at_the_limit, AcquireOutcome::Stale(_)),
        "{at_the_limit:?}"
    );
    assert_eq!(STALE_AFTER_SECONDS, 300);
}

#[test]
fn a_stale_lock_is_reported_and_left_alone_without_confirmation() {
    let project = abandoned();
    let before = notebook_files(&project);

    let outcome = project
        .open()
        .acquire_lock(&taker_at(3_600), false)
        .unwrap();

    match outcome {
        AcquireOutcome::Stale(info) => assert_eq!((info.host.as_str(), info.pid), ("lab-pc", 100)),
        other => panic!("expected a stale lock, got {other:?}"),
    }
    assert_eq!(notebook_files(&project), before);
}

#[test]
fn a_confirmed_takeover_replaces_a_stale_lock_with_ours() {
    let project = abandoned();

    let env = taker_at(3_600);
    let held = held(project.open().acquire_lock(&env, true).unwrap());

    assert_eq!(
        (held.info().host.as_str(), held.info().pid),
        ("laptop", 200)
    );
    let text = String::from_utf8(project.read(LOCK)).unwrap();
    assert!(text.contains("\"host\": \"laptop\""), "{text}");
    assert!(
        text.contains("\"opened\": \"2026-09-19T11:00:00Z\""),
        "{text}"
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_heartbeat_in_the_future_counts_as_live() {
    let project = abandoned();

    // The other machine's clock is ahead of ours: when unsure, read-only.
    let outcome = project
        .open()
        .acquire_lock(&taker_at(-3_600), true)
        .unwrap();

    assert!(matches!(outcome, AcquireOutcome::Live(_)), "{outcome:?}");
}

/// Everything a hand edit, a crash or another program could leave in `.lock`.
fn unreadable_locks() -> Vec<(&'static str, Vec<u8>)> {
    let valid = |edit: &dyn Fn(String) -> String| {
        edit(
            concat!(
                "{\n  \"host\": \"lab-pc\",\n  \"pid\": 100,\n  \"app_version\": \"0.1.0\",\n",
                "  \"opened\": \"2026-09-19T10:00:00Z\",\n  \"heartbeat\": \"2026-09-19T10:00:00Z\"\n}\n"
            )
            .to_owned(),
        )
        .into_bytes()
    };
    vec![
        ("empty", Vec::new()),
        ("not json", b"lock".to_vec()),
        ("truncated", valid(&|t| t[..t.len() / 2].to_owned())),
        ("an array", b"[]\n".to_vec()),
        ("no keys", b"{}\n".to_vec()),
        (
            "missing host",
            valid(&|t| t.replace("\"host\": \"lab-pc\",", "")),
        ),
        ("pid as text", valid(&|t| t.replace("100", "\"100\""))),
        ("pid zero", valid(&|t| t.replace("100", "0"))),
        ("pid negative", valid(&|t| t.replace("100", "-1"))),
        ("pid fraction", valid(&|t| t.replace("100", "1.5"))),
        ("empty host", valid(&|t| t.replace("lab-pc", ""))),
        (
            "heartbeat not RFC 3339",
            valid(&|t| {
                t.replace(
                    "\"heartbeat\": \"2026-09-19T10:00:00Z\"",
                    "\"heartbeat\": \"2026-09-19 10:00:00\"",
                )
            }),
        ),
        ("not UTF-8", vec![0xff, 0xfe, 0x00, 0x7b]),
        // A valid lock padded far beyond any real one is not read at all.
        ("far too large", valid(&|t| t + &" ".repeat(1024 * 1024))),
    ]
}

#[test]
fn an_unreadable_lock_is_reported_and_left_alone_without_confirmation() {
    for (name, bytes) in unreadable_locks() {
        let project = TestProject::new();
        plant_lock(&project, &bytes);

        let outcome = project
            .open()
            .acquire_lock(&FakeEnv::new("laptop", 200), false)
            .unwrap();

        assert!(
            matches!(outcome, AcquireOutcome::Unreadable { replaceable: true }),
            "{name}: {outcome:?}"
        );
        assert_eq!(project.read(LOCK), bytes, "{name}");
    }
}

#[test]
fn a_confirmed_takeover_replaces_an_unreadable_lock() {
    for (name, bytes) in unreadable_locks() {
        let project = TestProject::new();
        plant_lock(&project, &bytes);

        let outcome = project
            .open()
            .acquire_lock(&FakeEnv::new("laptop", 200), true)
            .unwrap();

        held(outcome);
        assert!(
            String::from_utf8(project.read(LOCK))
                .unwrap()
                .contains("\"laptop\""),
            "{name}"
        );
    }
}

#[test]
fn keys_this_version_does_not_know_are_accepted_and_the_lock_still_counts() {
    let project = TestProject::new();
    plant_lock(
        &project,
        concat!(
            "{\n  \"host\": \"lab-pc\",\n  \"pid\": 100,\n  \"app_version\": \"9.9.9\",\n",
            "  \"opened\": \"2026-09-19T10:00:00Z\",\n  \"heartbeat\": \"2026-09-19T10:00:00Z\",\n",
            "  \"future_key\": true\n}\n"
        )
        .as_bytes(),
    );

    let outcome = project.open().acquire_lock(&taker_at(60), false).unwrap();

    assert!(matches!(outcome, AcquireOutcome::Live(_)), "{outcome:?}");
}

fn info_with_heartbeat(unix: i64) -> LockInfo {
    LockInfo {
        host: "lab-pc".to_owned(),
        pid: 1,
        app_version: "0.1.0".to_owned(),
        opened: Timestamp::from_unix(0),
        heartbeat: Timestamp::from_unix(unix),
    }
}

proptest! {
    /// Stale exactly when five minutes or more have passed, and never
    /// un-stale as time goes on.
    #[test]
    fn staleness_is_exactly_five_minutes_and_monotone(
        heartbeat in -1_000_000_000i64..4_000_000_000,
        elapsed in -100_000i64..100_000,
        later in 0i64..100_000,
    ) {
        let info = info_with_heartbeat(heartbeat);
        let now = Timestamp::from_unix(heartbeat + elapsed);
        let stale = info.is_stale_at(now);
        prop_assert_eq!(stale, elapsed >= STALE_AFTER_SECONDS);
        if stale {
            prop_assert!(info.is_stale_at(Timestamp::from_unix(heartbeat + elapsed + later)));
        }
    }
}
