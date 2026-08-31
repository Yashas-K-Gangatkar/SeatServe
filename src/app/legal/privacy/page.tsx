import LegalShell from '@/components/site/LegalShell'

export const metadata = {
  title: 'Privacy policy — SeatServe',
  description: 'What SeatServe collects, why, and the rights you have over it.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy" updated="31 August 2026">
      <p>
        SeatServe is an in-venue food ordering service: you scan the QR at your cinema seat, order from the venue&rsquo;s
        food outlets, and pay once. This policy explains what we collect and why, in plain language. The platform is
        operated as a demo pilot at Aurora Mall, Mumbai; at incorporation the operating entity&rsquo;s legal name and
        registered address will be published here.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Seat and venue data</strong> — which seat QR you scanned, screen and showtime, so stores know where to deliver.</li>
        <li><strong>Order data</strong> — items, quantities, store tickets, cancellations and refunds.</li>
        <li><strong>Session data</strong> — a signed, httpOnly cookie that keeps staff consoles logged in; customers need no account.</li>
        <li><strong>Operational logs</strong> — timestamps of kitchen, runner and admin actions in an audit log, to keep everyone honest.</li>
      </ul>

      <h2>What we never collect</h2>
      <p>
        Card numbers, UPI PINs or banking credentials. Payments are processed by our payment gateway; in this demo the
        payment step is simulated and no payment data exists at all. We do not sell your data, and we do not run
        advertising trackers.
      </p>

      <h2>Why we process it</h2>
      <p>
        Only to deliver your order, let you track it, process refunds, and keep the service secure. Each store sees just
        the part of your order it is fulfilling — never the other stores&rsquo; items or anyone else&rsquo;s orders.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order and refund records are retained for accounting and dispute resolution as required by Indian law; audit
        logs are retained for security review. Anything beyond that is deleted or anonymised.
      </p>

      <h2>Children</h2>
      <p>
        Cinemas are full of families, so we keep children&rsquo;s experience safe by design: we do not profile users,
        we do not serve targeted advertising, and we collect nothing beyond what an order requires.
      </p>

      <h2>Your rights</h2>
      <p>
        Under India&rsquo;s Digital Personal Data Protection Act, 2023 you can ask what we hold about you, ask for a
        correction, or ask us to erase what is no longer needed for legal purposes. You may also nominate someone to
        exercise these rights if you cannot.
      </p>

      <h2>Security</h2>
      <p>
        Transport encryption everywhere, signed webhook verification, rate-limited login, role-scoped access and a
        complete audit trail. If a breach ever affects your data, we will notify you and the Data Protection Board as
        the law requires.
      </p>

      <h2>Grievance officer</h2>
      <p>
        Questions or complaints: email <a href="mailto:grievance@seatserve.demo">grievance@seatserve.demo</a>. We
        acknowledge within 48 hours and resolve within one month, as the Consumer Protection (E-Commerce) Rules 2020
        require. The officer&rsquo;s name and phone number will be published here once the entity is incorporated.
      </p>
    </LegalShell>
  )
}
