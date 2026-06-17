// ============================================
// MICROAPP - CONFIGURACIÓN PARA GITHUB PAGES
// ============================================

const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY1MTAxNDksImV4cCI6MjAyMjA4NjE0OX0.XW4kL-7VZPr3rKcDh_wLJi0DTzqQe9mYvI5P8rN7LfI';

let supabase = null;
if (typeof window !== 'undefined' && window.supabase) {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.warn('Supabase initialization failed:', error);
    }
}

async function testSupabaseConnection() {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('microcurriculum_versions').select('count()', { count: 'exact' }).limit(1);
        if (error && error.code !== 'PGRST116' && error.status !== 401) {
            throw error;
        }
        console.log('✓ Supabase connection OK');
        return true;
    } catch (error) {
        console.warn('⚠ Usando almacenamiento local:', error.message);
        return false;
    }
}

async function initializeDatabase() {
    console.log('ℹ Usando almacenamiento local');
    return true;
}
