import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectColumns() {
  console.log('--- INSPECCIÓN DE COLUMNAS tenant_apps ---')
  const { data, error } = await supabase.from('tenant_apps').select('*').limit(1)
  if (error) {
    console.log('Error:', error.message)
  } else {
    console.log('COLUMNAS:', Object.keys(data[0] || {}))
  }
}

inspectColumns()
