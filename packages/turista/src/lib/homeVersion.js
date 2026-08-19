import { useSyncExternalStore } from 'react'

// Versão da home em avaliação ('atual' | 'nova').
//
// Mora fora do React porque mais de um lugar precisa reagir à troca — a própria
// home e o MENU INFERIOR, que na proposta tem 5 itens em vez de 6 ("Descubra"
// passa a viver dentro da home). Sem isso, alternar a home deixaria o menu
// dessincronizado.
const CHAVE = 'turiva_home_versao'
const ouvintes = new Set()

export function getHomeVersion() {
  const daUrl = new URLSearchParams(window.location.search).get('home')
  if (daUrl === 'nova' || daUrl === 'atual') return daUrl
  return localStorage.getItem(CHAVE) === 'nova' ? 'nova' : 'atual'
}

export function setHomeVersion(v) {
  localStorage.setItem(CHAVE, v === 'nova' ? 'nova' : 'atual')
  ouvintes.forEach((fn) => fn())
}

function subscrever(fn) {
  ouvintes.add(fn)
  window.addEventListener('popstate', fn)   // ?home= na URL
  return () => { ouvintes.delete(fn); window.removeEventListener('popstate', fn) }
}

export function useHomeVersion() {
  return useSyncExternalStore(subscrever, getHomeVersion, () => 'atual')
}
