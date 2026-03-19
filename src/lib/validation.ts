export function validateDateFormat(date: string): boolean {
  const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !isNaN(parsed.getTime());
}

export function validateDateRange(since: string, until: string): void {
  if (!validateDateFormat(since)) {
    throw new Error(`Invalid date format for 'since': ${since}. Use YYYY-MM-DD.`);
  }
  if (!validateDateFormat(until)) {
    throw new Error(`Invalid date format for 'until': ${until}. Use YYYY-MM-DD.`);
  }
  if (since > until) {
    throw new Error(`'since' (${since}) must not be after 'until' (${until}).`);
  }
}

export function validateTeamSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new Error("'team_slug' is required and cannot be empty.");
  }
}
