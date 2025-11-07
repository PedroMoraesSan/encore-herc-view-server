-- Drop indexes
DROP INDEX IF EXISTS idx_processing_history_status;
DROP INDEX IF EXISTS idx_processing_history_started_at;

-- Drop table
DROP TABLE IF EXISTS processing_history;

