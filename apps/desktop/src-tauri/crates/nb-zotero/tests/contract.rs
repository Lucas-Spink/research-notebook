//! Mock-server half of S1-G04. Each test spins up a minimal
//! `TcpListener`-based mock (no mock-server dependency needed for a single
//! canned request/response), points a `ZoteroClient` at it, and asserts
//! both the outgoing request shape and the parsed result. The other half
//! of S1-G04 (manual run against a real Zotero release and beta) is out
//! of scope here.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use nb_zotero::{ZoteroClient, ZoteroStatus};

struct MockServer {
    addr: SocketAddr,
    request_line: Arc<Mutex<Option<String>>>,
}

impl MockServer {
    fn base_url(&self) -> String {
        format!("http://{}/api", self.addr)
    }

    fn request_line(&self) -> String {
        self.request_line
            .lock()
            .expect("lock request_line")
            .clone()
            .expect("no request was received")
    }
}

fn spawn_mock(response: &'static str) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock listener");
    let addr = listener.local_addr().expect("mock listener local_addr");
    let request_line = Arc::new(Mutex::new(None));
    let captured = Arc::clone(&request_line);

    thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let line = read_request_line(&mut stream);
            *captured.lock().expect("lock request_line") = Some(line);
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        }
    });

    MockServer { addr, request_line }
}

fn read_request_line(stream: &mut TcpStream) -> String {
    let mut buf = [0u8; 4096];
    let mut data = Vec::new();
    loop {
        let n = stream.read(&mut buf).expect("read mock request");
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

/// A port nothing listens on: bind then immediately drop the listener, so
/// the OS returns the port to the pool and a connect attempt is refused.
fn unused_port_url() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind throwaway listener");
    let addr = listener.local_addr().expect("throwaway local_addr");
    drop(listener);
    format!("http://{addr}/api")
}

#[test]
fn status_reports_not_running_when_nothing_listens() {
    let client = ZoteroClient::new(unused_port_url());

    let status = client
        .check_status()
        .expect("check_status should not error");

    assert_eq!(status, ZoteroStatus::NotRunning);
}

#[test]
fn status_reports_disabled_on_403() {
    let mock =
        spawn_mock("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    let client = ZoteroClient::new(mock.base_url());

    let status = client
        .check_status()
        .expect("check_status should not error");

    assert_eq!(status, ZoteroStatus::Disabled);
    assert!(mock.request_line().starts_with("GET /api/ "));
}

#[test]
fn status_reports_connected_and_captures_server_id() {
    let mock = spawn_mock(concat!(
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: application/json\r\n",
        "Zotero-Server-ID: sPMHtLD6HHBd\r\n",
        "Content-Length: 2\r\n",
        "Connection: close\r\n",
        "\r\n",
        "{}",
    ));
    let client = ZoteroClient::new(mock.base_url());

    let status = client
        .check_status()
        .expect("check_status should not error");

    assert_eq!(
        status,
        ZoteroStatus::Connected {
            server_id: Some("sPMHtLD6HHBd".to_string())
        }
    );
}

#[test]
fn search_items_parses_results_and_sends_query() {
    let body = r#"[
        {
            "key": "ABCD1234",
            "data": { "itemType": "journalArticle", "title": "A Study of Widgets" },
            "meta": { "creatorSummary": "Smith" }
        }
    ]"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let mock = spawn_mock(Box::leak(response.into_boxed_str()));
    let client = ZoteroClient::new(mock.base_url());

    let items = client
        .search_items("widget")
        .expect("search_items should succeed");

    assert_eq!(items.len(), 1);
    assert_eq!(items[0].key, "ABCD1234");
    assert_eq!(items[0].data.item_type, "journalArticle");
    assert_eq!(items[0].data.title.as_deref(), Some("A Study of Widgets"));
    assert_eq!(items[0].meta.creator_summary.as_deref(), Some("Smith"));

    let request_line = mock.request_line();
    assert!(request_line.starts_with("GET /api/users/0/items?"));
    assert!(request_line.contains("q=widget"));
}

#[test]
fn fetch_csl_json_returns_item_and_requests_csljson_format() {
    let body = r#"{
        "id": "ABCD1234",
        "type": "article-journal",
        "title": "A Study of Widgets",
        "author": [{ "family": "Smith", "given": "Jane" }]
    }"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let mock = spawn_mock(Box::leak(response.into_boxed_str()));
    let client = ZoteroClient::new(mock.base_url());

    let csl = client
        .fetch_csl_json("ABCD1234")
        .expect("fetch_csl_json should succeed");

    assert_eq!(csl["id"], "ABCD1234");
    assert_eq!(csl["type"], "article-journal");

    let request_line = mock.request_line();
    assert!(request_line.starts_with("GET /api/users/0/items/ABCD1234?"));
    assert!(request_line.contains("format=csljson"));
}
