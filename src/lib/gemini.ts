// Day 4: Vertex AI Gemini client — uses ADC, no API key required.
// Instantiated once and shared across chat and agent routes.
import { VertexAI } from "@google-cloud/vertexai";

const PROJECT = process.env.VERTEX_PROJECT ?? "stadiumpal";
const LOCATION = process.env.VERTEX_LOCATION ?? "us-central1";
export const MODEL = "gemini-2.5-flash";

export const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });

export function getModel() {
  return vertexAI.getGenerativeModel({ model: MODEL });
}
