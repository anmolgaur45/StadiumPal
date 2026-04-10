import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Uses Application Default Credentials automatically.
// Locally: run `gcloud auth application-default login`
// On Cloud Run: the runtime service account provides credentials.
if (!getApps().length) {
  initializeApp();
}

export const adminDb = getFirestore();
