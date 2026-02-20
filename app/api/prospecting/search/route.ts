import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { ProspectingSearchSchema, validateBody, formatZodErrors, extractErrorMessage } from '@/lib/api-validation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'
import { fetchGoogleMapsData, getCoordinates, formatCoordinatesForHasData, processProspectingResults } from '@/lib/prospecting/google-maps'
import { filterValidWhatsAppPhones } from '@/lib/prospecting/phone-filter'
import { checkExistingPhones, markDuplicates } from '@/lib/prospecting/deduplication'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SearchResponse {
  results: Array<{
    empresa: string
    telefone: string
    endereco: string
    website: string
    categoria: string
    avaliacao?: number | null
    total_avaliacoes?: number | null
    email?: string | null
    isDuplicate: boolean
  }>
  total: number
  novos: number
  duplicados: number
}

/**
 * POST /api/prospecting/search
 * Busca dados do Google Maps via HasData API
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json()

    // Validar input
    const validation = validateBody(ProspectingSearchSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase não configurado' },
        { status: 500 }
      )
    }

    let config: {
      nicho: string
      localizacoes: string[]
      variacoes: string[]
      paginas_por_localizacao: number
      hasdata_api_key: string
    }

    // Se configId foi fornecido, buscar configuração do banco
    if (validation.data.configId) {
      const { data: configData, error: configError } = await supabase
        .from('prospecting_configs')
        .select('*')
        .eq('id', validation.data.configId)
        .single()

      if (configError || !configData) {
        return NextResponse.json(
          { error: 'Modelo de busca não encontrado' },
          { status: 404 }
        )
      }

      config = {
        nicho: configData.nicho,
        localizacoes: Array.isArray(configData.localizacoes) ? configData.localizacoes : [],
        variacoes: Array.isArray(configData.variacoes) ? configData.variacoes : [],
        paginas_por_localizacao: configData.paginas_por_localizacao || 3,
        hasdata_api_key: configData.hasdata_api_key,
      }
    } else {
      // Usar configuração inline
      config = {
        nicho: validation.data.nicho!,
        localizacoes: validation.data.localizacoes!,
        variacoes: validation.data.variacoes || [],
        paginas_por_localizacao: validation.data.paginas_por_localizacao || 3,
        hasdata_api_key: validation.data.hasdata_api_key || '',
      }
    }

    // Resolver chave HasData: env -> settings (cache) -> config
    const envKey = process.env.HASDATA_API_KEY
    const settingsKey = await settingsDb.get('hasdata_api_key')
    const configKey = config.hasdata_api_key
    
    let hasdataApiKey: string = envKey || settingsKey || configKey || ''

    console.log('[Prospecting Search] Resolução de API Key:', {
      temEnvKey: !!envKey,
      temSettingsKey: !!settingsKey,
      temConfigKey: !!configKey,
      temApiKeyFinal: !!hasdataApiKey,
    })

    if (!hasdataApiKey) {
      return NextResponse.json(
        { error: 'Chave API HasData não configurada. Configure em Modelo de busca ou nas configurações.' },
        { status: 400 }
      )
    }

    // Determinar localização e variação para buscar
    const localizacao = validation.data.localizacao || config.localizacoes[0] || ''
    const variacao = validation.data.variacao || (config.variacoes.length > 0 ? config.variacoes[0] : '')
    const pagina = validation.data.pagina || 0

    if (!localizacao) {
      return NextResponse.json(
        { error: 'Localização é obrigatória' },
        { status: 400 }
      )
    }

    // Construir query
    const localizacaoParaQuery = localizacao.includes(',')
      ? localizacao.split(',')[0].trim() // Só o bairro
      : localizacao // Cidade completa

    // Construir query: se tem variação, adiciona antes do nicho
    // Ex: "hamburgueria Lanchonete em São Paulo" ou "Lanchonete em São Paulo"
    let query = ''
    if (variacao && variacao.trim()) {
      // Se variação não contém palavras-chave de localização, adiciona antes do nicho
      const variacaoLower = variacao.toLowerCase().trim()
      if (!variacaoLower.includes('raio') && !variacaoLower.includes('km')) {
        query = `${variacao} ${config.nicho}`
      } else {
        // Variações como "raio de 10km" não devem entrar na query
        query = config.nicho
      }
    } else {
      query = config.nicho
    }
    query += ` em ${localizacaoParaQuery}`
    
    console.log('[Prospecting Search] Query construída:', query.trim())

    // Buscar coordenadas
    const coords = await getCoordinates(localizacao)
    if (!coords) {
      return NextResponse.json(
        { error: `Não foi possível encontrar coordenadas para: ${localizacao}` },
        { status: 400 }
      )
    }

    const ll = formatCoordinatesForHasData(coords)

    // Buscar dados do Google Maps
    const start = pagina * 20
    console.log('[Prospecting Search] Buscando:', { query: query.trim(), ll, start, hasApiKey: !!hasdataApiKey })
    
    const mapsData = await fetchGoogleMapsData(
      {
        query: query.trim(),
        ll,
        start,
      },
      hasdataApiKey
    )

    console.log('[Prospecting Search] Dados recebidos do HasData:', {
      hasLocalResults: !!mapsData.localResults,
      localResultsCount: mapsData.localResults?.length || 0,
      hasPlaceResults: !!mapsData.placeResults,
    })

    // Processar resultados
    const rawResults = processProspectingResults(mapsData)
    console.log('[Prospecting Search] Resultados processados:', rawResults.length)

    if (rawResults.length === 0) {
      console.warn('[Prospecting Search] Nenhum resultado retornado pela API HasData')
      return NextResponse.json({
        results: [],
        total: 0,
        novos: 0,
        duplicados: 0,
      })
    }

    // Converter para formato interno
    const processedResults = rawResults.map((item, idx) => {
      const telefoneRaw = item.phone || ''
      const telefoneLimpo = telefoneRaw.replace(/\D/g, '')
      
      console.log(`[Prospecting Search] Item ${idx}:`, {
        empresa: item.title,
        telefoneRaw,
        telefoneLimpo,
        temTelefone: !!telefoneLimpo,
      })

      return {
        empresa: (item.title || '').trim(),
        telefone: telefoneLimpo,
        endereco: (item.address || '').trim(),
        website: (item.website || '').trim(),
        categoria: (item.type || '').trim(),
        avaliacao: item.rating || null,
        total_avaliacoes: item.reviews || null,
        email: null as string | null, // Email não vem do Google Maps
      }
    })

    console.log('[Prospecting Search] Processados:', {
      total: processedResults.length,
      comTelefone: processedResults.filter(r => r.telefone).length,
    })

    // Se nenhum resultado tem telefone, retornar vazio com aviso
    const resultadosComTelefone = processedResults.filter(r => r.telefone && r.telefone.trim())
    if (resultadosComTelefone.length === 0) {
      console.warn('[Prospecting Search] Nenhum resultado possui telefone')
      return NextResponse.json({
        results: [],
        total: 0,
        novos: 0,
        duplicados: 0,
        warning: 'Nenhum resultado encontrado possui telefone válido',
      })
    }

    // Filtrar apenas telefones válidos para WhatsApp
    const telefonesParaValidar = resultadosComTelefone.map(r => r.telefone)
    console.log('[Prospecting Search] Telefones para validar:', telefonesParaValidar.length)
    
    const validPhones = filterValidWhatsAppPhones(telefonesParaValidar)

    console.log('[Prospecting Search] Telefones validados:', {
      total: validPhones.length,
      validos: validPhones.filter(p => p.isValid && p.isMobile).length,
      invalidos: validPhones.filter(p => !p.isValid || !p.isMobile).length,
    })

    // Criar mapa de telefones válidos
    const validPhonesMap = new Map<string, boolean>()
    validPhones.forEach(p => {
      if (p.isValid && p.isMobile) {
        validPhonesMap.set(p.normalized, true)
      }
    })

    // Filtrar resultados com telefones válidos e normalizar
    const filteredResults = processedResults
      .filter(r => {
        if (!r.telefone || !r.telefone.trim()) return false
        const phoneData = validPhones.find(p => p.original === r.telefone)
        const isValid = phoneData?.isValid && phoneData?.isMobile && phoneData.normalized
        if (!isValid && phoneData) {
          console.log('[Prospecting Search] Resultado filtrado:', {
            empresa: r.empresa,
            telefone: r.telefone,
            motivo: phoneData.error,
          })
        }
        return isValid
      })
      .map(r => {
        const phoneData = validPhones.find(p => p.original === r.telefone)
        return {
          ...r,
          telefone: phoneData?.normalized || r.telefone,
        }
      })

    console.log('[Prospecting Search] Após filtro WhatsApp:', {
      total: filteredResults.length,
      empresas: filteredResults.map(r => r.empresa),
    })

    // Remover duplicatas dentro do próprio resultado
    const uniqueResults: typeof filteredResults = []
    const seenPhones = new Set<string>()
    for (const result of filteredResults) {
      if (!seenPhones.has(result.telefone)) {
        seenPhones.add(result.telefone)
        uniqueResults.push(result)
      }
    }

    // Verificar duplicatas no banco
    const existingPhones = await checkExistingPhones(
      uniqueResults.map(r => r.telefone)
    )

    // Marcar duplicatas
    const finalResults = markDuplicates(uniqueResults, existingPhones)

    const novos = finalResults.filter(r => !r.isDuplicate).length
    const duplicados = finalResults.filter(r => r.isDuplicate).length

    console.log('[Prospecting Search] Resultado final:', {
      total: finalResults.length,
      novos,
      duplicados,
      empresas: finalResults.map(r => r.empresa),
    })

    // Se não há resultados após todos os filtros, adicionar informação de debug
    if (finalResults.length === 0) {
      console.warn('[Prospecting Search] Nenhum resultado após filtros:', {
        rawResultsCount: rawResults.length,
        processedCount: processedResults.length,
        validPhonesCount: validPhones.filter(p => p.isValid && p.isMobile).length,
        filteredCount: filteredResults.length,
        uniqueCount: uniqueResults.length,
      })
    }

    const response: SearchResponse = {
      results: finalResults,
      total: finalResults.length,
      novos,
      duplicados,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Prospecting Search] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao buscar dados') },
      { status: 500 }
    )
  }
}
