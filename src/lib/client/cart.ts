'use client'

// SeatServe — client cart (Zustand + localStorage persistence, per seat token)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartLine {
  qty: number
  note: string
}

interface CartState {
  qrToken: string | null
  lines: Record<string, CartLine> // productId → line
  switchSeat: (token: string) => void
  add: (productId: string) => void
  remove: (productId: string) => void
  setNote: (productId: string, note: string) => void
  clear: () => void
  count: () => number
}

export const useCart = create<CartState>()(
  persist(
    (set, getState) => ({
      qrToken: null,
      lines: {},
      switchSeat: (token) => {
        if (getState().qrToken !== token) set({ qrToken: token, lines: {} })
      },
      add: (productId) =>
        set((s) => {
          const line = s.lines[productId] ?? { qty: 0, note: '' }
          return { lines: { ...s.lines, [productId]: { ...line, qty: Math.min(5, line.qty + 1) } } }
        }),
      remove: (productId) =>
        set((s) => {
          const line = s.lines[productId]
          if (!line) return s
          const next = { ...s.lines }
          if (line.qty <= 1) delete next[productId]
          else next[productId] = { ...line, qty: line.qty - 1 }
          return { lines: next }
        }),
      setNote: (productId, note) =>
        set((s) => {
          const line = s.lines[productId]
          if (!line) return s
          return { lines: { ...s.lines, [productId]: { ...line, note } } }
        }),
      clear: () => set({ lines: {} }),
      count: () => Object.values(getState().lines).reduce((sum, l) => sum + l.qty, 0),
    }),
    { name: 'seatserve-cart' },
  ),
)
