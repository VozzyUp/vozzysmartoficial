/**
 * Deduplication Utilities
 * 
 * Funções para verificar telefones existentes no banco de dados
 */

import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Verifica quais telefones já existem no banco de dados
 * Retorna um Set com os telefones encontrados
 */
export async function checkExistingPhones(phones: string[]): Promise<Set<string>> {
  const supabase = getSupabaseAdmin()
  
  if (!supabase) {
    throw new Error('Supabase não configurado')
  }

  const existingPhones = new Set<string>()

  // Buscar em lotes de 100 telefones por vez (limite do Supabase)
  const BATCH_SIZE = 100

  for (let i = 0; i < phones.length; i += BATCH_SIZE) {
    const batch = phones.slice(i, i + BATCH_SIZE)

    try {
      // Buscar telefones usando filtro OR
      const { data, error } = await supabase
        .from('contacts')
        .select('phone')
        .in('phone', batch)

      if (error) {
        console.error('[checkExistingPhones] Erro ao buscar lote:', error)
        continue
      }

      if (data && Array.isArray(data)) {
        for (const row of data) {
          if (row.phone) {
            existingPhones.add(String(row.phone).trim())
          }
        }
      }
    } catch (error) {
      console.error('[checkExistingPhones] Erro ao processar lote:', error)
    }
  }

  return existingPhones
}

/**
 * Marca telefones como duplicados baseado em um Set de existentes
 */
export function markDuplicates<T extends { telefone: string }>(
  items: T[],
  existingPhones: Set<string>
): Array<T & { isDuplicate: boolean }> {
  return items.map(item => {
    const normalized = item.telefone.trim()
    const isDuplicate = existingPhones.has(normalized)
    return { ...item, isDuplicate }
  })
}
