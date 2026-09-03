# Proust’s Reader

An EPUB reader with an agent-controlled reading surface. The attached Project Gutenberg edition of **Swann’s Way** is pre-loaded from `public/books/the-way-by-swanns.epub`.

## Reading

The reader opens in Overture on first use. Contents includes the book’s front matter, all three parts, and the Project Gutenberg license. Previous/Next moves through 152 reflowed reader pages, preserving original paragraph boundaries. These are reader pages, not print page numbers. Internal links navigate to their targets and offer Return to reading. Emphasis, superscripts, illustrations and links are rendered from sanitized EPUB structures.

**Open EPUB** imports another unencrypted EPUB locally. The latest imported file and reading position are remembered in the browser through IndexedDB and localStorage. No upload endpoint or AI backend is involved. Import errors preserve the open book. All EPUB parsing uses the same client-compatible code exercised by tests.

## Inline tools

Select a phrase within a paragraph. A compatible external WebMCP agent can read the actual selected sentence and context, mark the spine, fold and expand modifiers, link references, rearrange source phrases, and add notes directly in the original text. No reading popup or duplicate sentence is used. Native text selection maps back to immutable source coordinates after folding and reordering.

The prepared example remains in its original paragraph within Combray. **Try the prepared passage** navigates there and runs the authored analysis. It is labeled as prepared, not live inference. Other sentences require an external WebMCP agent. The reader itself does not call an AI model.

Tools: `get_selected_sentence`, `get_surrounding_context`, `show_sentence_spine`, `show_modifier`, `collapse_modifier`, `expand_modifier`, `link_reference_to_antecedent`, `reorder_for_clarity`, `add_margin_annotation`.

Read tools return current-page text, its document ID, selection, focused sub-selection, containing sentence, neighboring-page context, and a revision. Offsets are UTF-16, start inclusive and end exclusive, relative to that page. Mutations require the revision; navigating to another page invalidates stale calls. References must identify target ranges on the current page; neighboring pages are available as read-only context. Each page's active analysis is retained while navigating in the current session. Reading location persists after refresh; annotations do not.

`lib/webmcp.ts` registers through `document.modelContext`, falling back to `navigator.modelContext`. No fake polyfill or simulated agent is installed. Registration retries when the browser API arrives late and cleans up on unmount. The status distinguishes registered tools from an actual agent invocation. Connection details provide a retry control and a copyable instruction. Live browser discovery and native WebMCP calls were verified on an unprepared sentence in Combray. Grammar is supplied by the calling agent; correctness is not guaranteed for every sentence.

To use it, open the reader in the ChatGPT desktop app’s built-in browser with a supported model (currently GPT-5.6 Sol or Terra), inspect **Site tools → Available site tools**, highlight a sentence and ask the agent to untangle it. The reader’s Untangle button preserves selection and explains the next step; it does not launch an embedded model. See https://learn.chatgpt.com/docs/webmcp.

Read results also provide sentenceTokens with exact UTF-16 word offsets to reduce range-counting errors.

## Implementation

- `lib/epub.ts`: bounded ZIP import, EPUB 2/3 package/spine/navigation parsing, source blocks and internal targets.
- `lib/book-storage.ts`: local EPUB persistence.
- `lib/reader.ts`: validated document-specific tool state and prepared analysis.
- `lib/passage.ts`, `components/reading-passage.tsx`: inline transformations and stable source offsets.
- `app/page.tsx`, `app/globals.css`: reading interface, navigation, position recall.

Imported HTML is never inserted through `innerHTML`. Scripts, embedded frames, remote images and unsafe URL schemes are excluded; React renders book content as structured text and local raster images. Custom entity definitions and encrypted text resources are rejected. The pre-loaded book's complete body text is verified against every spine document.

## Validation

`npm run install:ci`

`node --experimental-strip-types --test tests/reader.test.mjs tests/passage.test.mjs tests/epub.test.mjs`

`npm run build`

`node --experimental-strip-types --test tests/rendered-html.test.mjs`
