/**
 * Run once to seed the config/plans doc in Firestore.
 * Usage: npx tsx scripts/seed-plans.ts
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  projectId: "studio-6235588950-a15f2",
});

const db = getFirestore(app);

async function seed() {
  await db.collection("config").doc("plans").set({
    plans: [
      { days: 30,  price: 15,  label: "30 days" },
      { days: 90,  price: 20,  label: "90 days",  badge: "Most Popular" },
      { days: 365, price: 25,  label: "365 days", badge: "Best Value" },
    ],
    updatedAt: new Date().toISOString(),
  });

  console.log("Plans seeded successfully in config/plans");
}

seed().catch(console.error);
