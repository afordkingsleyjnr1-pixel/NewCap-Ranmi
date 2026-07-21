import { prisma } from "@/lib/db";
import { getAuthenticatedGoogleClient } from "./google-oauth";
import { getAuthenticatedGraphClient } from "./microsoft-oauth";
import { google } from "googleapis";

// Section 5.8 — Meetings: same OAuth connection as email, extended with Calendar scope.
export async function createCalendarEvent(params: {
  userId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail: string;
  locationOrLink?: string | null;
  agendaNotes?: string | null;
}): Promise<{ providerEventId: string }> {
  const connection = await prisma.emailConnection.findUniqueOrThrow({ where: { userId: params.userId } });

  if (connection.provider === "gmail") {
    const auth = await getAuthenticatedGoogleClient(params.userId);
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: {
        summary: params.title,
        description: params.agendaNotes ?? undefined,
        location: params.locationOrLink ?? undefined,
        start: { dateTime: params.startTime.toISOString() },
        end: { dateTime: params.endTime.toISOString() },
        attendees: [{ email: params.attendeeEmail }],
      },
    });
    return { providerEventId: res.data.id ?? "" };
  }

  if (connection.provider === "outlook") {
    const client = await getAuthenticatedGraphClient(params.userId);
    const event = await client.api("/me/events").post({
      subject: params.title,
      body: { contentType: "Text", content: params.agendaNotes ?? "" },
      start: { dateTime: params.startTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: params.endTime.toISOString(), timeZone: "UTC" },
      location: { displayName: params.locationOrLink ?? "" },
      attendees: [{ emailAddress: { address: params.attendeeEmail }, type: "required" }],
    });
    return { providerEventId: event.id };
  }

  throw new Error("Unsupported calendar provider");
}

export async function updateCalendarEvent(params: {
  userId: string;
  providerEventId: string;
  startTime?: Date;
  endTime?: Date;
  status?: "canceled";
}) {
  const connection = await prisma.emailConnection.findUniqueOrThrow({ where: { userId: params.userId } });

  if (connection.provider === "gmail") {
    const auth = await getAuthenticatedGoogleClient(params.userId);
    const calendar = google.calendar({ version: "v3", auth });
    if (params.status === "canceled") {
      await calendar.events.delete({ calendarId: "primary", eventId: params.providerEventId, sendUpdates: "all" });
      return;
    }
    await calendar.events.patch({
      calendarId: "primary",
      eventId: params.providerEventId,
      sendUpdates: "all",
      requestBody: {
        start: params.startTime ? { dateTime: params.startTime.toISOString() } : undefined,
        end: params.endTime ? { dateTime: params.endTime.toISOString() } : undefined,
      },
    });
    return;
  }

  if (connection.provider === "outlook") {
    const client = await getAuthenticatedGraphClient(params.userId);
    if (params.status === "canceled") {
      await client.api(`/me/events/${params.providerEventId}/cancel`).post({});
      return;
    }
    await client.api(`/me/events/${params.providerEventId}`).patch({
      start: params.startTime ? { dateTime: params.startTime.toISOString(), timeZone: "UTC" } : undefined,
      end: params.endTime ? { dateTime: params.endTime.toISOString(), timeZone: "UTC" } : undefined,
    });
  }
}
