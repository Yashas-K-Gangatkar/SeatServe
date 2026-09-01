// Shared FAQ content for the landing accordion and the full /faq page.
// Conversational tone, no jargon — a 16-year-old at a cinema should get it.

export interface FaqItem {
  q: string
  a: string
}

export const LANDING_FAQ: FaqItem[] = [
  {
    q: 'How do I scan the QR code?',
    a: 'Your seat has a small QR sticker on the armrest or seat back. Open seatserve on your phone, tap Scan, point the camera — the menu opens by itself. No app to install.',
  },
  {
    q: 'Can I order for my friends too?',
    a: 'Yes. One phone can order for the whole row — items from different stores go into one cart, and each store still gets only its own kitchen ticket.',
  },
  {
    q: 'What if my order gets here late or an item is cancelled?',
    a: 'You watch every store live while you wait. If a store cannot prepare an item at all — sold out before cooking starts, for example — you don\u2019t pay for it: that amount is corrected back to your original payment method automatically and your receipt marks it clearly. No forms, no chasing.'
  },
  {
    q: 'Is there a fee to use this?',
    a: 'There is no fee to use the service — you pay only for your order, once, at checkout (UPI, card or netbanking). The payment screen always shows the exact amount before you confirm.'
  },
]

export const ALL_FAQ: FaqItem[] = [
  ...LANDING_FAQ,
  {
    q: 'Which stores can I order from?',
    a: 'Every food outlet inside the venue that has joined the platform — in the demo that is Cinema Snacks, Pizza Corner, Dosa Junction, Mithai & More and Wrap House, all in one cart.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay once at the end: UPI, card or netbanking. The single payment is split behind the scenes so each store receives its share automatically — you never queue twice.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Until the store accepts — yes. Open tracking and tap Cancel: the money returns to your original payment method automatically. Kitchens accept fast — usually within a minute — and the moment they do, the order is locked: no cancellations, no refunds.'
  },
  {
    q: 'Is my data safe?',
    a: 'We collect only what an order needs — seat and cart. Payments are handled by Razorpay; card details never touch our servers. Sessions are signed cookies and every staff action is audit-logged.',
  },
  {
    q: "I'm staff — where do I sign in?",
    a: 'Head to the staff page, enter the pilot access code your venue gave you, then use the staff sign-in console. Kitchen, runner, store, cinema and mall roles each see only their own scope.',
  },
]
