import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function findTable() {
  const tables = ['criteria', 'scoring_criteria', 'matrix_criteria', 'deal_scoring_criteria']
  console.log('--- BUSCANDO TABLA DE CRITERIOS ---')
  
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id, name').limit(1)
    if (!error) {
      console.log(`✅ TABLA ENCONTRADA: ${t}`)
      const { data: updateData } = await supabase.from(t).update({ code: 'P7' }).eq('sort_order', 7).select()
      console.log('Resultado actualización:', updateData)
      return
    }
  }
  console.log('No se encontró la tabla en los nombres comunes.')
}

findTable()
