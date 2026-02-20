/**
 * Prospecting Service
 * 
 * Wrapper para chamadas API de prospecção
 */

export interface ProspectingConfig {
  id: string
  name: string
  nicho: string
  localizacoes: string[]
  variacoes: string[]
  paginas_por_localizacao: number
  hasdata_api_key: string
  created_at: string
  updated_at: string
}

export interface ProspectingResult {
  empresa: string
  telefone: string
  endereco: string
  website: string
  categoria: string
  avaliacao?: number | null
  total_avaliacoes?: number | null
  email?: string | null
  isDuplicate?: boolean
}

export interface ProspectingSearchResponse {
  results: ProspectingResult[]
  total: number
  novos: number
  duplicados: number
}

export interface SaveContactsResponse {
  inserted: number
  updated: number
  total: number
}

export const prospectingService = {
  /**
   * Listar todas as configurações
   */
  getConfigs: async (): Promise<ProspectingConfig[]> => {
    const response = await fetch('/api/prospecting/configs', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error('Falha ao buscar configurações')
    }
    return response.json()
  },

  /**
   * Criar nova configuração
   */
  createConfig: async (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>): Promise<ProspectingConfig> => {
    const response = await fetch('/api/prospecting/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Falha ao criar configuração')
    }
    return response.json()
  },

  /**
   * Atualizar configuração
   */
  updateConfig: async (id: string, config: Partial<Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>>): Promise<ProspectingConfig> => {
    const response = await fetch(`/api/prospecting/configs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Falha ao atualizar configuração')
    }
    return response.json()
  },

  /**
   * Deletar configuração
   */
  deleteConfig: async (id: string): Promise<void> => {
    const response = await fetch(`/api/prospecting/configs/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Falha ao deletar configuração')
    }
  },

  /**
   * Buscar no Google Maps
   */
  search: async (params: {
    configId?: string
    nicho?: string
    localizacoes?: string[]
    variacoes?: string[]
    paginas_por_localizacao?: number
    hasdata_api_key?: string
    localizacao?: string
    variacao?: string
    pagina?: number
  }): Promise<ProspectingSearchResponse> => {
    const url = '/api/prospecting/search'
    const requestBody = JSON.stringify(params)
    
    console.group('🔍 [PROSPECÇÃO] Requisição para API')
    console.log('📍 URL:', url)
    console.log('📤 Método: POST')
    console.log('📋 Parâmetros enviados:', params)
    console.log('📦 Body (JSON):', requestBody)
    console.log('⏰ Timestamp:', new Date().toISOString())
    console.groupEnd()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    })
    
    console.group('📥 [PROSPECÇÃO] Resposta da API')
    console.log('✅ Status:', response.status, response.statusText)
    console.log('🔗 URL da resposta:', response.url)
    console.log('📋 Headers:', Object.fromEntries(response.headers.entries()))
    
    const responseData = await response.json()
    console.log('📦 Dados recebidos:', responseData)
    console.log('📊 Resumo:', {
      total: responseData.total || 0,
      novos: responseData.novos || 0,
      duplicados: responseData.duplicados || 0,
      resultadosCount: Array.isArray(responseData.results) ? responseData.results.length : 0,
      temErro: !!responseData.error,
    })
    console.groupEnd()
    
    if (!response.ok) {
      console.error('❌ [PROSPECÇÃO] Erro na resposta:', responseData)
      throw new Error(responseData.error || 'Falha ao buscar dados')
    }
    
    if (responseData.total === 0) {
      console.warn('⚠️ [PROSPECÇÃO] Nenhum resultado encontrado. Verifique os logs do servidor para mais detalhes.')
    }
    
    return responseData
  },

  /**
   * Salvar contatos encontrados
   */
  saveContacts: async (contacts: ProspectingResult[]): Promise<SaveContactsResponse> => {
    const response = await fetch('/api/prospecting/save-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts }),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Falha ao salvar contatos')
    }
    return response.json()
  },
}
