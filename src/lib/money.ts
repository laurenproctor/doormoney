// Money is integer cents in the database. Format at the edge, never store floats.

export function formatMoney(cents: number, opts: { cents?: boolean } = {}): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

/** Door Money's cut on a sale, in cents. Rounds down so the act never loses a cent to rounding. */
export function feeCents(amountCents: number, percent = 15): number {
  return Math.floor((amountCents * percent) / 100);
}

/**
 * Split an amount into equal weekly slices between two dates, landing on Fridays.
 * This is the calendar release rule (decision 2A). Returns [{dueOn, amountCents}].
 */
export function weeklySlices(amountCents: number, startsOn: Date, endsOn: Date) {
  // Date-only values from Postgres arrive as UTC midnight; stay in UTC so a Friday is a Friday on every server.
  const fridays: Date[] = [];
  const d = new Date(startsOn);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7)); // first Friday on/after start
  while (d <= endsOn) {
    fridays.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  if (fridays.length === 0) fridays.push(new Date(endsOn));
  const base = Math.floor(amountCents / fridays.length);
  const remainder = amountCents - base * fridays.length;
  return fridays.map((dueOn, i) => ({
    dueOn,
    amountCents: base + (i === fridays.length - 1 ? remainder : 0),
  }));
}

/** Minimum raise on an auction lot: 5% of the list price, rounded up to the nearest $5, never under $5. */
export function bidStepCents(priceCents: number) {
  const five = 500;
  return Math.max(five, Math.ceil((priceCents * 0.05) / five) * five);
}
