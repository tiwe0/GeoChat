fn main() {
    for name in [
        "GEOCHAT_APP_BUNDLE_MANIFEST_URL",
        "GEOCHAT_APP_BUNDLE_SIGNATURE_URL",
        "GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM",
        "GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM_BASE64",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        println!(
            "cargo:rustc-env={name}={}",
            std::env::var(name).unwrap_or_default()
        );
    }
    tauri_build::build()
}
