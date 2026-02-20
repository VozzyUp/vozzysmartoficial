/**
 * Google Maps Prospecting Utilities
 * 
 * Funções para buscar dados do Google Maps via HasData API
 * e obter coordenadas via Nominatim
 */

export interface GoogleMapsSearchParams {
  query: string
  ll?: string // Formato: @lat,lon,zoomz
  start?: number // Paginação (0, 20, 40, etc.)
}

export interface GoogleMapsResult {
  title?: string
  name?: string
  business_name?: string
  phone?: string
  telephone?: string
  address?: string
  website?: string
  type?: string
  category?: string
  rating?: number
  reviews?: number
  review_count?: number
}

export interface GoogleMapsResponse {
  localResults?: GoogleMapsResult[] | GoogleMapsResult
  local_results?: GoogleMapsResult[] | GoogleMapsResult // snake_case (formato HasData)
  placeResults?: GoogleMapsResult
  place_results?: GoogleMapsResult // snake_case
  results?: GoogleMapsResult[]
  data?: GoogleMapsResult[]
  [key: string]: any
}

export interface Coordinates {
  lat: number
  lon: number
}

/**
 * Busca coordenadas de uma localização via Nominatim (OpenStreetMap)
 */
export async function getCoordinates(location: string): Promise<Coordinates | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
    console.log('[getCoordinates] Buscando coordenadas para:', location)
    console.log('[getCoordinates] URL Nominatim:', url)
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VozzySmart/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('[getCoordinates] Resposta Nominatim:', {
      resultsCount: Array.isArray(data) ? data.length : 0,
      firstResult: Array.isArray(data) && data.length > 0 ? data[0] : null,
    })

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[getCoordinates] Nenhum resultado encontrado para:', location)
      return null
    }

    const result = data[0]
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)

    if (isNaN(lat) || isNaN(lon)) {
      console.error('[getCoordinates] Coordenadas inválidas:', { lat: result.lat, lon: result.lon })
      return null
    }

    console.log('[getCoordinates] Coordenadas obtidas:', { lat, lon })
    return { lat, lon }
  } catch (error) {
    console.error('[getCoordinates] Erro:', error)
    return null
  }
}

/**
 * Formata coordenadas para o formato esperado pela HasData API
 * Formato: @lat,lon,zoomz (ex: @40.7455096,-74.0083012,14z)
 */
export function formatCoordinatesForHasData(coords: Coordinates, zoom: number = 14): string {
  return `@${coords.lat},${coords.lon},${zoom}z`
}

/**
 * Busca dados do Google Maps via HasData API
 */
export async function fetchGoogleMapsData(
  params: GoogleMapsSearchParams,
  apiKey: string
): Promise<GoogleMapsResponse> {
  const { query, ll, start = 0 } = params

  // Construir URL com query parameters (GET request)
  // Documentação: https://docs.hasdata.com/apis/google-maps/search
  const url = new URL('https://api.hasdata.com/scrape/google-maps/search')
  url.searchParams.set('q', query)
  if (ll) {
    url.searchParams.set('ll', ll)
  }
  if (start > 0) {
    url.searchParams.set('start', start.toString())
  }
  // gl e hl para resultados no Brasil (country=BR, language=pt)
  url.searchParams.set('gl', 'br')
  url.searchParams.set('hl', 'pt')

  console.log('[fetchGoogleMapsData] Parâmetros:', {
    query,
    ll,
    start,
    queryEncoded: encodeURIComponent(query),
    llFormatted: ll,
  })
  console.log('[fetchGoogleMapsData] Método: GET')
  console.log('[fetchGoogleMapsData] URL completa:', url.toString())
  console.log('[fetchGoogleMapsData] Headers:', {
    'x-api-key': apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING',
  })

  // GET request - HasData usa x-api-key (sem Content-Type para GET)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[fetchGoogleMapsData] Erro na resposta:', response.status, errorText)
    throw new Error(`HasData API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  console.log('[fetchGoogleMapsData] Resposta recebida (raw):', JSON.stringify(data, null, 2))
  console.log('[fetchGoogleMapsData] Resposta recebida (resumo):', {
    hasLocalResults: !!data.localResults,
    localResultsType: typeof data.localResults,
    localResultsLength: Array.isArray(data.localResults) ? data.localResults.length : 'N/A',
    hasPlaceResults: !!data.placeResults,
    keys: Object.keys(data),
    statusCode: response.status,
  })
  
  // Verificar se há estrutura diferente na resposta
  if (data.results && Array.isArray(data.results)) {
    console.log('[fetchGoogleMapsData] Encontrado campo "results" com', data.results.length, 'itens')
  }
  if (data.data && Array.isArray(data.data)) {
    console.log('[fetchGoogleMapsData] Encontrado campo "data" com', data.data.length, 'itens')
  }
  
  return data as GoogleMapsResponse
}

/**
 * Processa resultados do Google Maps e retorna array limpo
 */
export function processProspectingResults(data: GoogleMapsResponse): GoogleMapsResult[] {
  const results: GoogleMapsResult[] = []

  console.log('[processProspectingResults] Estrutura dos dados:', {
    hasLocalResults: !!data.localResults,
    localResultsType: Array.isArray(data.localResults) ? 'array' : typeof data.localResults,
    localResultsLength: Array.isArray(data.localResults) ? data.localResults.length : 'N/A',
    hasPlaceResults: !!data.placeResults,
    allKeys: Object.keys(data),
  })

  const dataAny = data as Record<string, unknown>

  // Normaliza array de resultados (suporta camelCase e snake_case)
  const addFromField = (field: string, arr: unknown) => {
    if (Array.isArray(arr)) {
      console.log(`[processProspectingResults] Adicionando ${arr.length} resultados de "${field}"`)
      results.push(...(arr as GoogleMapsResult[]))
    } else if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
      console.log(`[processProspectingResults] "${field}" é objeto único, convertendo`)
      results.push(arr as GoogleMapsResult)
    }
  }

  addFromField('localResults', data.localResults)
  addFromField('local_results', data.local_results)
  addFromField('placeResults', data.placeResults)
  addFromField('place_results', data.place_results)
  addFromField('results', dataAny.results)
  addFromField('data', dataAny.data)

  // Verificar outros campos com array de resultados
  const knownFields = ['localResults', 'local_results', 'placeResults', 'place_results', 'results', 'data']
  for (const key of Object.keys(dataAny)) {
    if (!knownFields.includes(key)) {
      const value = dataAny[key]
      if (Array.isArray(value) && value.length > 0) {
        // Verificar se parece ser um array de resultados (tem propriedades como title, phone, etc)
        const firstItem = value[0]
        if (firstItem && typeof firstItem === 'object' && (firstItem.title || firstItem.phone || firstItem.address)) {
          console.log(`[processProspectingResults] Encontrado campo "${key}" com ${value.length} itens que parecem resultados`)
          results.push(...value)
        }
      }
    }
  }

  console.log('[processProspectingResults] Total de resultados processados:', results.length)
  
  if (results.length === 0) {
    console.warn('[processProspectingResults] ATENÇÃO: Nenhum resultado encontrado na resposta da API')
    console.warn('[processProspectingResults] Estrutura completa da resposta:', JSON.stringify(data, null, 2))
  }
  
  return results
}
