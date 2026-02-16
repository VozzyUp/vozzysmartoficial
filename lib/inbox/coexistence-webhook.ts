/**
 * Coexistence Webhook Handlers
 *
 * Processa webhooks da Meta relacionados a coexistencia
 * (WhatsApp Business App + Cloud API):
 *
 * - smb_message_echoes: mensagens enviadas via app WA Business
 * - smb_app_state_sync: contatos adicionados/editados/removidos no app
 * - history: historico de mensagens sincronizado
 * - account_update: desconexao (PARTNER_REMOVED, ACCOUNT_OFFBOARDED)
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { inboxDb } from './inbox-db'
import { settingsDb } from '@/lib/supabase-db'
import type { MessageDirection, DeliveryStatus, InboxMessageType } from '@/types'

// =============================================================================
// smb_message_echoes
// =============================================================================

interface SmbMessageEcho {
  from: string
  to: string
  id: string
  timestamp: string
  type: string
  [key: string]: unknown
}

/**
 * Processa mensagens enviadas pelo usuario via app WhatsApp Business.
 * Espelha como mensagem de saida no Inbox.
 */
export async function handleSmbMessageEchoes(
  metadata: { display_phone_number?: string; phone_number_id?: string },
  messageEchoes: SmbMessageEcho[]
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  for (const echo of messageEchoes) {
    try {
      const toPhone = normalizePhoneNumber(echo.to)
      if (!toPhone) continue

      // Buscar ou criar conversa para este contato
      const conversation = await inboxDb.getOrCreateConversation(toPhone)

      // Extrair conteudo da mensagem
      const content = extractMessageContent(echo)

      // Salvar como mensagem de saida (enviada pela empresa via app)
      await inboxDb.createMessage({
        conversation_id: conversation.id,
        direction: 'outbound' as MessageDirection,
        content,
        message_type: mapMessageType(echo.type),
        whatsapp_message_id: echo.id,
        delivery_status: 'sent' as DeliveryStatus,
        payload: { source: 'whatsapp_business_app', raw_type: echo.type },
      })

      // Atualizar last_message_at da conversa
      await supabase
        .from('inbox_conversations')
        .update({
          last_message_at: new Date(parseInt(echo.timestamp) * 1000).toISOString(),
          status: 'open',
        })
        .eq('id', conversation.id)
    } catch (err) {
      console.error('[Coexistence] Erro ao processar smb_message_echo:', err)
    }
  }
}

// =============================================================================
// smb_app_state_sync
// =============================================================================

interface SmbContact {
  type: string
  contact: {
    full_name?: string
    first_name?: string
    phone_number: string
  }
  action: 'add' | 'remove'
  metadata: {
    timestamp: string
  }
}

/**
 * Processa sincronizacao de contatos do app WhatsApp Business.
 * Cria/atualiza contatos na tabela contacts.
 */
export async function handleSmbAppStateSync(
  metadata: { display_phone_number?: string; phone_number_id?: string },
  stateSync: SmbContact[]
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  for (const entry of stateSync) {
    if (entry.type !== 'contact') continue

    try {
      const phone = normalizePhoneNumber(entry.contact.phone_number)
      if (!phone) continue

      if (entry.action === 'add') {
        // Upsert contato (criar se nao existe, atualizar nome se existe)
        const name = entry.contact.full_name || entry.contact.first_name || ''

        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', phone)
          .single()

        if (existing) {
          // Atualizar nome se fornecido e contato ainda nao tem nome
          if (name) {
            await supabase
              .from('contacts')
              .update({
                name,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
              .is('name', null)
          }
        } else {
          // Criar novo contato
          await supabase.from('contacts').insert({
            name,
            phone,
            status: 'OPT_IN',
            tags: ['WhatsApp Business App'],
            custom_fields: {},
          })
        }
      } else if (entry.action === 'remove') {
        // Nao remover contatos do banco, apenas logar
        console.log(`[Coexistence] Contato removido no app WA Business: ${phone}`)
      }
    } catch (err) {
      console.error('[Coexistence] Erro ao processar smb_app_state_sync:', err)
    }
  }
}

// =============================================================================
// history
// =============================================================================

interface HistoryThread {
  id: string // phone number do usuario
  messages: HistoryMessage[]
}

interface HistoryMessage {
  from: string
  to?: string
  id: string
  timestamp: string
  type: string
  history_context?: { status: string }
  [key: string]: unknown
}

interface HistoryPayload {
  metadata?: {
    phase: number
    chunk_order: number
    progress: number
  }
  threads?: HistoryThread[]
  errors?: Array<{ code: number; title: string; message: string }>
}

/**
 * Processa historico de mensagens sincronizado do app WhatsApp Business.
 * Cria conversas e mensagens no Inbox.
 */
export async function handleHistorySync(
  metadata: { display_phone_number?: string; phone_number_id?: string },
  historyEntries: HistoryPayload[]
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const businessPhone = metadata.display_phone_number || ''

  for (const entry of historyEntries) {
    // Verificar se usuario recusou compartilhar historico
    if (entry.errors?.some((e) => e.code === 2593109)) {
      console.log('[Coexistence] Empresa recusou compartilhar histórico de mensagens')
      continue
    }

    const phase = entry.metadata?.phase ?? -1
    const chunkOrder = entry.metadata?.chunk_order ?? 0
    const progress = entry.metadata?.progress ?? 0

    console.log(
      `[Coexistence] Processando histórico: fase=${phase}, chunk=${chunkOrder}, progresso=${progress}%`
    )

    if (!entry.threads) continue

    for (const thread of entry.threads) {
      try {
        const userPhone = normalizePhoneNumber(thread.id)
        if (!userPhone) continue

        // Buscar ou criar conversa
        const conversation = await inboxDb.getOrCreateConversation(userPhone)

        // Inserir mensagens em lote
        const messagesToInsert = []

        for (const msg of thread.messages) {
          // Pular media_placeholder (sem conteudo real)
          if (msg.type === 'media_placeholder') continue

          const isFromBusiness = msg.from === businessPhone || !!msg.to
          const content = extractMessageContent(msg)

          messagesToInsert.push({
            conversation_id: conversation.id,
            direction: (isFromBusiness ? 'outbound' : 'inbound') as MessageDirection,
            content: content || `[${msg.type}]`,
            message_type: mapMessageType(msg.type),
            whatsapp_message_id: msg.id,
            delivery_status: mapHistoryStatus(msg.history_context?.status) as DeliveryStatus,
            payload: {
              source: 'history_sync',
              phase,
              raw_type: msg.type,
            },
            created_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
          })
        }

        // Inserir mensagens em batch (ignorar duplicatas via whatsapp_message_id)
        if (messagesToInsert.length > 0) {
          const { error } = await supabase
            .from('inbox_messages')
            .upsert(messagesToInsert, {
              onConflict: 'whatsapp_message_id',
              ignoreDuplicates: true,
            })

          if (error) {
            console.error(
              `[Coexistence] Erro ao inserir mensagens do histórico (${userPhone}):`,
              error.message
            )
          }
        }

        // Atualizar contadores da conversa
        if (messagesToInsert.length > 0) {
          await supabase.rpc('increment_total_messages', {
            conv_id: conversation.id,
            amount: messagesToInsert.length,
          }).then(() => {}).catch(() => {
            // RPC pode nao existir, ignorar
          })
        }
      } catch (err) {
        console.error('[Coexistence] Erro ao processar thread do histórico:', err)
      }
    }
  }
}

// =============================================================================
// account_update (PARTNER_REMOVED / ACCOUNT_OFFBOARDED / ACCOUNT_RECONNECTED)
// =============================================================================

/**
 * Processa eventos de desconexao/reconexao da conta.
 */
export async function handleAccountUpdate(
  event: string,
  phoneNumber?: string
): Promise<void> {
  if (event === 'PARTNER_REMOVED' || event === 'ACCOUNT_OFFBOARDED') {
    console.log(`[Coexistence] Conta desconectada: evento=${event}, phone=${phoneNumber || 'N/A'}`)

    try {
      await settingsDb.saveAll({ isConnected: false })
    } catch (err) {
      console.error('[Coexistence] Erro ao marcar conta como desconectada:', err)
    }
  } else if (event === 'ACCOUNT_RECONNECTED') {
    console.log(`[Coexistence] Conta reconectada: evento=${event}`)

    try {
      await settingsDb.saveAll({ isConnected: true })
    } catch (err) {
      console.error('[Coexistence] Erro ao marcar conta como reconectada:', err)
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function extractMessageContent(msg: Record<string, unknown>): string {
  const type = msg.type as string

  if (type === 'text' && msg.text) {
    return (msg.text as { body?: string })?.body || ''
  }
  if (type === 'image' && msg.image) {
    const image = msg.image as { caption?: string }
    return image.caption || '[Imagem]'
  }
  if (type === 'video' && msg.video) {
    const video = msg.video as { caption?: string }
    return video.caption || '[Vídeo]'
  }
  if (type === 'audio' || type === 'voice') {
    return '[Áudio]'
  }
  if (type === 'document' && msg.document) {
    const doc = msg.document as { filename?: string; caption?: string }
    return doc.caption || doc.filename || '[Documento]'
  }
  if (type === 'sticker') {
    return '[Figurinha]'
  }
  if (type === 'location') {
    return '[Localização]'
  }
  if (type === 'contacts') {
    return '[Contato]'
  }
  if (type === 'interactive') {
    const interactive = msg.interactive as { body?: { text?: string } } | undefined
    return interactive?.body?.text || '[Interativo]'
  }
  if (type === 'reaction') {
    const reaction = msg.reaction as { emoji?: string } | undefined
    return reaction?.emoji || '[Reação]'
  }

  return `[${type}]`
}

function mapMessageType(waType: string): InboxMessageType {
  const typeMap: Record<string, InboxMessageType> = {
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    voice: 'audio',
    document: 'document',
    interactive: 'interactive',
    template: 'template',
  }
  return typeMap[waType] || 'text'
}

function mapHistoryStatus(status?: string): string {
  if (!status) return 'sent'
  const statusMap: Record<string, string> = {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    PLAYED: 'read',
    ERROR: 'failed',
    PENDING: 'pending',
  }
  return statusMap[status] || 'sent'
}
