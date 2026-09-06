// NotiFetch — shared client-side API response types

export interface CutoffData {
  orderingOpen: boolean
  cutoffAt: string
  minutesUntilCutoff: number
  minutesUntilShow: number
}

export interface ProductData {
  id: string
  name: string
  description: string | null
  category: string
  pricePaise: number
  taxRatePct: number
  prepEstimateMin: number
  isVeg: boolean
  allergens: string | null
  imageUrl: string | null
  isAvailable: boolean
}

export interface StoreData {
  id: string
  name: string
  slug: string
  emoji: string | null
  tagline: string | null
  isOpen: boolean
  kycStatus: string
  /** FSSAI license number — surfaced ONLY for KYC-VERIFIED stores (India food-safety display rule). */
  fssai: string | null
  rating: number
  prepBufferMin: number
  products: ProductData[]
}

export interface ContextResponse {
  /** 'seat' = per-seat QR (cinema style); 'door' = classroom door sticker (campus style). */
  mode: 'seat' | 'door'
  campus: { id: string; name: string; city: string }
  block: { id: string; name: string; wing: string | null }
  classroom: { id: string; name: string }
  /** null in door mode — the student types their seat/roll label at checkout. */
  seat: { id: string; code: string; qrToken: string } | null
  lecture: {
    id: string
    subject: string
    language: string | null
    startsAt: string
    cutoff: CutoffData
  } | null
  stores: StoreData[]
  classroomSeats: { code: string; qrToken: string }[]
  settings: { platformFeePct: number; walkBufferMin: number; paymentFeePct: number }
  serverTime: string
}

export interface BillBreakdown {
  subtotalPaise: number
  platformFeePaise: number
  totalPaise: number
  prepEstimateMinutes: number
  perStore: { storeId: string; subtotalPaise: number; commissionPaise: number; storeNetPaise: number }[]
}

export interface OrderCreateResponse {
  code: string
  status: string
  paymentStatus: string
  scheduledFor: string | null
  breakdown: BillBreakdown
  itemCount: number
  seat: { code: string; classroom: string; block: string }
  cutoff: { cutoffAt: string; minutesUntilCutoff: number }
}

export interface TrackingItem {
  name: string
  qty: number
  unitPricePaise: number
  lineTotalPaise: number
  notes: string | null
}

export interface TrackingStore {
  ticketId: string
  ticketCode: string
  storeId: string
  storeName: string
  emoji: string | null
  status: string
  cancelledByRole?: string | null
  prepEtaMinutes: number
  items: TrackingItem[]
  subtotalPaise: number
  deliveryRun: {
    status: string
    runner: string
    runnerPhone: string
    pickupLabel: string
    dropLabel: string
    pickedUpAt: string | null
    deliveredAt: string | null
  } | null
}

export interface TrackingResponse {
  code: string
  status: string
  paymentStatus: string
  placedAt: string
  scheduledFor: string | null
  completedAt: string | null
  location: { campus: string; block: string; classroom: string; seat: string }
  show: { subject: string; startsAt: string; cutoffMinutesUntil: number | null } | null
  totals: { subtotalPaise: number; platformFeePaise: number; totalPaise: number }
  customer: { name: string | null; phone: string | null }
  stores: TrackingStore[]
  payment: { method: string; status: string; amountPaise: number; methodDetail: string | null; providerRef: string } | null
  serverTime: string
}

export interface KitchenTicket {
  ticketId: string
  ticketCode: string
  status: string
  placedAt: string
  scheduledFor: string | null
  acceptedAt: string | null
  preparingAt: string | null
  readyAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  prepEtaMinutes: number
  classroom: string
  block: string
  seat: string
  subject: string | null
  showStartsAt: string | null
  orderCode: string
  customerName: string | null
  items: { name: string; qty: number; notes: string | null; lineTotalPaise: number }[]
  subtotalPaise: number
  runner: string | null
}

export interface KitchenResponse {
  store: { id: string; name: string; emoji: string | null; isOpen: boolean; slug: string }
  tickets: KitchenTicket[]
  serverTime: string
}

export interface RunnerQueueItem {
  ticketId: string
  ticketCode: string
  orderCode: string
  storeName: string
  emoji: string | null
  classroom: string
  block: string
  seat: string
  subject: string | null
  readyAt: string | null
  scheduledFor: string | null
  assignedTo: string | null
  assignedToId: string | null
}

export interface RunnerResponse {
  campusId: string | null
  runners: { id: string; name: string; rating: number }[]
  activeRunnerId: string | null
  queue: RunnerQueueItem[]
  myRuns: {
    runId: string
    status: string
    ticketId: string
    ticketCode: string
    orderCode: string
    storeName: string
    emoji: string | null
    classroom: string
    block: string
    seat: string
    subject: string | null
    scheduledFor: string | null
    pickupLabel: string
    dropLabel: string
    assignedAt: string
    pickedUpAt: string | null
  }[]
  recent: { runId: string; storeName: string; seat: string; deliveredAt: string | null }[]
  serverTime: string
}

export interface AdminOverview {
  scope: { role: string; label: string; campusId: string | null; blockId: string | null; storeId: string | null; realtimeMallId: string | null; mallName: string | null }
  window: { since: string; label: string }
  kpis: {
    salesPaise: number
    ordersCount: number
    aovPaise: number
    avgPrepMin: number | null
    avgDeliveryMin: number | null
    cancellations: number
  }
  liveOrders: {
    code: string
    placedAt: string
    classroom: string
    block: string
    seat: string
    totalPaise: number
    status: string
    tickets: { storeName: string; emoji: string | null; status: string; ticketId: string }[]
  }[]
  settlement: { beneficiary: string; pendingPaise: number }[]
  stores: {
    id: string
    name: string
    emoji: string | null
    isOpen: boolean
    kycStatus: string
    kycSubmitted: boolean
    kycDetail: { gstin: string; panMasked: string; bankMasked: string; fssai: string } | null
    commissionPct: number
    ordersLast24h: number
    salesPaise: number
    liveTickets: number
    products: { id: string; name: string; isAvailable: boolean }[]
  }[]
  audit: { id: string; at: string; actorRole: string; actorRef: string | null; action: string; orderCode: string | null; meta: Record<string, unknown> | null }[]
  serverTime: string
}

export interface QrResponse {
  origin: string
  classrooms: { id: string; name: string; block: string; seatsCount: number }[]
  classroom: { id: string; name: string; block: string }
  seats: { code: string; rowLabel: string; seatNumber: number; qrToken: string; target: string; dataUrl: string }[]
}

export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
  issues?: { path: string; message: string }[]
}
