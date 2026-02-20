'use client'

import React, { useState } from 'react'
import { Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import type { ProspectingResult } from '@/services/prospectingService'

interface ProspectingResultsProps {
  results: ProspectingResult[]
  total: number
  novos: number
  duplicados: number
  onSave: (contacts: ProspectingResult[]) => Promise<void>
  isSaving?: boolean
}

export const ProspectingResults: React.FC<ProspectingResultsProps> = ({
  results,
  total,
  novos,
  duplicados,
  onSave,
  isSaving = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Selecionar todos os novos (não duplicados)
  const handleSelectAll = () => {
    const newIds = new Set<number>()
    results.forEach((r, idx) => {
      if (!r.isDuplicate) {
        newIds.add(idx)
      }
    })
    setSelectedIds(newIds)
  }

  // Desmarcar todos
  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  // Toggle seleção individual
  const handleToggleSelect = (idx: number) => {
    const newIds = new Set(selectedIds)
    if (newIds.has(idx)) {
      newIds.delete(idx)
    } else {
      newIds.add(idx)
    }
    setSelectedIds(newIds)
  }

  // Salvar contatos selecionados
  const handleSave = async () => {
    const contactsToSave = Array.from(selectedIds).map(idx => results[idx])
    if (contactsToSave.length === 0) {
      alert('Selecione pelo menos um contato para salvar')
      return
    }
    await onSave(contactsToSave)
    setSelectedIds(new Set())
  }

  if (results.length === 0) {
    return (
      <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
        <div className="space-y-2">
          <p className="text-center text-[var(--ds-text-muted)]">
            Nenhum resultado encontrado.
          </p>
          <p className="text-center text-xs text-[var(--ds-text-muted)]">
            Possíveis causas: nenhum resultado retornado pela API, telefones inválidos ou apenas números fixos (WhatsApp requer celulares).
          </p>
          <p className="text-center text-xs text-[var(--ds-text-muted)] mt-2">
            Verifique os logs do console do navegador (F12) para mais detalhes.
          </p>
        </div>
      </Container>
    )
  }

  return (
    <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--ds-bg-hover)] p-4 rounded-lg">
          <p className="text-sm text-[var(--ds-text-muted)]">Total Encontrado</p>
          <p className="text-2xl font-bold text-[var(--ds-text-primary)]">{total}</p>
        </div>
        <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
          <p className="text-sm text-emerald-400">Novos</p>
          <p className="text-2xl font-bold text-emerald-400">{novos}</p>
        </div>
        <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
          <p className="text-sm text-yellow-400">Duplicados</p>
          <p className="text-2xl font-bold text-yellow-400">{duplicados}</p>
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={isSaving}
        >
          Selecionar Todos Novos
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDeselectAll}
          disabled={isSaving}
        >
          Desmarcar Todos
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleSave}
          disabled={isSaving || selectedIds.size === 0}
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save size={16} className="mr-2" />
              Salvar Selecionados ({selectedIds.size})
            </>
          )}
        </Button>
      </div>

      {/* Tabela de resultados */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--ds-border-default)]">
              <th className="text-left p-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === novos && novos > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleSelectAll()
                    } else {
                      handleDeselectAll()
                    }
                  }}
                  disabled={isSaving}
                />
              </th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Empresa</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Telefone</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Endereço</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Website</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Categoria</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Avaliação</th>
              <th className="text-left p-2 text-sm font-semibold text-[var(--ds-text-primary)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, idx) => (
              <tr
                key={idx}
                className={`border-b border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)] ${
                  result.isDuplicate ? 'opacity-60' : ''
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(idx)}
                    onChange={() => handleToggleSelect(idx)}
                    disabled={isSaving || result.isDuplicate}
                  />
                </td>
                <td className="p-2 text-sm text-[var(--ds-text-primary)]">{result.empresa}</td>
                <td className="p-2 text-sm text-[var(--ds-text-primary)] font-mono">{result.telefone}</td>
                <td className="p-2 text-sm text-[var(--ds-text-secondary)]">{result.endereco}</td>
                <td className="p-2 text-sm text-[var(--ds-text-secondary)]">
                  {result.website ? (
                    <a
                      href={result.website.startsWith('http') ? result.website : `https://${result.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {result.website}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="p-2 text-sm text-[var(--ds-text-secondary)]">{result.categoria || '-'}</td>
                <td className="p-2 text-sm text-[var(--ds-text-secondary)]">
                  {result.avaliacao !== null && result.avaliacao !== undefined
                    ? `${result.avaliacao} ⭐ (${result.total_avaliacoes || 0})`
                    : '-'}
                </td>
                <td className="p-2">
                  {result.isDuplicate ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      <XCircle size={12} />
                      Duplicado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 size={12} />
                      Novo
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  )
}
