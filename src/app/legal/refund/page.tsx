import LegalShell from '@/components/site/LegalShell'

export const metadata = {
  title: 'Cancellation & refund policy — SeatServe',
  description: 'SeatServe follows the cinema counter standard: food orders are final once placed. Read the full policy, including the rare cases where a payment is reversed.',
}

export default function RefundPage() {
  return (
    <LegalShell title="Cancellation & refund policy" updated="31 August 2026">
      <p>
        Short version: <strong>food orders are final once placed — SeatServe does not offer cancellations or
        refunds.</strong> This is the same standard you know from every cinema food counter: the moment you pay,
        your items are queued in the kitchen and preparation begins. We publish this policy clearly before you
        order, and it applies to every order placed through SeatServe.
      </p>

      <h2>Why orders are final</h2>
      <p>
        In-seat ordering is built for speed inside a live show window. Outlets prepare against a fixed kitchen
        slot for your screen, ingredients are allocated the moment your ticket prints, and runners are scheduled
        around show intervals. Unlike e-commerce parcels, prepared food cannot be restocked or resold, so the
        order cannot be undone. Please double-check your cart, seat and items before paying.
      </p>

      <h2>Ordering the wrong thing by mistake</h2>
      <p>
        If you ordered the wrong item or the wrong quantity, reach the support desk from the tracking screen
        immediately. We will ask the outlet to shorten or adjust the preparation where it has not started —
        however, whether an adjustment is possible is entirely at the outlet&rsquo;s discretion, and no amount is
        reversable once cooking has begun.
      </p>

      <h2>The only cases where money is reversed</h2>
      <p>
        Two rare, technical situations — these are payment corrections, not refunds:
      </p>
      <ul>
        <li>
          <strong>Payment captured but order failed</strong> — if your money was debited but no order was created
          (gateway or network error), the failed transaction is auto-reversed to your original payment method by
          the payment gateway, per RBI rules for failed transactions.
        </li>
        <li>
          <strong>Outlet cannot fulfil before preparation</strong> — if an outlet runs out of stock or cannot
          prepare your item at all, that item&rsquo;s amount is reversed to your original payment method. You never
          pay for something that is never prepared or delivered.
        </li>
      </ul>
      <p>
        Reversals are executed by our payment gateway to the source account (UPI or card) and typically reflect in
        5&ndash;7 working days, depending on your bank. In this demo, payments are simulated, so reversals are
        simulated too.
      </p>

      <h2>Something wrong with the order you received</h2>
      <p>
        If an item is missing, wrong, or not up to standard, tell us immediately from the tracking screen&rsquo;s
        support option with your order code. The theatre team will resolve it on the spot wherever possible —
        a replacement item, an alternative, or assistance from the counter. Complaints are acknowledged within
        48 hours and resolved within one month.
      </p>

      <h2>How to reach us</h2>
      <p>
        Open the tracking screen and use Support with your order code, or email{' '}
        <a href="mailto:grievance@seatserve.demo">grievance@seatserve.demo</a>. Our grievance officer responds to
        every written complaint within the timelines required by Indian consumer protection rules.
      </p>
    </LegalShell>
  )
}
