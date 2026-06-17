// Supabase Configuration
const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY1MTAxNDksImV4cCI6MjAyMjA4NjE0OX0.XW4kL-7VZPr3rKcDh_wLJi0DTzqQe9mYvI5P8rN7LfI';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check Supabase connection
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('microcurriculums').select('count()', { count: 'exact' }).limit(1);
        if (error) throw error;
        console.log('✓ Supabase connected successfully');
        return true;
    } catch (error) {
        console.error('✗ Supabase connection error:', error);
        return false;
    }
}

// Create tables if they don't exist
async function initializeDatabase() {
    try {
        // Check if tables exist by trying to query them
        const { error: checkError } = await supabase.from('microcurriculums').select('id').limit(1);

        if (checkError && checkError.code === 'PGRST116') {
            console.log('Tables do not exist. Creating...');
            // Tables will be created manually in Supabase dashboard
            console.log('Please create tables in Supabase dashboard');
            return false;
        }

        console.log('✓ Database tables ready');
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
}

// Database schema documentation
const DATABASE_SCHEMA = `
-- Table: microcurriculums
CREATE TABLE microcurriculums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_name VARCHAR NOT NULL,
  subject_code VARCHAR NOT NULL UNIQUE,
  program_id UUID NOT NULL REFERENCES programs(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Table: microcurriculum_versions
CREATE TABLE microcurriculum_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  microcurriculum_id UUID NOT NULL REFERENCES microcurriculums(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  version_name VARCHAR,
  data JSONB NOT NULL,
  status VARCHAR DEFAULT 'draft', -- draft, approved, active, archived
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMP,
  notes TEXT,
  UNIQUE(microcurriculum_id, version_number)
);

-- Table: programs
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL, -- e.g., "Programa de Medicina"
  institution VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR NOT NULL UNIQUE,
  full_name VARCHAR,
  role VARCHAR, -- coordinator, teacher, admin
  institution VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_microcurriculums_subject_code ON microcurriculums(subject_code);
CREATE INDEX idx_microcurriculums_program_id ON microcurriculums(program_id);
CREATE INDEX idx_versions_microcurriculum_id ON microcurriculum_versions(microcurriculum_id);
CREATE INDEX idx_versions_status ON microcurriculum_versions(status);
`;
