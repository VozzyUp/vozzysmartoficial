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
  localResults?: GoogleMapsResult[]
  placeResults?: GoogleMapsResult
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
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VozzySmart/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const data = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    const result = data[0]
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)

    if (isNaN(lat) || isNaN(lon)) {
      return null
    }

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

  const url = new URL('https://api.hasdata.com/scrape/google-maps/search')
  url.searchParams.set('q', query)
  if (ll) {
    url.searchParams.set('ll', ll)
  }
  if (start > 0) {
    url.searchParams.set('start', start.toString())
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HasData API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data as GoogleMapsResponse
}

/**
 * Processa resultados do Google Maps e retorna array limpo
 */
export function processProspectingResults(data: GoogleMapsResponse): GoogleMapsResult[] {
  const results: GoogleMapsResult[] = []

  // Processar localResults (array de resultados)
  if (data.localResults && Array.isArray(data.localResults)) {
    results.push(...data.localResults)
  }

  // Processar placeResults (resultado único)
  if (data.placeResults) {
    results.push(data.placeResults)
  }

  return results
}
