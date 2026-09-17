#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn reversing_twice_is_identity(s in "\\PC{0,50}") {
            let once: String = s.chars().rev().collect();
            let twice: String = once.chars().rev().collect();
            prop_assert_eq!(twice, s);
        }
    }
}
