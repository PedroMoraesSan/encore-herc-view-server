-- Create processing history table
CREATE TABLE IF NOT EXISTS processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- File information
  original_file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  records_count INTEGER NOT NULL,
  
  -- Processing details
  custom_prompt TEXT,
  
  -- Result
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'SUCCESS', 'ERROR')),
  error_message TEXT,
  processed_file_name TEXT,
  
  -- Metrics
  processing_time_ms INTEGER,
  tokens_used INTEGER,
  model_used TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index on started_at for faster queries
CREATE INDEX IF NOT EXISTS idx_processing_history_started_at 
  ON processing_history(started_at DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_processing_history_status 
  ON processing_history(status);

