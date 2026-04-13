import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxODk3MywiZXhwIjoyMDkwOTk0OTczfQ.vnpIKSgxZYCasl2u8PBmhFkCR4Ni9GDe3H4kQc62cIU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function updateCriteria() {
  console.log('--- ACTUALIZACIÓN DE CONSISTENCIA P7 ---')
  
  // Buscamos la fila por su ID y sort_order
  const { data, error } = await supabase
    .from('scoring_criteria') // Probamos el nombre más probable según el esquema
    .update({ code: 'P7' })
    .eq('sort_order', 7)
    .eq('hubspot_property', 'nivel_de_cliente')
    .select()

  if (error) {
    console.error('❌ Error al actualizar:', error.message)
    // Si falla por el nombre de la tabla, probamos 'criteria'
    if (error.message.includes('not found')) {
        const { data: d2, error: e2 } = await supabase
            .from('criteria')
            .update({ code: 'P7' })
            .eq('sort_order', 7)
            .select()
        console.log('Resultado en criteria:', d2 || e2.message)
    }
  } else {
    console.log('✅ Registro actualizado con éxito:', data)
  }
}

updateCriteria()
