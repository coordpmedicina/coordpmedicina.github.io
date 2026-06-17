// Supabase Configuration
const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY1MTAxNDksImV4cCI6MjAyMjA4NjE0OX0.XW4kL-7VZPr3rKcDh_wLJi0DTzqQe9mYvI5P8rN7LfI';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check Supabase connection
async function testSupabaseConnection() {
    try {
        const { error } = await supabase.from('microcurriculums').select('count()', { count: 'exact' }).limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✓ Supabase connected');
        return true;
    } catch (error) {
        console.error('✗ Supabase connection error:', error);
        return false;
    }
}

async function initializeDatabase() {
    try {
        const { error: checkError } = await supabase.from('microcurriculums').select('id').limit(1);
        if (checkError && checkError.code === 'PGRST116') {
            console.log('Tables do not exist');
            return false;
        }
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
}
