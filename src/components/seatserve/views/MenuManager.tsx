'use client'

// SeatServe — store menu manager (#/menu)
// Owners create menu items and mark items out of stock (86'd) in one place.
// STORE_MANAGER: their own store. MALL_ADMIN: pick any store in the mall.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Plus, UtensilsCrossed, PackageX, PackageCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, patch, ApiError } from '@/lib/client/api'
import StaffGate from '../StaffGate'
import { Spinner, LoadError, EmptyState, VegMark, rupees } from '../ui-bits'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

interface MenuItem {
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

interface MenuResponse {
  stores: { id: string; name: string; emoji: string | null; isOpen: boolean; productCount: number }[]
  store: { id: string; name: string; emoji: string | null; isOpen: boolean } | null
  products: MenuItem[]
}

export default function MenuManager({ go }: { go: (p: string) => void }) {
  return (
    <StaffGate roles={['STORE_MANAGER', 'MALL_ADMIN']} go={go} consoleName="Menu manager">
      {() => <MenuBoard go={go} />}
    </StaffGate>
  )
}

function MenuBoard({ go }: { go: (p: string) => void }) {
  const [data, setData] = useState<MenuResponse | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(
    async (id?: string | null) => {
      try {
        setError(null)
        setData(await get<MenuResponse>(`/api/store/menu${id ? `?storeId=${encodeURIComponent(id)}` : ''}`))
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load your menu')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    setLoading(true)
    void load(storeId)
  }, [load, storeId])

  const toggleAvailability = async (item: MenuItem) => {
    setBusyId(item.id)
    try {
      await patch(`/api/products/${item.id}`, { isAvailable: !item.isAvailable })
      toast.success(item.isAvailable ? `${item.name} marked OUT OF STOCK` : `${item.name} is back in stock`)
      void load(storeId)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the item')
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !data) return <Spinner label="Loading your menu…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={() => load(storeId)} />
      </div>
    )
  if (!data) return null

  const products = data.products ?? []

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Home
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">MENU MANAGER</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {data.store ? (
              <>
                {data.store.emoji ? <span aria-hidden>{data.store.emoji} </span> : null}
                {data.store.name} menu
              </>
            ) : (
              'Your menu'
            )}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Create items, set prices, and mark anything out of stock — customers see it instantly.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          disabled={!data.store}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add item
        </button>
      </header>

      {data.stores.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.stores.map((s) => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${data.store?.id === s.id ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-stone-300 bg-white text-stone-500 hover:bg-stone-50'}`}
              aria-pressed={data.store?.id === s.id}
            >
              {s.emoji ? `${s.emoji} ` : ''}{s.name} · {s.productCount} items
            </button>
          ))}
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card" aria-label="Menu items">
        {products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<UtensilsCrossed className="h-8 w-8" aria-hidden />}
              title="No items yet"
              hint="Tap “Add item” to put your first snack on the menu."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {products.map((item) => (
              <li key={item.id} className={`flex items-center gap-3 px-4 py-3.5 ${item.isAvailable ? '' : 'opacity-70'}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-stone-900">
                    <VegMark veg={item.isVeg} /> {item.name}
                    {!item.isAvailable && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                        <PackageX className="h-3 w-3" aria-hidden /> OUT OF STOCK
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.category} · {rupees(item.pricePaise)} · GST {item.taxRatePct}% · ~{item.prepEstimateMin} min
                    {item.allergens ? ` · allergens: ${item.allergens}` : ''}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-stone-500">
                  <span className="hidden sm:inline">{item.isAvailable ? 'In stock' : 'Sold out'}</span>
                  {busyId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" aria-hidden />
                  ) : (
                    <Switch
                      checked={item.isAvailable}
                      onCheckedChange={() => toggleAvailability(item)}
                      aria-label={`Toggle ${item.name} ${item.isAvailable ? 'out of stock' : 'back in stock'}`}
                    />
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden />
        Out-of-stock items stay on the menu but customers can&apos;t order them.
      </p>

      <AddItemSheet
        open={addOpen}
        store={data.store}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false)
          void load(storeId)
        }}
      />
    </div>
  )
}

function AddItemSheet({
  open,
  store,
  onClose,
  onCreated,
}: {
  open: boolean
  store: { id: string; name: string } | null
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Snacks')
  const [price, setPrice] = useState('')
  const [prep, setPrep] = useState('8')
  const [isVeg, setIsVeg] = useState(true)
  const [allergens, setAllergens] = useState('')
  const [startSoldOut, setStartSoldOut] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName(''); setDescription(''); setCategory('Snacks'); setPrice(''); setPrep('8')
    setIsVeg(true); setAllergens(''); setStartSoldOut(false)
  }

  const submit = async () => {
    const priceRupees = Number.parseFloat(price)
    if (!name.trim()) return toast.error('Item name is required')
    if (!Number.isFinite(priceRupees) || priceRupees < 1) return toast.error('Enter a price of ₹1 or more')
    setSaving(true)
    try {
      await post('/api/store/products', {
        storeId: store?.id,
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || 'Snacks',
        pricePaise: Math.round(priceRupees * 100),
        prepEstimateMin: Math.max(1, Math.round(Number.parseInt(prep, 10) || 8)),
        isVeg,
        allergens: allergens.trim(),
        isAvailable: !startSoldOut,
      })
      toast.success(`${name.trim()} added to the menu`)
      reset()
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-border bg-popover p-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Plus className="h-4 w-4 text-orange-500" aria-hidden /> Add a menu item
          </SheetTitle>
          <SheetDescription className="text-left">
            {store ? `New item for ${store.name}` : 'New item'} — appears on the customer menu immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-5 pb-6 pt-4">
          <div>
            <label htmlFor="mi-name" className="mb-1 block text-xs font-semibold text-muted-foreground">Item name *</label>
            <Input id="mi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cheese Popcorn" maxLength={60} />
          </div>
          <div>
            <label htmlFor="mi-desc" className="mb-1 block text-xs font-semibold text-muted-foreground">Description</label>
            <Input id="mi-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short line customers will see" maxLength={140} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="mi-cat" className="mb-1 block text-xs font-semibold text-muted-foreground">Category</label>
              <Input id="mi-cat" value={category} onChange={(e) => setCategory(e.target.value)} list="mi-cat-options" maxLength={30} />
              <datalist id="mi-cat-options">
                <option value="Snacks" /><option value="Combos" /><option value="Beverages" /><option value="Desserts" /><option value="Meals" />
              </datalist>
            </div>
            <div>
              <label htmlFor="mi-price" className="mb-1 block text-xs font-semibold text-muted-foreground">Price (₹, GST incl.) *</label>
              <Input id="mi-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="120" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="mi-prep" className="mb-1 block text-xs font-semibold text-muted-foreground">Prep time (min)</label>
              <Input id="mi-prep" value={prep} onChange={(e) => setPrep(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <label htmlFor="mi-allerg" className="mb-1 block text-xs font-semibold text-muted-foreground">Allergens</label>
              <Input id="mi-allerg" value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="nuts, dairy" maxLength={80} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="text-xs font-semibold">Vegetarian</span>
            <Switch checked={isVeg} onCheckedChange={setIsVeg} aria-label="Mark item vegetarian" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
            <span className="text-xs font-semibold text-amber-800">Add as out of stock</span>
            <Switch checked={startSoldOut} onCheckedChange={setStartSoldOut} aria-label="Add item as out of stock" />
          </div>
          <button
            onClick={submit}
            disabled={saving}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {saving ? 'Adding…' : 'Add to menu'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
