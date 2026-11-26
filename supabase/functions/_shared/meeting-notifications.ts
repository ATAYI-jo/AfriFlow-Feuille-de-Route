// Shared by Web Push and FCM. This module performs no sends or database writes.
export const SITE_URL = "https://afriflow.pages.dev/";
const MINUTE = 60_000;
const MAX_MEETING_TTL = 5 * 60;

type Row = Record<string, unknown>;
type Recipient = { user_email: string; user_id?: string };
type Access = { userId: string; meetingEligible: boolean; newsEligible: boolean };
export type RecipientDirectory = Map<string, Access>;
export type NotificationEnvelope = {
  title: string;
  body: string;
  kind: string;
  url?: string;
  tag?: string;
  meetingId?: string;
  meetingTitle?: string;
  start?: number;
  end?: number;
  stage?: "soon" | "start";
  expiresAt?: number;
};

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// afriflow_profiles binds the account ID to its email. An access request alone
// is not an approval. Ambiguous email mappings fail closed.
export function buildRecipientDirectory(members: Row[], profiles: Row[], admins: Row[]): RecipientDirectory {
  const memberModes = new Map(members.map(row => [String(row.user_id || ""), String(row.access_mode || "")]));
  const adminEmails = new Set(admins.map(row => normalizeEmail(row.email)).filter(Boolean));
  const result: RecipientDirectory = new Map();
  const ambiguous = new Set<string>();
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email), userId = String(profile.user_id || "");
    if (!email || !userId || ambiguous.has(email)) continue;
    const previous = result.get(email);
    if (previous && previous.userId !== userId) {
      result.delete(email);
      ambiguous.add(email);
      continue;
    }
    const mode = memberModes.get(userId);
    const admin = adminEmails.has(email);
    result.set(email, {
      userId,
      meetingEligible: admin || mode === "collaborator" || mode === "shareholder_approved",
      // News has a separate, existing all-market-members access policy.
      newsEligible: admin || memberModes.has(userId),
    });
  }
  return result;
}

export async function loadRecipientDirectory(client: any): Promise<RecipientDirectory> {
  const results = await Promise.all([
    client.from("afriflow_market_profiles").select("user_id,access_mode").limit(2000),
    client.from("afriflow_profiles").select("user_id,email").limit(2000),
    client.from("afriflow_admins").select("email").limit(2000),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return buildRecipientDirectory(results[0].data || [], results[1].data || [], results[2].data || []);
}

function accountAccess(directory: RecipientDirectory, recipient: Recipient): Access | undefined {
  const access = directory.get(normalizeEmail(recipient.user_email));
  if (!access) return undefined;
  // FCM registrations carry an immutable account ID. Do not transfer an old
  // token's access to a different account that now uses the same email.
  if (recipient.user_id !== undefined && recipient.user_id !== access.userId) return undefined;
  return access;
}

export function canReceiveScheduled(directory: RecipientDirectory, recipient: Recipient): boolean {
  return accountAccess(directory, recipient)?.meetingEligible === true;
}

export function canReceiveNews(directory: RecipientDirectory, recipient: Recipient): boolean {
  return accountAccess(directory, recipient)?.newsEligible === true;
}

export function canReceiveMeeting(directory: RecipientDirectory, recipient: Recipient, meeting: Row): boolean {
  if (!canReceiveScheduled(directory, recipient)) return false;
  // Legacy/all-member meetings have no array. An explicit empty array invites
  // nobody. Administrative read access does not imply a push invitation.
  return !Array.isArray(meeting.invitees) || meeting.invitees.some(email => normalizeEmail(email) === normalizeEmail(recipient.user_email));
}

export function meetingNotification(meeting: Row, now: number): { eventKey: string; payload: NotificationEnvelope } | null {
  const id = typeof meeting.id === "string" ? meeting.id : "";
  const start = Number(meeting.start), duration = Number(meeting.dur);
  const end = start + duration * MINUTE;
  if (!/^m[a-z0-9]{5,35}$/.test(id) || !Number.isFinite(now) || !Number.isFinite(start) || start <= 0 ||
      !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(end) || end <= start ||
      meeting.cancelled === true || meeting.status === "cancelled") return null;
  if (now < start - 15 * MINUTE) return null;
  const stage = now < start ? "soon" : "start";
  const expiresAt = stage === "soon" ? start : Math.min(end, start + 10 * MINUTE);
  if (now >= expiresAt) return null;
  // Keep the existing claim identity: edits to titles, links or invitees never
  // re-ring a device for the same meeting occurrence and stage.
  const eventKey = "meeting:" + id + ":" + start + ":" + stage;
  const title = String(meeting.title || "Réunion programmée").slice(0, 240);
  return { eventKey, payload: {
    title: stage === "start" ? "AfriFlow · Votre réunion commence" : "AfriFlow · Réunion dans moins de 15 min",
    body: title, tag: eventKey, kind: "meeting",
    meetingId: id, meetingTitle: title, start, end, stage, expiresAt,
    // Do not send teamsUrl: older service workers and APKs turn it into a
    // direct Teams action that bypasses authenticated check-in. The app resolves
    // the current authorized link when the member explicitly chooses to join.
    url: SITE_URL + "?meeting=" + encodeURIComponent(id),
  } };
}

export function notificationTtl(payload: NotificationEnvelope, now: number): number {
  if (payload.kind !== "meeting") return 3600;
  const expiry = Number(payload.expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now) || expiry <= now) return 0;
  // Floor prevents the transport retaining a meeting past its server expiry.
  return Math.min(MAX_MEETING_TTL, Math.floor((expiry - now) / 1000));
}

// FCM's data map accepts strings only; preserve exactly the Web Push envelope.
export function fcmData(payload: NotificationEnvelope): Record<string, string> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
}
