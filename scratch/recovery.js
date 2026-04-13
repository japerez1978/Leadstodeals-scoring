import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

const TENANT_ID = 1 // Intranox
const APP_SLUG = 'ltd-score' // LeadsToDeals Score

const USERS_TO_INVITE = [
  'ja.perez@intranox.com',
  'juan.angel.perez@outlook.es',
  'josemanuel@talleresruiz.com'
]

async function runRecovery() {
  console.log('🚀 INICIANDO PROCESO DE RECUPERACIÓN MULTI-TENANT (v3)...')

  // 1. Vincular App al Tenant
  console.log('\n--- 1. ACTIVANDO LICENCIA EN tenant_apps ---')
  const { error: subError } = await supabase.from('tenant_apps').upsert({
    tenant_id: TENANT_ID,
    app_slug: APP_SLUG,
    activa: true,
    precio_mes: 99
  })
  if (subError) console.error('❌ Error al vincular app:', subError.message)
  else console.log('✅ Licencia ACTIVADA para Intranox (Slug: ltd-score)')

  // 2. Procesar Usuarios
  console.log('\n--- 2. PROCESANDO USUARIOS ---')
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
  
  for (const email of USERS_TO_INVITE) {
    console.log(`\nRevisando: ${email}...`)
    
    // Ver si ya existe en Auth
    const existing = authUsers.find(u => u.email === email)
    
    if (existing) {
      console.log(`✅ Usuario ya existe en Auth (ID: ${existing.id}). Sincronizando...`)
      await syncUser(email, existing.id)
    } else {
      console.log(`ℹ️ Usuario no existe. Enviando invitación...`)
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email)
      if (inviteError) console.error('❌ Error invitando:', inviteError.message)
      else {
        console.log(`✅ Invitación enviada. ID: ${inviteData.user.id}`)
        await syncUser(email, inviteData.user.id)
      }
    }
  }

  console.log('\n--- RECUPERACIÓN COMPLETADA ---')
}

async function syncUser(email, authId) {
  const { error: syncError } = await supabase
    .from('tenant_users')
    .update({ auth_user_id: authId })
    .eq('email', email)
    .eq('tenant_id', TENANT_ID)
  
  if (syncError) console.error(`❌ Error sincronizando ${email}:`, syncError.message)
  else console.log(`✅ ${email} vinculado correctamente`)
}

runRecovery()
