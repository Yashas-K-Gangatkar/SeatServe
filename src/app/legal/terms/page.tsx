import LegalShell from '@/components/site/LegalShell'

export const metadata = {
  title: 'Terms of use — SeatServe',
  description: 'The simple rules for using the SeatServe in-seat ordering service.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms of use" updated="31 August 2026">
      <p>
        These terms govern your use of SeatServe — scanning a seat QR, ordering food from venue outlets, and tracking
        the delivery to your seat. By using the service you accept them. The platform is currently offered as a demo
        pilot at Aurora Mall, Mumbai.
      </p>

      <h2>Demo status — nothing is charged</h2>
      <p>
        While the service is in demo/pilot mode the payment step is <strong>simulated end-to-end</strong>: no real
        charge is made to any UPI account, card or wallet. When real payments go live with our payment gateway, this
        page will be updated and the checkout screen will clearly show live charges before you confirm.
      </p>

      <h2>Ordering</h2>
      <ul>
        <li>Orders are fulfilled by the individual food outlets at the venue; SeatServe is the technology platform that connects you to them.</li>
        <li>Each outlet prepares and delivers its own items; one payment is split between outlets automatically.</li>
        <li>Orders close at the showtime cutoff shown on your menu screen.</li>
        <li>Prices include GST as displayed. Allergen and preparation information is provided by each outlet.</li>
      </ul>

      <h2>Cancellation & refunds</h2>
      <p>
        Food orders are <strong>final once placed</strong> — the same standard as every cinema counter. See the{' '}
        <a href="/legal/refund">cancellation &amp; refund policy</a> for the only two technical cases where a
        payment is reversed (failed transaction auto-reversal, or an outlet that cannot fulfil before preparation).
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t misuse the service: no fraudulent orders, no interference with staff consoles or QR tokens, no
        harassment of runners or outlet staff. We may suspend access for abuse. Seat QR tokens are single-venue
        capabilities — treat them like your ticket.
      </p>

      <h2>Availability</h2>
      <p>
        We aim for the food to arrive within the estimated time shown at checkout, but venue conditions (interval
        rushes, crowd movement) can vary. The app shows live status precisely so you always know where your order is.
      </p>

      <h2>Liability</h2>
      <p>
        Food safety and quality are the responsibility of the outlet that prepared your order; SeatServe&rsquo;s role
        is limited to the ordering and payment experience. To the maximum extent permitted by law, our liability for
        any claim is limited to the amount of the affected order.
      </p>

      <h2>The legal bits</h2>
      <p>
        These terms are governed by the laws of India, with courts at Mumbai having jurisdiction. If any term is held
        unenforceable, the rest still applies. Questions? <a href="mailto:grievance@seatserve.demo">grievance@seatserve.demo</a>.
      </p>
    </LegalShell>
  )
}
