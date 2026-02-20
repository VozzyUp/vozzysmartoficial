/**
 * Phone Filter Utilities
 * 
 * Funções para filtrar e validar telefones para WhatsApp
 */

import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone-formatter'

export interface ProcessedPhone {
  original: string
  normalized: string
  isValid: boolean
  isMobile: boolean
  error?: string
}

/**
 * Filtra apenas telefones válidos para WhatsApp (celulares)
 */
export function filterValidWhatsAppPhones(phones: string[]): ProcessedPhone[] {
  const processed: ProcessedPhone[] = []

  console.log('[filterValidWhatsAppPhones] Processando', phones.length, 'telefones')

  for (const phone of phones) {
    if (!phone || typeof phone !== 'string') {
      console.log('[filterValidWhatsAppPhones] Telefone inválido (não string):', phone)
      continue
    }

    const phoneTrimmed = phone.trim()
    if (!phoneTrimmed) {
      console.log('[filterValidWhatsAppPhones] Telefone vazio')
      continue
    }

    const normalized = normalizePhoneNumber(phoneTrimmed)
    
    if (!normalized) {
      console.log('[filterValidWhatsAppPhones] Falha ao normalizar:', phoneTrimmed)
      processed.push({
        original: phoneTrimmed,
        normalized: '',
        isValid: false,
        isMobile: false,
        error: 'Não foi possível normalizar o telefone',
      })
      continue
    }

    const validation = validatePhoneNumber(normalized)

    if (!validation.isValid) {
      console.log('[filterValidWhatsAppPhones] Telefone inválido:', phoneTrimmed, '->', normalized, 'Erro:', validation.error)
      processed.push({
        original: phoneTrimmed,
        normalized,
        isValid: false,
        isMobile: false,
        error: validation.error || 'Telefone inválido',
      })
      continue
    }

    // Verificar se é celular (WhatsApp requer celular)
    const isMobile = validation.metadata?.type === 'MOBILE' || 
                     validation.metadata?.type === 'FIXED_LINE_OR_MOBILE'

    if (!isMobile) {
      console.log('[filterValidWhatsAppPhones] Não é celular:', phoneTrimmed, '->', normalized, 'Tipo:', validation.metadata?.type)
      processed.push({
        original: phoneTrimmed,
        normalized,
        isValid: false,
        isMobile: false,
        error: 'WhatsApp requer números de celular (não aceita fixos)',
      })
      continue
    }

    console.log('[filterValidWhatsAppPhones] Telefone válido:', phoneTrimmed, '->', normalized)
    processed.push({
      original: phoneTrimmed,
      normalized,
      isValid: true,
      isMobile: true,
    })
  }

  const validCount = processed.filter(p => p.isValid && p.isMobile).length
  console.log('[filterValidWhatsAppPhones] Resultado:', {
    total: processed.length,
    validos: validCount,
    invalidos: processed.length - validCount,
  })

  return processed
}

/**
 * Filtra apenas telefones válidos e retorna apenas os normalizados
 */
export function getValidWhatsAppPhones(phones: string[]): string[] {
  const processed = filterValidWhatsAppPhones(phones)
  return processed
    .filter(p => p.isValid && p.isMobile)
    .map(p => p.normalized)
}
