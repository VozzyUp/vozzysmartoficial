import { NextRequest, NextResponse } from 'next/server'
import { parsePhoneNumber } from 'libphonenumber-js'
import { supabase } from '@/lib/supabase'
import { getBrazilUfFromPhone } from '@/lib/br-geo'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { requireSessionOrApiKey } from '@/lib/request-auth'

const parseList = (value: string | null): string[] => {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const resolveCountry = (phone: string): string | null => {
  const normalized = normalizePhoneNumber(String(phone || '').trim())
  if (!normalized) return null
  try {
    const parsed = parsePhoneNumber(normalized)
    return parsed?.country || null
  } catch {
    return null
  }
}

/**
 * GET /api/contacts/segment-count
 * Retorna contagem real de contatos com filtros por tags, pais (ISO) e UF (BR)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const url = new URL(request.url)
    const tags = parseList(url.searchParams.get('tags'))
    const countries = parseList(url.searchParams.get('countries'))
    const states = parseList(url.searchParams.get('states'))
    const combine = (url.searchParams.get('combine') || 'or').toLowerCase() === 'and' ? 'and' : 'or'

    const { data, error } = await supabase
      .from('contacts')
      .select('phone,tags')

    if (error) throw error

    const contacts = data || []
    const total = contacts.length

    if (!tags.length && !countries.length && !states.length) {
      return NextResponse.json({ total, matched: total })
    }

    const matched = contacts.reduce((count, contact) => {
      const contactTags = Array.isArray(contact.tags) ? contact.tags : []
      const phone = String(contact.phone || '')
      const country = countries.length ? resolveCountry(phone) : null
      const uf = states.length ? getBrazilUfFromPhone(phone) : null

      const tagMatches = tags.map((tag) => contactTags.includes(tag))
      const countryMatches = countries.map((code) => Boolean(country && country === code))
      const stateMatches = states.map((code) => Boolean(uf && uf === code))
      const filters = [...tagMatches, ...countryMatches, ...stateMatches]

      if (!filters.length) return count + 1
      const isMatch = combine === 'or' ? filters.some(Boolean) : filters.every(Boolean)
      return isMatch ? count + 1 : count
    }, 0)

    return NextResponse.json({ total, matched })
  } catch (error) {
    console.error('Failed to compute segment count:', error)
    return NextResponse.json(
      { error: 'Falha ao calcular contagem', details: (error as Error).message },
      { status: 500 }
    )
  }
}
