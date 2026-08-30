const products = [
  { id: 'popcorn', store: 'Cinema Snacks', name: 'Salted Popcorn', price: 180 },
  { id: 'drink', store: 'Cinema Snacks', name: 'Cold Coffee', price: 140 },
  { id: 'pizza', store: 'Pizza Corner', name: 'Margherita Pizza', price: 250 },
  { id: 'wrap', store: 'Wrap House', name: 'Paneer Wrap', price: 210 }
]
const quantities = new Map(products.map(product => [product.id, 0]))
const money = value => `₹${value}`

function renderMenu() {
  const menu = document.querySelector('#menu')
  menu.innerHTML = products.map(product => `<article class="item"><span class="store">${product.store}</span><strong>${product.name}</strong><div class="price">${money(product.price)}</div><div class="quantity"><button data-id="${product.id}" data-change="-1" aria-label="Remove ${product.name}">−</button><span>${quantities.get(product.id)}</span><button data-id="${product.id}" data-change="1" aria-label="Add ${product.name}">+</button></div></article>`).join('')
  menu.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const current = quantities.get(button.dataset.id)
    quantities.set(button.dataset.id, Math.max(0, current + Number(button.dataset.change)))
    renderMenu(); renderCheckout()
  }))
}
function renderCheckout() {
  const selected = products.filter(product => quantities.get(product.id))
  const total = selected.reduce((sum, product) => sum + product.price * quantities.get(product.id), 0)
  const count = selected.reduce((sum, product) => sum + quantities.get(product.id), 0)
  document.querySelector('#total').textContent = money(total)
  document.querySelector('#item-count').textContent = `${count} item${count === 1 ? '' : 's'}`
  document.querySelector('#checkout').disabled = count === 0
}
function submitDemoOrder() {
  const selected = products.filter(product => quantities.get(product.id)).map(product => ({ ...product, quantity: quantities.get(product.id) }))
  const groups = Object.values(Object.groupBy(selected, product => product.store))
  const total = selected.reduce((sum, product) => sum + product.price * product.quantity, 0)
  document.querySelector('#success').classList.remove('hidden')
  document.querySelector('#success').innerHTML = `<h2>Order paid — ₹${total}</h2><p>Your order has been split into ${groups.length} kitchen ticket${groups.length === 1 ? '' : 's'} for Screen 3, Seat F-12.</p>`
  document.querySelector('#empty-state').classList.add('hidden')
  document.querySelector('#tickets').innerHTML = groups.map(group => `<article class="ticket"><div><strong>${group[0].store}</strong><p>Screen 3 · Seat F-12 · ${group.map(item => `${item.name} × ${item.quantity}`).join(', ')}</p></div><button>Mark preparing</button></article>`).join('')
  document.querySelectorAll('.ticket button').forEach(button => button.addEventListener('click', () => { button.textContent = 'Preparing'; button.disabled = true }))
  document.querySelector('#success').scrollIntoView({ behavior: 'smooth' })
}
document.querySelector('#start-order').addEventListener('click', () => { document.querySelector('#ordering').classList.remove('hidden'); document.querySelector('#ordering').scrollIntoView({ behavior: 'smooth' }) })
document.querySelector('#checkout').addEventListener('click', submitDemoOrder)
renderMenu(); renderCheckout()
