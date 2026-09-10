# Independent QR and compression vectors

Generated before production implementation by CyanCove on 2026-09-10.
`vectors.json`: system libqrencode 4.1.1-2build1 C library, byte-only entry point,
M correction, explicit requested versions, independently chosen masks. Texts are
original test strings; no user data. Matrix SHA256 is over binary rows joined with
LF and one final LF. The production encoder will not use this C implementation.
`compression.json`: Python standard-library zlib, version recorded in the file;
original JSON text with negative zero and Unicode, independently compressed.
No production-generated expectations. Neither file claims official ISO vectors.

QR algorithm reference: Project Nayuki, MIT, source retrieval SHA256 recorded in
docs/EXACT_QR_SHARING.md. Independent camera decoding uses libzbar from this host.
Camera/device acceptance remains open even if desktop image decoding succeeds.
