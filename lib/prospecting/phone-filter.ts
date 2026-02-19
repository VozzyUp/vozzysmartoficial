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

  for (const phone of phones) {
    if (!phone || typeof phone !== 'string') {
      continue
    }

    const normalized = normalizePhoneNumber(phone.trim())
    
    if (!normalized) {
      processed.push({
        original: phone,
        normalized: '',
        isValid: false,
        isMobile: false,
        error: 'Não foi possível normalizar o telefone',
      })
      continue
    }

    const validation = validatePhoneNumber(normalized)

    if (!validation.isValid) {
      processed.push({
        original: phone,
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
      processed.push({
        original: phone,
        normalized,
        isValid: false,
        isMobile: false,
        error: 'WhatsApp requer números de celular (não aceita fixos)',
      })
      continue
    }

    processed.push({
      original: phone,
      normalized,
      isValid: true,
      isMobile: true,
    })
  }

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
