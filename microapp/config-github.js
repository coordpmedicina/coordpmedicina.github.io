// ============================================
// MICROAPP - CONFIGURACIÓN PARA GITHUB PAGES
// ============================================

// Supabase Configuration
// Si tienes credenciales de Supabase, reemplaza estos valores
const SUPABASE_URL = 'https://dljhbtmtjuqmagfetsql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsamhidG10anVxbWFnZmV0c3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY1MTAxNDksImV4cCI6MjAyMjA4NjE0OX0.XW4kL-7VZPr3rKcDh_wLJi0DTzqQe9mYvI5P8rN7LfI';

// Initialize Supabase client (si está disponible)
let supabase = null;
if (typeof window !== 'undefined' && window.supabase) {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.warn('Supabase initialization failed:', error);
    }
}

// Test Supabase connection
async function testSupabaseConnection() {
    if (!supabase) return false;

    try {
        const { error } = await supabase.from('microapp_data').select('id').limit(1);

        if (error && error.code !== 'PGRST116' && error.status !== 401) {
            throw error;
        }

        console.log('✓ Supabase connection OK');
        return true;
    } catch (error) {
        console.warn('⚠ Supabase not available. Using local storage:', error.message);
        return false;
    }
}

// Database initialization (stub - not needed for local storage)
async function initializeDatabase() {
    console.log('ℹ Using local storage mode');
    return true;
}
