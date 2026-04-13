import { createClient } from '@supabase/supabase-js'

// Credenciales directas para diagnóstico
const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnostic() {
  console.log('--- RADIOGRAFÍA MULTI-TENANT ---')
  
  try {
    // 1. Listar Tenants
    const { data: tenants } = await supabase.from('tenants').select('id, nombre')
    console.log('\nTENANTS:', JSON.stringify(tenants, null, 2))

    // 2. Listar Apps
    const { data: apps } = await supabase.from('apps').select('id, name, slug')
    console.log('\nAPPS:', JSON.stringify(apps, null, 2))

    // 3. Ver suscripciones actuales
    const { data: subs } = await supabase.from('tenants_apps').select('*')
    console.log('\nSUBSCRIPCIONES ACTUALES:', JSON.stringify(subs, null, 2))

    // 4. Ver usuarios huérfanos
    const { data: users } = await supabase.from('tenant_users').select('*').is('auth_user_id', null)
    console.log('\nUSUARIOS SIN AUTH ID:', JSON.stringify(users, null, 2))
  } catch (e) {
    console.error('Error en diagnóstico:', e.message)
  }
}

diagnostic()
