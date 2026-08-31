import LegalShell from '@/components/site/LegalShell'

export const metadata = {
  title: 'Refunds & cancellation — SeatServe',
  description: 'How cancellations and refunds work on SeatServe — automatic, to your original payment method.',
}

export default function RefundPage() {
  return (
    <LegalShell title="Refunds & cancellation" updated="31 August 2026">
      <p>
        Short version: <strong>you can always cancel while the kitchens are still preparing, and refunds are
        automatic.</strong> Here is exactly how it works.
      </p>

      <h2>Cancelling your order</h2>
      <ul>
        <li><strong>Before an outlet starts cooking</strong> — cancel that outlet&rsquo;s items (or the whole order) from the tracking screen. The refund is recorded instantly.</li>
        <li><strong>After an outlet starts cooking</strong> — the item can no longer be self-cancelled; contact support from the tracking screen and we will mediate with the outlet.</li>
        <li><strong>Whole-order cancellation</strong> — when every item is cancelled, the platform fee is refunded along with the items, so you get back exactly what you paid.</li>
      </ul>

      <h2>If the store cancels</h2>
      <p>
        If an outlet is out of stock or cannot fulfil, its items are cancelled automatically and refunded in full —
        the rest of your order continues as normal. You never pay for something that never arrives.
      </p>

      <h2>Where the money goes</h2>
      <p>
        Refunds return to the <strong>original payment method</strong> within 5–7 working days, per your bank or UPI
        provider. In this demo, payments are simulated — so refunds are simulated too and appear instantly in the app.
        At go-live, refunds are executed by our payment gateway with the same automation.
      </p>

      <h2>How to reach us</h2>
      <p>
        Open the tracking screen and use Support with your order code, or email{' '}
        <a href="mailto:grievance@seatserve.demo">grievance@seatserve.demo</a>. We acknowledge every complaint within
        48 hours and resolve within one month.
      </p>
    </LegalShell>
  )
}
