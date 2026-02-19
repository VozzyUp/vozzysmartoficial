import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { SaveProspectingContactsSchema, validateBody, formatZodErrors, extractErrorMessage } from '@/lib/api-validation'
import { contactDb } from '@/lib/supabase-db'
import { ContactStatus } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SaveContactsResponse {
  inserted: number
  updated: number
  total: number
}

/**
 * POST /api/prospecting/save-contacts
 * Salva contatos encontrados na prospecção
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json()

    // Validar input
    const validation = validateBody(SaveProspectingContactsSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const { contacts } = validation.data

    // Converter para formato de contato
    const contactsToImport = contacts.map(c => ({
      name: c.empresa || '',
      phone: c.telefone,
      email: c.email || null,
      status: ContactStatus.OPT_IN,
      tags: [],
      custom_fields: {
        endereco: c.endereco || '',
        website: c.website || '',
        categoria: c.categoria || '',
        avaliacao: c.avaliacao || null,
        total_avaliacoes: c.total_avaliacoes || null,
        origem: 'prospecção_google_maps',
      },
    }))

    // Usar contactDb.import() existente
    const result = await contactDb.import(contactsToImport)

    const response: SaveContactsResponse = {
      inserted: result.inserted,
      updated: result.updated,
      total: contacts.length,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Prospecting Save Contacts] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao salvar contatos') },
      { status: 500 }
    )
  }
}
