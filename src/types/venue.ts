import { z } from "zod";

export const StationSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["concession", "restroom", "gate"]),
  position: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
  sections: z.array(z.string()),
});

export const GateStationSchema = StationSchema.extend({
  throughputPerMinute: z.number().int().positive(),
  neighbors: z.array(z.string()),
});

export const SectionConfigSchema = z.object({
  id: z.string(),
  capacity: z.number().int().positive(),
  exitProfile: z.object({
    early: z.number().min(0).max(1),
    immediate: z.number().min(0).max(1),
    late: z.number().min(0).max(1),
  }),
  position: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
});

export const SectionGateEntrySchema = z.object({
  section: z.string(),
  gate: z.string(),
  walkMinutes: z.number().int().positive(),
});

export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  stations: z.array(StationSchema),
});

export const SeatSchema = z.object({
  section: z.string(),
  row: z.string(),
  number: z.string(),
});

export const UserPreferencesSchema = z.object({
  dietary: z.array(z.string()),
  avoidCrowds: z.boolean(),
});

export const NudgeSchema = z.object({
  userId: z.string(),
  message: z.string(),
  reasoning: z.string(),
  elapsedMinutes: z.number(),
  stateSnapshot: z.record(z.unknown()),
  createdAt: z.unknown(),
  read: z.boolean(),
});

export const StationWithWaitSchema = StationSchema.extend({
  waitMinutes: z.number(),
  forecastMinutes: z.number(),
});

export type Station = z.infer<typeof StationSchema>;
export type GateStation = z.infer<typeof GateStationSchema>;
export type SectionConfig = z.infer<typeof SectionConfigSchema>;
export type SectionGateEntry = z.infer<typeof SectionGateEntrySchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Seat = z.infer<typeof SeatSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type Nudge = z.infer<typeof NudgeSchema>;
export type StationWithWait = z.infer<typeof StationWithWaitSchema>;

// FlowMatrix: gateId → array of length 46, index i = minute (175 + i), T=175..220
export type FlowMatrix = Record<string, number[]>;

// Agent-facing user type — matchStartedAt is stored in Firestore as a Timestamp
// and converted to epoch ms before being passed into the agent
export type User = {
  uid: string;
  matchStartedAt: number; // epoch ms
  seat: { section: string; row: string; number: string };
  preferences: { dietary: string[]; avoidCrowds: boolean };
};
