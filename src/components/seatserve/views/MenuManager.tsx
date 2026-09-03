'use client'

// SeatServe — store menu manager (#/menu)
// Owners create menu items and mark items out of stock (86'd) in one place.
// STORE_MANAGER: their own store. MALL_ADMIN: pick any store in the mall.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Plus, UtensilsCrossed, PackageX, PackageCheck, Loader2, ImageOff, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, patch, ApiError } from '@/lib/client/api'
import { MENU_IMAGES } from '@/lib/menu-images'
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
  imageUrl: string | null
  isAvailable: boolean
}

interface MenuResponse {
  stores: { id: string; name: string; emoji: string | null; isOpen: boolean; productCount: number }[]
  store: { id: string; name: string; emoji: string | null; isOpen: boolean } | null
  products: MenuItem[]
}

export default function MenuManager({ go }: { go: (p: string) => void }) {
  return (
    <StaffGate roles={['STORE_MANAGER', 'MALL_ADMIN', 'CINEMA_MANAGER']} go={go} consoleName="Menu manager">
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
  const [editPriceId, setEditPriceId] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState('')

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

  const startPriceEdit = (item: MenuItem) => {
    setEditPriceId(item.id)
    setPriceDraft((item.pricePaise / 100).toFixed(2).replace(/\.00$/, ''))
  }

  const savePrice = async (item: MenuItem) => {
    const n = Number.parseFloat(priceDraft)
    if (!Number.isFinite(n) || n < 1) {
      toast.error('Enter a price of ₹1 or more')
      return
    }
    setBusyId(item.id)
    try {
      const paise = Math.round(n * 100)
      await patch(`/api/products/${item.id}`, { pricePaise: paise })
      toast.success(`${item.name} repriced to ${rupees(paise)}`)
      setEditPriceId(null)
      void load(storeId)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the price')
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
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-stone-300" title="No photo yet">
                    <ImageOff className="h-4 w-4" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-stone-900">
                    <VegMark veg={item.isVeg} /> {item.name}
                    {!item.isAvailable && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                        <PackageX className="h-3 w-3" aria-hidden /> OUT OF STOCK
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{item.category}</span>
                    <span aria-hidden>·</span>
                    <button
                      onClick={() => startPriceEdit(item)}
                      className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                      aria-label={`Change price of ${item.name}`}
                    >
                      {rupees(item.pricePaise)} <Pencil className="h-3 w-3" aria-hidden />
                    </button>
                    <span aria-hidden>·</span>
                    <span>GST {item.taxRatePct}%</span>
                    <span aria-hidden>·</span>
                    <span>~{item.prepEstimateMin} min</span>
                    {item.allergens ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">allergens: {item.allergens}</span>
                      </>
                    ) : null}
                  </p>
                  {editPriceId === item.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step="0.5"
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        className="h-8 w-24 text-sm"
                        aria-label={`New price for ${item.name} in rupees`}
                        autoFocus
                      />
                      <button
                        onClick={() => void savePrice(item)}
                        disabled={busyId === item.id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-to-b from-amber-500 to-orange-500 px-3 text-[11px] font-extrabold text-white disabled:opacity-40"
                      >
                        {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Save price
                      </button>
                      <button
                        onClick={() => setEditPriceId(null)}
                        className="h-8 rounded-lg border border-stone-300 px-3 text-[11px] font-bold text-stone-500 hover:bg-stone-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
  const [image, setImage] = useState('')
  const [startSoldOut, setStartSoldOut] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName(''); setDescription(''); setCategory('Snacks'); setPrice(''); setPrep('8')
    setIsVeg(true); setAllergens(''); setImage(''); setStartSoldOut(false)
  }

  const submit = async () => {
    const priceRupees = Number.parseFloat(price)
    if (!name.trim()) return toast.error('Item name is required')
    if (!Number.isFinite(priceRupees) || priceRupees < 1) return toast.error('Enter a price of ₹1 or more')
    if (!image.trim()) return toast.error('Pick a photo for the item — every item needs one')
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
        imageUrl: image.trim(),
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
          <div>
            <label htmlFor="mi-photo" className="mb-1 block text-xs font-semibold text-muted-foreground">Item photo *</label>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
              {image ? (
                <img src={image} alt="Selected item photo" className="h-16 w-16 rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 text-[9px] font-bold text-stone-400">NO PHOTO</div>
              )}
              <div className="min-w-0 flex-1">
                <Input id="mi-photo" value={image} onChange={(e) => setImage(e.target.value)} placeholder="/menu/momo.jpg or https://…" maxLength={400} className="text-xs" />
                <p className="mt-1 text-[10px] text-muted-foreground">Pick a ready photo below or paste any image link — photos are compulsory.</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5 overflow-y-auto rounded-xl border border-border bg-card p-2 sm:grid-cols-6" style={{ maxHeight: 136 }}>
              {MENU_IMAGES.map((m) => {
                const val = `/menu/${m.file}.jpg`
                return (
                  <button
                    key={m.file}
                    type="button"
                    onClick={() => setImage(val)}
                    aria-label={`Use ${m.label} photo`}
                    aria-pressed={image === val}
                    className={`overflow-hidden rounded-lg border-2 transition ${image === val ? 'border-orange-500 ring-1 ring-orange-300' : 'border-transparent hover:border-stone-200'}`}
                  >
                    <img src={val} alt="" loading="lazy" className="h-12 w-full object-cover" />
                  </button>
                )
              })}
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
