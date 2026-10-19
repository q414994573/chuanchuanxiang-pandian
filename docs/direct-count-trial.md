# Direct counting trial

Count has three category subpages (45 Korean, 66 Chinese, 18 other), each preserving catalog order and remembering its last focused product. All categories share one session and a combined final review. Category progress is shown in sticky tabs. Reaching the end offers entry to the next category; incomplete decisions remain flagged.

The no-order dropdown and redundant physical/exception checkboxes were removed. Clicking No order explicitly processes a product and advances; entering a positive order and pressing Next confirms and advances. Skipping an untouched item preserves pending status. Inventory is optional and a blank remains blank, never zero. Supplied invalid stock or order values still block completion. Special product text and quantity/unit warnings remain advisory. Edits reopen processed decisions. Historical backups are accepted without inventing inventory numbers or physical-check flags.

Storage remains browser-local, with autosave, conflict checks, undo, previous-save recovery and JSON export/import. There is no cloud sync, no Google Sheets writeback and no automatic transmission to suppliers. Preserve backups and keep the spreadsheet as pilot reference. Reviewed quantities are locked; edits require another review. Copying is not sending.

Tests: node tests/count.test.cjs and node tests/count-ui.test.cjs. They verify explicit decision semantics, legacy backup compatibility, category counts, blank stock, invalid input protection, storage failures, conflict handling and restoration. UI tests use a DOM stub; real iPhone visual and keyboard testing remains unverified.
