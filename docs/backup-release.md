# Backup publication and release

A day is available after its pages and manifest are written and a conditional R2 write publishes the manifest reference. The same catalog supplies the date list, the newest backup and the running cursor. A simultaneous completion that loses that write uses the published result or retries the current cursor. The losing pages remain private until retention removes their date. A failed repeat on the same day leaves the previous publication available.

Numbered backups remain readable through their original daily manifests. The legacy KV index and newest-backup key remain available for the old summaries. No immutable page references are written to them. During the writer upgrade, an unfinished numbered run is restarted on fresh keys. Published numbered backups and their files are left in place.

History, download, browse and restore use the same manifest reader. History distinguishes an unavailable backup from a complete backup in which a record was absent. Its 40 R2 reads include the catalog, any fallback listing, manifests and pages. Downloads verify that every declared part exists before streaming. Restore scans every page and validates its records before it writes to Firestore or the recycle bin.

Retention runs once an hour when the upkeep invocation has enough subrequests left. It keeps the newest 30 published dates and the earliest published date of each of the most recent 12 represented months. It withdraws one expired date, then deletes its files in batches on later turns. An unindexed legacy manifest protects its date from orphan cleanup. The new writer stops before publishing more than 36 parts, leaving room for download and restore within a single free-tier invocation. A restore that would exceed the request budget asks the owner to select fewer records.

## Recommended release order

1. Deploy the reader-aware Worker at 100% with the plain Worker variable `BACKUP_WRITE_FORMAT=legacy`. It keeps making numbered backups and protects a numbered backup already published for the day. Keep this phase short and check a completed scheduled backup, a download and record history. Save the exact reader-aware build for rollback.
2. After verifying the reader release, activate the writer by removing `BACKUP_WRITE_FORMAT` on that build and moving traffic to it at 100%. Retire older Worker traffic before the first immutable publication. Verify the backup counts, read-only history and download on both an older day and a day published by the new writer.
3. After any immutable publication, use a reader-aware Worker with `BACKUP_WRITE_FORMAT=paused` if the writer needs to be rolled back. Reads for both formats remain available. The legacy writer refuses to start once the new catalog exists. Earlier Worker builds cannot resolve the new catalog. Preserve both formats in R2 throughout a rollback.

Use the normal release approval for each production step.
