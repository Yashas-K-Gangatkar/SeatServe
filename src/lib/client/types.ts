// SeatServe — shared client-side API response types

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
  rating: number
  deliveryFeePaise: number
  prepBufferMin: number
  products: ProductData[]
}

export interface ContextResponse {
  mall: { id: string; name: string; city: string }
  cinema: { id: string; name: string; wing: string | null }
  screen: { id: string; name: string }
  seat: { id: string; code: string; qrToken: string }
  showtime: {
    id: string
    movieTitle: string
    language: string | null
    startsAt: string
    cutoff: CutoffData
  } | null
  stores: StoreData[]
  screenSeats: { code: string; qrToken: string }[]
  settings: { platformFee: { platformFeePct: number; platformFeeMinPaise: number; platformFeeMaxPaise: number; walkBufferMin: number }; paymentFeePct: number }
  serverTime: string
}

export interface BillBreakdown {
  subtotalPaise: number
  taxPaise: number
  deliveryFeePaise: number
  platformFeePaise: number
  totalPaise: number
  prepEstimateMinutes: number
  perStore: { storeId: string; subtotalPaise: number; taxPaise: number; commissionPaise: number; storeNetPaise: number; deliveryFeePaise: number }[]
}

export interface OrderCreateResponse {
  code: string
  status: string
  paymentStatus: string
  breakdown: BillBreakdown
  itemCount: number
  seat: { code: string; screen: string; cinema: string }
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
  completedAt: string | null
  location: { mall: string; cinema: string; screen: string; seat: string }
  show: { movieTitle: string; startsAt: string; cutoffMinutesUntil: number | null } | null
  totals: { subtotalPaise: number; taxPaise: number; deliveryFeePaise: number; platformFeePaise: number; totalPaise: number }
  customer: { name: string | null; phone: string | null }
  stores: TrackingStore[]
  payment: { method: string; status: string; amountPaise: number; methodDetail: string | null; providerRef: string } | null
  refunds: { id: string; reason: string; status: string; amountPaise: number; createdAt: string }[]
  serverTime: string
}

export interface KitchenTicket {
  ticketId: string
  ticketCode: string
  status: string
  placedAt: string
  acceptedAt: string | null
  preparingAt: string | null
  readyAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  prepEtaMinutes: number
  screen: string
  cinema: string
  seat: string
  movieTitle: string | null
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
  screen: string
  cinema: string
  seat: string
  movieTitle: string | null
  readyAt: string | null
  assignedTo: string | null
  assignedToId: string | null
}

export interface RunnerResponse {
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
    screen: string
    cinema: string
    seat: string
    movieTitle: string | null
    pickupLabel: string
    dropLabel: string
    assignedAt: string
    pickedUpAt: string | null
  }[]
  recent: { runId: string; storeName: string; seat: string; deliveredAt: string | null }[]
  serverTime: string
}

export interface AdminOverview {
  scope: { role: string; label: string; mallId: string | null; cinemaId: string | null; storeId: string | null }
  window: { since: string; label: string }
  kpis: {
    salesPaise: number
    ordersCount: number
    aovPaise: number
    avgPrepMin: number | null
    avgDeliveryMin: number | null
    cancellations: number
    refundsOpen: number
  }
  liveOrders: {
    code: string
    placedAt: string
    screen: string
    cinema: string
    seat: string
    totalPaise: number
    status: string
    tickets: { storeName: string; emoji: string | null; status: string; ticketId: string }[]
  }[]
  refunds: { id: string; code: string; reason: string; detail: string | null; status: string; amountPaise: number; createdAt: string }[]
  settlement: { beneficiary: string; pendingPaise: number }[]
  stores: {
    id: string
    name: string
    emoji: string | null
    isOpen: boolean
    kycStatus: string
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
  screens: { id: string; name: string; cinema: string; seatsCount: number }[]
  screen: { id: string; name: string; cinema: string }
  seats: { code: string; rowLabel: string; seatNumber: number; qrToken: string; target: string; dataUrl: string }[]
}

export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
  issues?: { path: string; message: string }[]
}
