use std::time::{Duration, Instant};

/// What is ready to report.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Due {
    pub paths: Vec<String>,
    pub overflow: bool,
}

/// Turns bursts of raw events into single reports.
#[derive(Debug)]
pub struct Coalescer {
    _window: Duration,
    _max_wait: Duration,
}

impl Coalescer {
    pub fn new(window: Duration, max_wait: Duration) -> Self {
        Self {
            _window: window,
            _max_wait: max_wait,
        }
    }

    pub fn record(&mut self, _relative: &str, _now: Instant) {}

    pub fn record_overflow(&mut self, _now: Instant) {}

    pub fn next_due(&self) -> Option<Instant> {
        None
    }

    pub fn take_due(&mut self, _now: Instant) -> Due {
        Due::default()
    }
}
