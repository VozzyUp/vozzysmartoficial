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
    console.log('[prospectingService.search] Chamando API com params:', params)
    const response = await fetch('/api/prospecting/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    
    const responseData = await response.json()
    console.log('[prospectingService.search] Resposta da API:', {
      ok: response.ok,
      status: response.status,
      data: responseData,
    })
    
    if (!response.ok) {
      throw new Error(responseData.error || 'Falha ao buscar dados')
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
