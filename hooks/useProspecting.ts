/**
 * Prospecting Hooks
 * 
 * React Query hooks para gerenciar estado de prospecção
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { prospectingService, type ProspectingConfig, type ProspectingResult, type ProspectingSearchResponse, type SaveContactsResponse } from '@/services/prospectingService'

/**
 * Hook para listar configurações de prospecção
 */
export function useProspectingConfigs() {
  return useQuery({
    queryKey: ['prospecting', 'configs'],
    queryFn: () => prospectingService.getConfigs(),
    staleTime: 30000, // 30 segundos
  })
}

/**
 * Hook para criar configuração
 */
export function useCreateProspectingConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) =>
      prospectingService.createConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting', 'configs'] })
      toast.success('Configuração criada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar configuração')
    },
  })
}

/**
 * Hook para atualizar configuração
 */
export function useUpdateProspectingConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Partial<Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>> }) =>
      prospectingService.updateConfig(id, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting', 'configs'] })
      toast.success('Configuração atualizada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar configuração')
    },
  })
}

/**
 * Hook para deletar configuração
 */
export function useDeleteProspectingConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => prospectingService.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting', 'configs'] })
      toast.success('Configuração deletada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao deletar configuração')
    },
  })
}

/**
 * Hook para buscar no Google Maps
 */
export function useProspectingSearch() {
  return useMutation({
    mutationFn: async (params: {
      configId?: string
      nicho?: string
      localizacoes?: string[]
      variacoes?: string[]
      paginas_por_localizacao?: number
      hasdata_api_key?: string
      localizacao?: string
      variacao?: string
      pagina?: number
    }) => {
      console.group('🚀 [PROSPECÇÃO] Iniciando busca')
      console.log('⚙️ Parâmetros recebidos:', params)
      console.log('🕐 Início:', new Date().toISOString())
      console.groupEnd()
      
      try {
        const result = await prospectingService.search(params)
        
        console.group('✅ [PROSPECÇÃO] Busca concluída')
        console.log('📊 Resultado:', result)
        console.log('📈 Estatísticas:', {
          total: result.total,
          novos: result.novos,
          duplicados: result.duplicados,
        })
        console.log('🕐 Fim:', new Date().toISOString())
        console.groupEnd()
        
        return result
      } catch (error) {
        console.group('❌ [PROSPECÇÃO] Erro na busca')
        console.error('Erro completo:', error)
        console.error('Mensagem:', error instanceof Error ? error.message : String(error))
        console.groupEnd()
        throw error
      }
    },
    onError: (error: Error) => {
      console.error('❌ [PROSPECÇÃO] Erro no hook:', error)
      toast.error(error.message || 'Erro ao buscar dados')
    },
  })
}

/**
 * Hook para salvar contatos encontrados
 */
export function useSaveProspectingContacts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (contacts: ProspectingResult[]) => prospectingService.saveContacts(contacts),
    onSuccess: (data: SaveContactsResponse) => {
      // Invalidar cache de contatos para atualizar a lista
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(`${data.inserted} contato(s) salvo(s) com sucesso!`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao salvar contatos')
    },
  })
}
