import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectSchema() {
  console.log('--- INSPECCIÓN DE ESQUEMA ---')
  
  // Consultamos el esquema de información (si tenemos permisos)
  const { data: tables, error } = await supabase.from('apps').select('*').limit(1)
  
  // Listamos todas las tablas visibles
  const { data, error: err } = await supabase.rpc('get_tables') 
  if (err) {
    // Si no hay RPC, probamos nombres comunes
    const commonNames = ['tenant_apps', 'tenants_apps', 'app_tenants', 'subscriptions']
    for (const name of commonNames) {
      const { error: e } = await supabase.from(name).select('*').limit(1)
      if (!e || e.code !== '42P01') {
        console.log(`✅ Tabla encontrada: ${name}`)
      }
    }
  } else {
    console.log('TABLAS:', data)
  }
}

inspectSchema()
