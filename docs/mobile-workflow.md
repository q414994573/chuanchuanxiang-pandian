# Mobile inventory workflow

Compact list is default; the large-card preference is stored on the current browser. Details expose review decisions and original metadata. Official quantities stay read-only.

Review decisions are scoped to the date and snapshot fingerprint. A browser-local draft is supported alongside JSON export/import. Imports validate the exact snapshot, product identities, allowed statuses and supplier gates before replacing a draft. This is not cross-device cloud sync. Save an exported backup before changing browsers or clearing data. No orders are sent automatically.

Confirmed history is stored as immutable dated JSON under order-archives/. Add only verified snapshots and update index.json; never invent missing weeks. Row matching uses ID plus name, and quantity comparison does not convert units. Initial verified archive: 2026-10-18 only. Source revisions are retained in Git commit history.

Tests: from repository root run `node tests/review.test.cjs`. Tests use a lightweight DOM stub and validate review transitions, snapshots, backup validation, search behavior, layout state and comparisons. They are not visual/browser tests. Real iPhone layout and touch QA remain outstanding.
