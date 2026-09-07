/** Literal wire vectors and expectations authored before the v2 encoder. */
export const EXACT_SHARE_WIRE = [
  { text: "{}", encoded: "e30" },
  { text: "\"é\"", encoded: "IsOpIg" },
  { text: "\"🎹\"", encoded: "IvCfjrki" },
] as const;
export const EXACT_SHARE_INVALID_WIRE = [
  ["empty", ""], ["padding", "e30="], ["space", "e 30"],
  ["standard alphabet", "/w"], ["percent escape", "%6530"],
  ["length modulo four is one", "e"], ["nonzero unused bits", "e31"],
  ["invalid UTF8", "_w"], ["overlong UTF8", "wK8"], ["UTF8 BOM", "77u_e30"],
] as const;
export const EXACT_SHARE_EXPECTED_NOTES = [[64, 49, 49, 49], [59, 64, 67, 72]] as const;
export const EXACT_SHARE_BOUNDARIES = [
  { bytes: 6137, fragmentChars: 8191, accepted: true },
  { bytes: 6138, fragmentChars: 8192, accepted: true },
  { bytes: 6139, fragmentChars: 8194, accepted: false },
] as const;
