/**
 * T028: useConversations - List conversations with filters
 * Provides conversation list with filtering, search, infinite scroll, and real-time updates
 */

import { useMemo, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import {
  inboxService,
  type ConversationListParams,
  type ConversationListResult,
} from '@/services/inboxService'
import type { InboxConversation, ConversationStatus, ConversationMode } from '@/types'
import { CACHE, REALTIME, PAGINATION } from '@/lib/constants'
import { getConversationQueryKey } from './useConversation'
import { createRealtimeChannel, subscribeToTable, activateChannel, removeChannel } from '@/lib/supabase-realtime'
import { debounce } from '@/lib/utils'

// Default timeout: 0 = nunca expira (can be overridden by passing timeoutMs to switchMode)
const DEFAULT_HUMAN_MODE_TIMEOUT_MS = 0 // 0 = nunca expira

const CONVERSATIONS_KEY = 'inbox-conversations'
const CONVERSATIONS_LIST_KEY = [CONVERSATIONS_KEY, 'list']

// Query key builder
export const getConversationsQueryKey = (params: ConversationListParams) => [
  ...CONVERSATIONS_LIST_KEY,
  params,
]

// =============================================================================
// Main Hook
// =============================================================================

export interface UseConversationsParams {
  page?: number
  limit?: number
  status?: ConversationStatus
  mode?: ConversationMode
  labelId?: string
  search?: string
  initialData?: InboxConversation[]
}

const CONVERSATIONS_PAGE_SIZE = PAGINATION.inboxConversations

export function useConversations(params: UseConversationsParams = {}) {
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null)
  const { limit = CONVERSATIONS_PAGE_SIZE, status, mode, labelId, search, initialData } = params

  const queryParams: Omit<ConversationListParams, 'page'> = useMemo(
    () => ({ limit, status, mode, labelId, search }),
    [limit, status, mode, labelId, search]
  )

  const queryKey = [...CONVERSATIONS_LIST_KEY, 'infinite', queryParams]

  const infiniteQuery = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      return inboxService.listConversations({ ...queryParams, page: pageParam })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) return lastPage.page + 1
      return undefined
    },
    initialData: initialData?.length
      ? {
          pages: [
            {
              conversations: initialData,
              total: initialData.length,
              page: 1,
              totalPages: 1,
            } as ConversationListResult,
          ],
          pageParams: [1],
        }
      : undefined,
    staleTime: CACHE.inbox,
    refetchOnWindowFocus: false,
  })

  // Flatten all pages into single list
  const conversations = useMemo(
    () => infiniteQuery.data?.pages.flatMap((p) => p.conversations) ?? [],
    [infiniteQuery.data?.pages]
  )
  const lastPage = infiniteQuery.data?.pages?.at(-1)
  const total = lastPage?.total ?? 0
  const totalPages = lastPage?.totalPages ?? 1
  const hasNextPage = infiniteQuery.hasNextPage ?? false

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  )

  // Realtime subscription - invalidate on INSERT/UPDATE/DELETE
  const debouncedInvalidate = useMemo(
    () =>
      debounce(() => {
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      }, REALTIME.debounceDefault),
    [queryClient]
  )

  useEffect(() => {
    const channel = createRealtimeChannel(`inbox-convs-${Date.now()}`)
    if (!channel) return
    channelRef.current = channel
    const handler = () => debouncedInvalidate()
    subscribeToTable(channel, 'inbox_conversations', 'INSERT', handler)
    subscribeToTable(channel, 'inbox_conversations', 'UPDATE', handler)
    subscribeToTable(channel, 'inbox_conversations', 'DELETE', handler)
    activateChannel(channel).catch(() => {})
    return () => {
      debouncedInvalidate.cancel?.()
      if (channelRef.current) {
        removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [debouncedInvalidate])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
  }, [queryClient])

  return {
    conversations,
    total,
    totalPages,
    totalUnread,
    hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    isLoading: infiniteQuery.isLoading,
    isRefetching: infiniteQuery.isRefetching,
    error: infiniteQuery.error,
    invalidate,
    refetch: infiniteQuery.refetch,
  }
}

// =============================================================================
// Mutations Hook
// =============================================================================

export function useConversationMutations() {
  const queryClient = useQueryClient()

  // Update conversation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...params }: { id: string } & Parameters<typeof inboxService.updateConversation>[1]) =>
      inboxService.updateConversation(id, params),
    onSuccess: (updated) => {
      // Update in list cache
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            ),
          }
        }
      )
      // Update single conversation cache
      queryClient.setQueryData([CONVERSATIONS_KEY, updated.id], updated)
    },
  })

  // Mark as read
  const markAsReadMutation = useMutation({
    mutationFn: inboxService.markAsRead,
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })

      // Optimistic update
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === conversationId ? { ...c, unread_count: 0 } : c
            ),
          }
        }
      )
    },
  })

  // Close conversation
  const closeMutation = useMutation({
    mutationFn: (id: string) => inboxService.updateConversation(id, { status: 'closed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  // Reopen conversation
  const reopenMutation = useMutation({
    mutationFn: (id: string) => inboxService.updateConversation(id, { status: 'open' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  // Switch mode (with auto-expiration for human mode)
  // timeoutMs: pass from useInboxSettings.humanModeTimeoutHours * 60 * 60 * 1000
  // If timeoutMs is 0, human mode never expires
  const switchModeMutation = useMutation({
    mutationFn: ({ id, mode, timeoutMs }: { id: string; mode: ConversationMode; timeoutMs?: number }) => {
      const effectiveTimeout = timeoutMs ?? DEFAULT_HUMAN_MODE_TIMEOUT_MS

      // When switching to human mode, set expiration (unless timeout is 0 = never expires)
      // When switching to bot mode, clear expiration
      const human_mode_expires_at = mode === 'human' && effectiveTimeout > 0
        ? new Date(Date.now() + effectiveTimeout).toISOString()
        : null

      return inboxService.updateConversation(id, { mode, human_mode_expires_at })
    },
    onMutate: async ({ id, mode, timeoutMs }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      const effectiveTimeout = timeoutMs ?? DEFAULT_HUMAN_MODE_TIMEOUT_MS

      // Calculate expiration for optimistic update
      const human_mode_expires_at = mode === 'human' && effectiveTimeout > 0
        ? new Date(Date.now() + effectiveTimeout).toISOString()
        : null

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode, human_mode_expires_at } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual (para o ConversationHeader)
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode, human_mode_expires_at } : old)
      )
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // T050: Handoff to human
  const handoffMutation = useMutation({
    mutationFn: ({ id, ...params }: { id: string; reason?: string; summary?: string; pauseMinutes?: number }) =>
      inboxService.handoffToHuman(id, params),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode: 'human' as ConversationMode } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode: 'human' as ConversationMode } : old)
      )
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // T050: Return to bot
  const returnToBotMutation = useMutation({
    mutationFn: (id: string) => inboxService.returnToBot(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode: 'bot' as ConversationMode } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode: 'bot' as ConversationMode } : old)
      )
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // Delete conversation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => inboxService.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  return {
    update: updateMutation.mutateAsync,
    markAsRead: markAsReadMutation.mutateAsync,
    close: closeMutation.mutateAsync,
    reopen: reopenMutation.mutateAsync,
    switchMode: switchModeMutation.mutateAsync,
    handoff: handoffMutation.mutateAsync,
    returnToBot: returnToBotMutation.mutateAsync,
    deleteConversation: deleteMutation.mutateAsync,

    isUpdating: updateMutation.isPending,
    isMarkingAsRead: markAsReadMutation.isPending,
    isClosing: closeMutation.isPending,
    isReopening: reopenMutation.isPending,
    isSwitchingMode: switchModeMutation.isPending,
    isHandingOff: handoffMutation.isPending,
    isReturningToBot: returnToBotMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
