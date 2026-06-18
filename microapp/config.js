// ============================================
// MICROAPP - CONFIGURACIÓN SUPABASE
// ============================================

// Credenciales de Supabase
const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjAxNDksImV4cCI6MjA5NzI5NjE0OX0.HZWFTb9-ovjLcUPHF9jsa-lGntdvkHXGQin43MGXwlk';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Test Supabase connection
async function testSupabaseConnection() {
    try {
        const { error } = await supabase.from('microcurriculum_versions').select('count()', { count: 'exact' }).limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✓ Supabase connected successfully');
        return true;
    } catch (error) {
        console.error('Supabase error:', error);
        return false;
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        const { error: checkError } = await supabase.from('microcurriculum_versions').select('id').limit(1);
        if (checkError && checkError.code === 'PGRST116') {
            console.log('Tables do not exist. Creating...');
            return false;
        }
        console.log('✓ Database tables ready');
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
}
