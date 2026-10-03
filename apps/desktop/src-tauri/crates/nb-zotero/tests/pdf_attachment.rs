//! S5-T07 (FR-CIT-04): finding a source's PDF attachment through the local
//! API, so Open PDF is offered only when Zotero has one. Loopback mock
//! servers only; no real Zotero is contacted.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use nb_zotero::{ZoteroClient, ZoteroFetchError};
use serde_json::json;

struct Mock {
    addr: SocketAddr,
    request_lines: Arc<Mutex<Vec<String>>>,
}

impl Mock {
    fn client(&self) -> ZoteroClient {
        ZoteroClient::new(format!("http://{}/api", self.addr))
    }
}

fn response(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

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

fn child(key: &str, content_type: &str, deleted: bool) -> serde_json::Value {
    let mut data = json!({
        "key": key,
        "itemType": "attachment",
        "contentType": content_type,
        "linkMode": "imported_file",
    });
    if deleted {
        data["deleted"] = json!(1);
    }
    json!({"key": key, "data": data})
}

fn children(items: Vec<serde_json::Value>) -> String {
    serde_json::Value::Array(items).to_string()
}

#[test]
fn pdf_attachment_is_the_first_live_pdf_child() {
    let body = children(vec![
        json!({"key": "NOTE2345", "data": {"itemType": "note", "note": "x"}}),
        child("HTML2345", "text/html", false),
        child("GONE2345", "application/pdf", true),
        child("PDF22345", "application/pdf", false),
        child("PDF32345", "application/pdf", false),
    ]);
    let mock = spawn_mock(vec![response("200 OK", &body)]);
    assert_eq!(
        mock.client().find_pdf_attachment("u", "ABCD2345").unwrap(),
        Some("PDF22345".to_string())
    );
}

#[test]
fn pdf_attachment_is_none_without_a_pdf_child() {
    let body = children(vec![child("HTML2345", "text/html", false)]);
    let mock = spawn_mock(vec![response("200 OK", &body)]);
    assert_eq!(
        mock.client().find_pdf_attachment("u", "ABCD2345").unwrap(),
        None
    );
}

#[test]
fn pdf_attachment_is_none_for_an_item_zotero_no_longer_has() {
    let mock = spawn_mock(vec![response("404 Not Found", "Item not found")]);
    assert_eq!(
        mock.client().find_pdf_attachment("u", "ABCD2345").unwrap(),
        None
    );
}

#[test]
fn pdf_attachment_asks_for_the_children_in_the_right_library() {
    let mock = spawn_mock(vec![response("200 OK", "[]"), response("200 OK", "[]")]);
    mock.client().find_pdf_attachment("u", "ABCD2345").unwrap();
    mock.client()
        .find_pdf_attachment("g77", "ABCD2345")
        .unwrap();
    let lines = mock.request_lines.lock().unwrap().clone();
    assert!(lines[0].starts_with("GET /api/users/0/items/ABCD2345/children"));
    assert!(lines[1].starts_with("GET /api/groups/77/items/ABCD2345/children"));
}

#[test]
fn pdf_attachment_refuses_a_malformed_key_or_library_without_a_request() {
    let client = ZoteroClient::new("http://127.0.0.1:1/api");
    assert!(matches!(
        client.find_pdf_attachment("u", "../etc"),
        Err(ZoteroFetchError::InvalidItemKey(_))
    ));
    assert!(matches!(
        client.find_pdf_attachment("g/../1", "ABCD2345"),
        Err(ZoteroFetchError::InvalidItemKey(_))
    ));
}

#[test]
fn pdf_attachment_reports_a_disabled_local_api() {
    let mock = spawn_mock(vec![response("403 Forbidden", "")]);
    assert!(matches!(
        mock.client().find_pdf_attachment("u", "ABCD2345"),
        Err(ZoteroFetchError::Disabled)
    ));
}

#[test]
fn pdf_attachment_reports_zotero_not_running() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    drop(listener);
    let client = ZoteroClient::new(format!("http://{addr}/api"));
    assert!(matches!(
        client.find_pdf_attachment("u", "ABCD2345"),
        Err(ZoteroFetchError::NotRunning)
    ));
}
