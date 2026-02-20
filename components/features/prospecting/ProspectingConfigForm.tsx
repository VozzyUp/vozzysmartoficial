'use client'

import React, { useState, useEffect } from 'react'
import { Save, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Container } from '@/components/ui/container'
import type { ProspectingConfig } from '@/services/prospectingService'

interface ProspectingConfigFormProps {
  config?: ProspectingConfig | null
  onSave: (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
}

export const ProspectingConfigForm: React.FC<ProspectingConfigFormProps> = ({
  config,
  onSave,
  onCancel,
  isSaving = false,
}) => {
  const [name, setName] = useState('')
  const [nicho, setNicho] = useState('')
  const [localizacoes, setLocalizacoes] = useState('')
  const [variacoes, setVariacoes] = useState('')
  const [paginasPorLocalizacao, setPaginasPorLocalizacao] = useState(3)

  useEffect(() => {
    if (config) {
      setName(config.name)
      setNicho(config.nicho)
      setLocalizacoes(config.localizacoes.join('\n'))
      setVariacoes(config.variacoes.join('\n'))
      setPaginasPorLocalizacao(config.paginas_por_localizacao)
    }
  }, [config])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const localizacoesArray = localizacoes
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)

    const variacoesArray = variacoes
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean)

    if (localizacoesArray.length === 0) {
      alert('Adicione pelo menos uma localização')
      return
    }

    await onSave({
      name,
      nicho,
      localizacoes: localizacoesArray,
      variacoes: variacoesArray,
      paginas_por_localizacao: paginasPorLocalizacao,
      hasdata_api_key: '', // Usa chave global (configurada em Modelo de busca)
    })
  }

  return (
    <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Nome do modelo</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Lanchonetes São Paulo"
            required
            disabled={isSaving}
          />
        </div>

        <div>
          <Label htmlFor="nicho">Nicho</Label>
          <Input
            id="nicho"
            value={nicho}
            onChange={(e) => setNicho(e.target.value)}
            placeholder="Ex: Lanchonete em São Paulo"
            required
            disabled={isSaving}
          />
        </div>

        <div>
          <Label htmlFor="localizacoes">Localizações (uma por linha)</Label>
          <textarea
            id="localizacoes"
            value={localizacoes}
            onChange={(e) => setLocalizacoes(e.target.value)}
            placeholder="Bairro Liberdade São Paulo SP&#10;Bairro Sé São Paulo - SP&#10;Mooca São Paulo"
            className="w-full min-h-[100px] px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg text-[var(--ds-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            required
            disabled={isSaving}
          />
          <p className="text-xs text-[var(--ds-text-muted)] mt-1">
            Formato: "Bairro, Cidade-Estado" ou "Cidade-Estado"
          </p>
        </div>

        <div>
          <Label htmlFor="variacoes">Variações (uma por linha, opcional)</Label>
          <textarea
            id="variacoes"
            value={variacoes}
            onChange={(e) => setVariacoes(e.target.value)}
            placeholder="hamburgueria&#10;pizzaria"
            className="w-full min-h-[80px] px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg text-[var(--ds-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            disabled={isSaving}
          />
        </div>

        <div>
          <Label htmlFor="paginas">Páginas por Localização</Label>
          <Input
            id="paginas"
            type="number"
            min="1"
            max="10"
            value={paginasPorLocalizacao}
            onChange={(e) => setPaginasPorLocalizacao(parseInt(e.target.value) || 3)}
            disabled={isSaving}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            <X size={16} className="mr-2" />
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </form>
    </Container>
  )
}
