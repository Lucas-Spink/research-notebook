//! S5-G05: fetching one source for `bibliography.json` (FR-CIT-05, FR-CIT-07)
//! reports the `Zotero-Server-ID`, the trashed state, a missing item and a
//! 412 as typed outcomes, so the caller can ask before overwriting anything.
//! Loopback mock servers only; no real Zotero is contacted.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use nb_zotero::{SourceFetch, ZoteroClient, ZoteroFetchError};
use serde_json::json;

struct Mock {
    addr: SocketAddr,
    request_lines: Arc<Mutex<Vec<String>>>,
}

impl Mock {
    fn client(&self) -> ZoteroClient {
        ZoteroClient::new(format!("http://{}/api", self.addr))
    }

    fn request_lines(&self) -> Vec<String> {
        self.request_lines.lock().expect("lock").clone()
    }
}

fn response(status: &str, headers: &[(&str, &str)], body: &str) -> String {
    let mut text = format!("HTTP/1.1 {status}\r\n");
    for (name, value) in headers {
        text.push_str(&format!("{name}: {value}\r\n"));
    }
    text.push_str(&format!(
        "Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    text
}

/// Answers one connection per canned response, in order.
fn spawn_mock(responses: Vec<String>) -> Mock {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    let request_lines = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&request_lines);
    thread::spawn(move || {
        for canned in responses {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let line = read_request_line(&mut stream);
            captured.lock().expect("lock").push(line);
            let _ = stream.write_all(canned.as_bytes());
            let _ = stream.flush();
        }
    });
    Mock {
        addr,
        request_lines,
    }
}

fn read_request_line(stream: &mut TcpStream) -> String {
    let mut buf = [0u8; 4096];
    let mut data = Vec::new();
    loop {
        let n = stream.read(&mut buf).expect("read");
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        if data.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8_lossy(&data)
        .lines()
        .next()
        .unwrap_or_default()
        .to_string()
}

fn item_json(deleted: bool) -> String {
    let mut data = json!({"key": "ABCD2345", "itemType": "book", "title": "A title"});
    if deleted {
        data["deleted"] = json!(1);
    }
    json!({"key": "ABCD2345", "data": data}).to_string()
}

fn csl_body() -> String {
    json!({"items": [{"id": "ABCD2345", "type": "book", "title": "A title"}]}).to_string()
}

fn found(server_id: Option<&str>, deleted: bool) -> Vec<String> {
    let headers: Vec<(&str, &str)> = server_id
        .map(|id| vec![("Zotero-Server-ID", id)])
        .unwrap_or_default();
    vec![
        response("200 OK", &headers, &item_json(deleted)),
        response("200 OK", &headers, &csl_body()),
    ]
}

fn expect_found(outcome: Result<SourceFetch, ZoteroFetchError>) -> nb_zotero::SourceSnapshot {
    match outcome {
        Ok(SourceFetch::Found(snapshot)) => snapshot,
        other => panic!("expected a found source, got {other:?}"),
    }
}

#[test]
fn server_id_is_taken_from_the_response_header() {
    let mock = spawn_mock(found(Some("srv-1"), false));
    let snapshot = expect_found(mock.client().fetch_source("ABCD2345"));
    assert_eq!(snapshot.server_id.as_deref(), Some("srv-1"));
    assert!(!snapshot.trashed);
}

#[test]
fn server_id_is_none_when_zotero_sent_no_header() {
    let mock = spawn_mock(found(None, false));
    let snapshot = expect_found(mock.client().fetch_source("ABCD2345"));
    assert_eq!(snapshot.server_id, None);
}

#[test]
fn server_id_fetch_returns_the_item_as_csl_json_not_the_envelope() {
    let mock = spawn_mock(found(Some("srv-1"), false));
    let snapshot = expect_found(mock.client().fetch_source("ABCD2345"));
    assert_eq!(snapshot.csl_json["title"], "A title");
    assert_eq!(snapshot.csl_json["type"], "book");
}

#[test]
fn server_id_fetch_accepts_a_bare_csl_json_array() {
    let bare = json!([{"id": "ABCD2345", "type": "book"}]).to_string();
    let mock = spawn_mock(vec![
        response("200 OK", &[], &item_json(false)),
        response("200 OK", &[], &bare),
    ]);
    let snapshot = expect_found(mock.client().fetch_source("ABCD2345"));
    assert_eq!(snapshot.csl_json["type"], "book");
}

#[test]
fn server_id_fetch_marks_an_item_in_the_trash() {
    let mock = spawn_mock(found(Some("srv-1"), true));
    assert!(expect_found(mock.client().fetch_source("ABCD2345")).trashed);
}

#[test]
fn server_id_fetch_reports_a_missing_item_on_404() {
    let mock = spawn_mock(vec![response("404 Not Found", &[], "Item not found")]);
    assert!(matches!(
        mock.client().fetch_source("ABCD2345"),
        Ok(SourceFetch::Missing)
    ));
}

#[test]
fn server_id_fetch_reports_412_as_a_failed_precondition_and_returns_no_data() {
    let mock = spawn_mock(vec![response("412 Precondition Failed", &[], "")]);
    assert!(matches!(
        mock.client().fetch_source("ABCD2345"),
        Err(ZoteroFetchError::PreconditionFailed)
    ));
}

#[test]
fn server_id_fetch_reports_a_disabled_local_api() {
    let mock = spawn_mock(vec![response("403 Forbidden", &[], "")]);
    assert!(matches!(
        mock.client().fetch_source("ABCD2345"),
        Err(ZoteroFetchError::Disabled)
    ));
}

#[test]
fn server_id_fetch_reports_zotero_not_running() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    drop(listener);
    let client = ZoteroClient::new(format!("http://{addr}/api"));
    assert!(matches!(
        client.fetch_source("ABCD2345"),
        Err(ZoteroFetchError::NotRunning)
    ));
}

#[test]
fn server_id_fetch_asks_for_the_item_then_its_csl_json() {
    let mock = spawn_mock(found(Some("srv-1"), false));
    expect_found(mock.client().fetch_source("ABCD2345"));
    let lines = mock.request_lines();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].starts_with("GET /api/users/0/items/ABCD2345"));
    assert!(!lines[0].contains("csljson"));
    assert!(lines[1].contains("format=csljson"));
}
