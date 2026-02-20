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
  phone?: string
  address?: string
  website?: string
  type?: string
  rating?: number
  reviews?: number
}

export interface GoogleMapsResponse {
  localResults?: GoogleMapsResult[] | GoogleMapsResult
  placeResults?: GoogleMapsResult
  results?: GoogleMapsResult[] // Algumas APIs retornam em "results"
  data?: GoogleMapsResult[] // Outras retornam em "data"
  [key: string]: any // Permitir outros campos
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
 * Formato: @lat,lon,zoomz
 */
export function formatCoordinatesForHasData(coords: Coordinates, zoom: number = 12): string {
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
  const url = new URL('https://api.hasdata.com/scrape/google-maps/search')
  url.searchParams.set('q', query)
  if (ll) {
    url.searchParams.set('ll', ll)
  }
  if (start > 0) {
    url.searchParams.set('start', start.toString())
  }

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
    'Content-Type': 'application/json',
  })

  // GET request - sem body
  const response = await fetch(url.toString(), {
    method: 'GET', // Explicitamente GET
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    // SEM body - GET não deve ter body
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

  // Processar localResults (array de resultados)
  if (data.localResults && Array.isArray(data.localResults)) {
    console.log('[processProspectingResults] Adicionando', data.localResults.length, 'resultados de localResults')
    results.push(...data.localResults)
  } else if (data.localResults && typeof data.localResults === 'object') {
    // Pode ser um objeto único ao invés de array
    console.log('[processProspectingResults] localResults é objeto único, convertendo')
    results.push(data.localResults as GoogleMapsResult)
  }

  // Processar placeResults (resultado único)
  if (data.placeResults) {
    console.log('[processProspectingResults] Adicionando placeResults')
    results.push(data.placeResults)
  }

  // Verificar se há outros campos que podem conter resultados
  const dataAny = data as any
  
  // Verificar campo "results" (formato alternativo)
  if (dataAny.results && Array.isArray(dataAny.results)) {
    console.log('[processProspectingResults] Encontrado campo "results" com', dataAny.results.length, 'itens')
    results.push(...dataAny.results)
  }
  
  // Verificar campo "data" (formato alternativo)
  if (dataAny.data && Array.isArray(dataAny.data)) {
    console.log('[processProspectingResults] Encontrado campo "data" com', dataAny.data.length, 'itens')
    results.push(...dataAny.data)
  }
  
  // Verificar se há um campo com array de objetos que parecem resultados
  for (const key of Object.keys(dataAny)) {
    if (key !== 'localResults' && key !== 'placeResults' && key !== 'results' && key !== 'data') {
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
