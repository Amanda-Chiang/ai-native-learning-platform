-- Hardening-pass finding: neither existing Storage bucket had a
-- file_size_limit set, so an unbounded upload (a buggy client, or
-- outright abuse) could push arbitrarily large files, with a real
-- storage/egress cost -- caught by an audit, not a reported incident.
--
-- course-artifacts: real course material (slides, PDFs, scanned
-- notes) -- generous, but not unbounded.
-- assessment-drawings: a single canvas snapshot, which legitimately
-- never exceeds a few hundred KB -- a much tighter cap is appropriate.

update storage.buckets set file_size_limit = 52428800 -- 50 MiB
where id = 'course-artifacts';

update storage.buckets set file_size_limit = 5242880 -- 5 MiB
where id = 'assessment-drawings';
