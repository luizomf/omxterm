// WASM exports return addresses as i32, so JavaScript sees any address past
// 2 GiB of core memory as negative and typed-array views throw RangeError.
// The core's allocator never returns memory, so a window that once held many
// large images keeps those high addresses for later writes and render reads.
// Read every address an export returns as unsigned.
const renderPointers = [
  "restty_render_codepoints_ptr",
  "restty_render_fg_rgba_ptr",
  "restty_render_bg_rgba_ptr",
  "restty_render_ul_rgba_ptr",
  "restty_render_ul_style_ptr",
  "restty_render_grapheme_offset_ptr",
  "restty_render_grapheme_len_ptr",
  "restty_render_grapheme_buffer_ptr",
  "restty_render_selection_start_ptr",
  "restty_render_selection_end_ptr",
  "restty_render_cursor_ptr",
  "restty_cell_codepoints_ptr",
  "restty_cell_content_tags_ptr",
  "restty_cell_wide_ptr",
  "restty_cell_flags_ptr",
  "restty_cell_style_flags_ptr",
  "restty_cell_link_ids_ptr",
  "restty_cell_fg_rgba_ptr",
  "restty_cell_bg_rgba_ptr",
  "restty_cell_ul_rgba_ptr",
  "restty_cell_underline_styles_ptr",
  "restty_cell_grapheme_offsets_ptr",
  "restty_cell_grapheme_lengths_ptr",
  "restty_grapheme_buffer_ptr",
  "restty_row_selection_start_ptr",
  "restty_row_selection_end_ptr",
  "restty_cursor_info_ptr",
  "restty_link_offsets_ptr",
  "restty_link_lengths_ptr",
  "restty_link_buffer_ptr",
];

export const wasmAddressCorrections = [
  {
    original: "const base = exports.restty_render_info(handle);",
    corrected: "const base = exports.restty_render_info(handle) >>> 0;",
  },
  ...renderPointers.map((name) => ({
    original: `exports.${name}(handle)`,
    corrected: `(exports.${name}(handle) >>> 0)`,
  })),
  {
    original: "const result = this.exports.restty_alloc(8);",
    corrected: "const result = this.exports.restty_alloc(8) >>> 0;",
  },
  {
    original: "const ptr = this.exports.restty_alloc(bytes.length);",
    corrected: "const ptr = this.exports.restty_alloc(bytes.length) >>> 0;",
    occurrences: 2,
  },
  {
    original: "const ptr = this.exports.restty_alloc(byteLen);",
    corrected: "const ptr = this.exports.restty_alloc(byteLen) >>> 0;",
  },
  {
    original: "const ptr = this.exports.restty_output_ptr(handle);",
    corrected: "const ptr = this.exports.restty_output_ptr(handle) >>> 0;",
  },
  {
    original: "const ptr = this.exports.restty_event_ptr(handle);",
    corrected: "const ptr = this.exports.restty_event_ptr(handle) >>> 0;",
  },
  {
    original:
      "const ptr = this.exports.restty_search_status_ptr?.(handle) ?? 0;",
    corrected:
      "const ptr = (this.exports.restty_search_status_ptr?.(handle) ?? 0) >>> 0;",
  },
  {
    original:
      "const ptr = this.exports.restty_search_viewport_matches_ptr?.(handle) ?? 0;",
    corrected:
      "const ptr = (this.exports.restty_search_viewport_matches_ptr?.(handle) ?? 0) >>> 0;",
  },
];
