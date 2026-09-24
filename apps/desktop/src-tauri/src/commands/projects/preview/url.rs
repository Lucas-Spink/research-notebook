//! The asset protocol URL of a file, built here so the webview needs no
//! Tauri import to load it (only `ipc/` may import Tauri, AGENTS.md
//! section 4). It follows Tauri 2.11's own `convertFileSrc`: the path passed
//! through `encodeURIComponent`, under `http://asset.localhost/` on Windows
//! (`useHttpsScheme` is off in `tauri.conf.json`) and `asset://localhost/`
//! elsewhere. Tauri percent-decodes the path when it serves the file.

/// The URL the webview loads `path` by.
pub(super) fn asset_url(path: &str) -> String {
    let prefix = if cfg!(windows) {
        "http://asset.localhost/"
    } else {
        "asset://localhost/"
    };
    format!("{prefix}{}", encode_uri_component(path))
}

/// JavaScript's `encodeURIComponent`: UTF-8 bytes percent-encoded, except
/// ASCII letters, digits and `-_.!~*'()`.
fn encode_uri_component(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        let kept = byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte);
        if kept {
            out.push(char::from(byte));
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_encoded_as_encode_uri_component_does() {
        assert_eq!(
            encode_uri_component("C:\\Users\\Ana María\\plot (1).png"),
            "C%3A%5CUsers%5CAna%20Mar%C3%ADa%5Cplot%20(1).png"
        );
        assert_eq!(
            encode_uri_component("/home/a/b#c?d&e.svg"),
            "%2Fhome%2Fa%2Fb%23c%3Fd%26e.svg"
        );
        assert_eq!(encode_uri_component("-_.!~*'()"), "-_.!~*'()");
    }

    #[test]
    fn the_scheme_matches_the_platform() {
        let url = asset_url("/x/y.png");
        if cfg!(windows) {
            assert_eq!(url, "http://asset.localhost/%2Fx%2Fy.png");
        } else {
            assert_eq!(url, "asset://localhost/%2Fx%2Fy.png");
        }
    }
}
