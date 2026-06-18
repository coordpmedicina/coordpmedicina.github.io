// Supabase Configuration
const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjAxNDksImV4cCI6MjA5NzI5NjE0OX0.HZWFTb9-ovjLcUPHF9jsa-lGntdvkHXGQin43MGXwlk';

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSupabaseConnection() {
    try {
        const { error } = await supabase.from('microcurriculum_versions').select('count()', { count: 'exact' }).limit(1);
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        console.log('✓ Supabase connected');
        return true;
    } catch (error) {
        console.warn('⚠ Supabase unavailable, using local storage:', error.message);
        return false;
    }
}

async function initializeDatabase() {
    return true;
}
