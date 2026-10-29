import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { definirSeloDoApp } from '../lib/push'
import { useAuth } from '../contexts/AuthContext'

// Mantém o número no ícone do app instalado igual ao do sininho enquanto o app
// está aberto: ler as notificações zera o ícone, e uma nova o atualiza. Com o
// app fechado, quem cuida é o service worker (o push traz o número).
// Mesma consulta do sininho (['notifications']) — sem chamada a mais quando ele
// está na tela. Não desenha nada.
export default function SeloDoApp() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey:             ['notifications'],
    queryFn:              () => api.getNotifications(),
    enabled:              !!token,
    refetchInterval:      60_000,
    refetchOnWindowFocus: true,
    staleTime:            20_000,
  })
  const unread = data ? Number(data.unread) || 0 : null

  useEffect(() => {
    if (!token) { definirSeloDoApp(0); return }
    // Antes da primeira resposta não mexe: o número que o push deixou vale.
    if (unread !== null) definirSeloDoApp(unread)
  }, [token, unread])

  return null
}
