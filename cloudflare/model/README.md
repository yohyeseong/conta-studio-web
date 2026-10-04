# Prepared model source delivery

This edition reindexes the **already published** `korea-data` commit
`81e2224a3f860ca60cb07565f1979c221cc1fb26`. It never reads or uploads the
original PBF, downloaded private ZIP files, SQLite indexes, or private masks.
OSM, the published national standard node/link roads, and Copernicus elevation
keep their existing attribution and license obligations. The downloaded
real-width roads and address-road datasets are not included.

Every compressed input is checked against its catalog's byte length, SHA-256,
expanded length, source edition, schema, and safe-only flag. Each 0.01 degree
cell receives the complete original feature geometry and properties for
overlapping bounding boxes, with no simplification or boundary clipping.
Published exclusion boxes are retained. Features crossing cells are deduplicated
by source ID in the browser. Official building enrichment and selection safety
validation still happen after loading.

Cells are independently gzipped and concatenated into 0.05 degree `.pack`
assets. A catalog records byte offsets, compressed and raw sizes, SHA-256, and
feature counts. The Worker sends HTTP 206 with the exact requested byte range.
The client rejects wrong status, range, lengths, digest, schema, edition, or
feature count before using any geometry. Empty areas are represented by the
complete catalog, not by an unverified network fallback.

The page uses mesh previews and keeps the existing Rhino NURBS/Brep exporter.
`window.contaGenerationTiming` reports source, geometry, rendering, and total
generation times; page startup timings must not be reported as generation times.
