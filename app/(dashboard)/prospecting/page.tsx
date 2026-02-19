'use client'

import React, { useState } from 'react'
import { Plus, Trash2, Pencil, Settings, Search, FileText } from 'lucide-react'
import { Page, PageHeader, PageTitle, PageDescription, PageActions } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { ProspectingConfigForm } from '@/components/features/prospecting/ProspectingConfigForm'
import { ProspectingSearchForm } from '@/components/features/prospecting/ProspectingSearchForm'
import { ProspectingResults } from '@/components/features/prospecting/ProspectingResults'
import {
  useProspectingConfigs,
  useCreateProspectingConfig,
  useUpdateProspectingConfig,
  useDeleteProspectingConfig,
  useProspectingSearch,
  useSaveProspectingContacts,
} from '@/hooks/useProspecting'
import type { ProspectingConfig, ProspectingResult } from '@/services/prospectingService'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'

type Tab = 'configs' | 'search' | 'results'

export default function ProspectingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('configs')
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ProspectingConfig | null>(null)
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<{
    results: ProspectingResult[]
    total: number
    novos: number
    duplicados: number
  } | null>(null)

  const { data: configs, isLoading: isLoadingConfigs } = useProspectingConfigs()
  const createConfig = useCreateProspectingConfig()
  const updateConfig = useUpdateProspectingConfig()
  const deleteConfig = useDeleteProspectingConfig()
  const searchMutation = useProspectingSearch()
  const saveMutation = useSaveProspectingContacts()

  const handleCreateConfig = async (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) => {
    await createConfig.mutateAsync(config)
    setShowConfigForm(false)
  }

  const handleUpdateConfig = async (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) => {
    if (!editingConfig) return
    await updateConfig.mutateAsync({ id: editingConfig.id, config })
    setEditingConfig(null)
    setShowConfigForm(false)
  }

  const handleDeleteConfig = async () => {
    if (!deleteConfigId) return
    await deleteConfig.mutateAsync(deleteConfigId)
    setDeleteConfigId(null)
  }

  const handleSearch = async (params: {
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
    const result = await searchMutation.mutateAsync(params)
    setSearchResults(result)
    setActiveTab('results')
  }

  const handleSaveContacts = async (contacts: ProspectingResult[]) => {
    await saveMutation.mutateAsync(contacts)
    // Limpar resultados após salvar
    setSearchResults(null)
    setActiveTab('configs')
  }

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Prospecção Automática</PageTitle>
          <PageDescription>
            Busque empresas no Google Maps e adicione automaticamente aos seus contatos
          </PageDescription>
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('configs')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'configs'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
        >
          <Settings className="w-4 h-4" />
          Configurações
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'search'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
        >
          <Search className="w-4 h-4" />
          Buscar
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'results'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
          disabled={!searchResults}
        >
          <FileText className="w-4 h-4" />
          Resultados
          {searchResults && (
            <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
              {searchResults.total}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'configs' && (
        <div className="space-y-4">
          {showConfigForm ? (
            <ProspectingConfigForm
              config={editingConfig}
              onSave={editingConfig ? handleUpdateConfig : handleCreateConfig}
              onCancel={() => {
                setShowConfigForm(false)
                setEditingConfig(null)
              }}
              isSaving={createConfig.isPending || updateConfig.isPending}
            />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowConfigForm(true)}>
                  <Plus size={16} className="mr-2" />
                  Nova Configuração
                </Button>
              </div>

              {isLoadingConfigs ? (
                <Container variant="glass" padding="lg">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-[var(--ds-text-muted)]" />
                  </div>
                </Container>
              ) : configs && configs.length > 0 ? (
                <div className="space-y-3">
                  {configs.map(config => (
                    <Container
                      key={config.id}
                      variant="glass"
                      padding="lg"
                      className="border-[var(--ds-border-default)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-[var(--ds-text-primary)] mb-2">{config.name}</h3>
                          <div className="space-y-1 text-sm text-[var(--ds-text-secondary)]">
                            <p><strong>Nicho:</strong> {config.nicho}</p>
                            <p><strong>Localizações:</strong> {config.localizacoes.join(', ')}</p>
                            {config.variacoes.length > 0 && (
                              <p><strong>Variações:</strong> {config.variacoes.join(', ')}</p>
                            )}
                            <p><strong>Páginas por localização:</strong> {config.paginas_por_localizacao}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingConfig(config)
                              setShowConfigForm(true)
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfigId(config.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </Container>
                  ))}
                </div>
              ) : (
                <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
                  <p className="text-center text-[var(--ds-text-muted)]">
                    Nenhuma configuração salva. Crie uma nova configuração para começar.
                  </p>
                </Container>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <ProspectingSearchForm
          configs={configs || []}
          onSearch={handleSearch}
          isSearching={searchMutation.isPending}
        />
      )}

      {activeTab === 'results' && searchResults && (
        <ProspectingResults
          results={searchResults.results}
          total={searchResults.total}
          novos={searchResults.novos}
          duplicados={searchResults.duplicados}
          onSave={handleSaveContacts}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfigId} onOpenChange={(open) => !open && setDeleteConfigId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta configuração? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfig}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
