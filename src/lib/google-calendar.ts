import { google } from "googleapis";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { accounts, calendarEvents, calendarSyncStatus } from "@/db/schema";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
}

/**
 * Look up the Google account for a user, create an authenticated
 * Calendar v3 client, and refresh the access token if expired.
 */
export async function getCalendarClient(userId: string) {
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .get();

  if (!account) {
    throw new Error(`No Google account linked for user ${userId}`);
  }

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    token_type: account.tokenType ?? "Bearer",
  });

  // expiresAt is stored as epoch seconds
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (account.expiresAt && account.expiresAt <= nowSeconds) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);

    db.update(accounts)
      .set({
        accessToken: credentials.access_token ?? account.accessToken,
        refreshToken: credentials.refresh_token ?? account.refreshToken,
        expiresAt: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : account.expiresAt,
        tokenType: credentials.token_type ?? account.tokenType,
      })
      .where(eq(accounts.id, account.id))
      .run();
  }

  return google.calendar({ version: "v3", auth: oauth2 });
}

/**
 * Sync events from the user's primary Google Calendar into the local database.
 * Uses incremental sync (syncToken) when available, otherwise fetches
 * events for the next 30 days.
 */
export async function syncEventsFromGoogle(userId: string): Promise<void> {
  // Mark sync as in-progress
  const existingSync = db
    .select()
    .from(calendarSyncStatus)
    .where(eq(calendarSyncStatus.userId, userId))
    .get();

  if (existingSync) {
    db.update(calendarSyncStatus)
      .set({ status: "syncing", errorMessage: null })
      .where(eq(calendarSyncStatus.id, existingSync.id))
      .run();
  } else {
    db.insert(calendarSyncStatus)
      .values({
        id: uuid(),
        userId,
        status: "syncing",
      })
      .run();
  }

  try {
    const calendar = await getCalendarClient(userId);
    const syncStatus = db
      .select()
      .from(calendarSyncStatus)
      .where(eq(calendarSyncStatus.userId, userId))
      .get();

    let allEvents: any[] = [];
    let nextSyncToken: string | undefined;
    let pageToken: string | undefined;

    // Incremental sync if we have a syncToken, otherwise full sync
    const useSyncToken = syncStatus?.syncToken ?? undefined;

    do {
      const params: any = {
        calendarId: "primary",
        singleEvents: true,
        maxResults: 250,
      };

      if (useSyncToken && !pageToken) {
        params.syncToken = useSyncToken;
      } else if (!useSyncToken) {
        const now = new Date();
        const thirtyDaysLater = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        params.timeMin = now.toISOString();
        params.timeMax = thirtyDaysLater.toISOString();
        params.orderBy = "startTime";
      }

      if (pageToken) {
        params.pageToken = pageToken;
      }

      let response;
      try {
        response = await calendar.events.list(params);
      } catch (err: any) {
        // If the sync token is invalid (410 Gone), do a full sync
        if (err.code === 410 && useSyncToken) {
          return syncEventsFullReset(userId);
        }
        throw err;
      }

      const items = response.data.items ?? [];
      allEvents = allEvents.concat(items);
      pageToken = response.data.nextPageToken ?? undefined;
      if (response.data.nextSyncToken) {
        nextSyncToken = response.data.nextSyncToken;
      }
    } while (pageToken);

    const now = new Date();

    // Upsert each event
    for (const gEvent of allEvents) {
      if (!gEvent.id) continue;

      // Handle cancelled events (deleted in incremental sync)
      if (gEvent.status === "cancelled") {
        db.delete(calendarEvents)
          .where(
            and(
              eq(calendarEvents.userId, userId),
              eq(calendarEvents.googleEventId, gEvent.id)
            )
          )
          .run();
        continue;
      }

      const isAllDay = !!gEvent.start?.date;
      const startTime = isAllDay
        ? new Date(gEvent.start!.date!)
        : new Date(gEvent.start!.dateTime!);
      const endTime = isAllDay
        ? new Date(gEvent.end!.date!)
        : new Date(gEvent.end!.dateTime!);

      const existing = db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            eq(calendarEvents.googleEventId, gEvent.id)
          )
        )
        .get();

      if (existing) {
        db.update(calendarEvents)
          .set({
            title: gEvent.summary ?? "(No title)",
            description: gEvent.description ?? null,
            startTime,
            endTime,
            isAllDay,
            location: gEvent.location ?? null,
            syncedAt: now,
          })
          .where(eq(calendarEvents.id, existing.id))
          .run();
      } else {
        db.insert(calendarEvents)
          .values({
            id: uuid(),
            userId,
            googleEventId: gEvent.id,
            title: gEvent.summary ?? "(No title)",
            description: gEvent.description ?? null,
            startTime,
            endTime,
            isAllDay,
            location: gEvent.location ?? null,
            source: "google",
            syncedAt: now,
          })
          .run();
      }
    }

    // Update sync status
    db.update(calendarSyncStatus)
      .set({
        status: "idle",
        lastSyncAt: now,
        syncToken: nextSyncToken ?? syncStatus?.syncToken ?? null,
        errorMessage: null,
      })
      .where(eq(calendarSyncStatus.userId, userId))
      .run();
  } catch (error: any) {
    db.update(calendarSyncStatus)
      .set({
        status: "error",
        errorMessage: error.message ?? "Unknown sync error",
      })
      .where(eq(calendarSyncStatus.userId, userId))
      .run();
    throw error;
  }
}

/**
 * Clear the sync token and perform a fresh full sync.
 */
async function syncEventsFullReset(userId: string): Promise<void> {
  db.update(calendarSyncStatus)
    .set({ syncToken: null })
    .where(eq(calendarSyncStatus.userId, userId))
    .run();

  return syncEventsFromGoogle(userId);
}

/**
 * Create a new event in the user's primary Google Calendar.
 * Returns the Google event ID.
 */
export async function pushEventToGoogle(
  userId: string,
  event: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    isAllDay?: boolean;
  }
): Promise<string> {
  const calendar = await getCalendarClient(userId);

  const start = event.isAllDay
    ? { date: event.startTime.toISOString().split("T")[0] }
    : { dateTime: event.startTime.toISOString() };

  const end = event.isAllDay
    ? { date: event.endTime.toISOString().split("T")[0] }
    : { dateTime: event.endTime.toISOString() };

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description,
      start,
      end,
    },
  });

  const googleEventId = response.data.id;
  if (!googleEventId) {
    throw new Error("Google Calendar did not return an event ID");
  }

  return googleEventId;
}

/**
 * Delete an event from the user's primary Google Calendar.
 */
export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string
) {
  const calendar = await getCalendarClient(userId);

  await calendar.events.delete({
    calendarId: "primary",
    eventId: googleEventId,
  });
}

/**
 * Query Google Calendar's freebusy API to find busy periods
 * within the given date range.
 */
export async function getFreeBusy(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ start: Date; end: Date }>> {
  const calendar = await getCalendarClient(userId);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busySlots =
    response.data.calendars?.primary?.busy ?? [];

  return busySlots
    .filter((slot) => slot.start && slot.end)
    .map((slot) => ({
      start: new Date(slot.start!),
      end: new Date(slot.end!),
    }));
}
