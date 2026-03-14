import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();

    const [usersSnap, subsSnap, paymentsSnap, commissionsSnap, telegramPrefsSnap] =
      await Promise.all([
        db.collection("users").get(),
        db.collection("subscriptions").get(),
        db.collection("payments").get(),
        db.collection("referral_commissions").get(),
        db.collection("telegram_preferences").get(),
      ]);

    const subsMap = new Map<string, any>();
    subsSnap.docs.forEach((d) => subsMap.set(d.id, d.data()));

    const paymentsByUser = new Map<string, any[]>();
    paymentsSnap.docs.forEach((d) => {
      const data = d.data();
      const uid = data.userId;
      if (!uid) return;
      if (!paymentsByUser.has(uid)) paymentsByUser.set(uid, []);
      paymentsByUser.get(uid)!.push({ id: d.id, ...data });
    });

    const commissionsByReferrer = new Map<string, any[]>();
    commissionsSnap.docs.forEach((d) => {
      const data = d.data();
      const rid = data.referrerId;
      if (!rid) return;
      if (!commissionsByReferrer.has(rid)) commissionsByReferrer.set(rid, []);
      commissionsByReferrer.get(rid)!.push(data);
    });

    const telegramPrefsMap = new Map<string, any>();
    telegramPrefsSnap.docs.forEach((d) => telegramPrefsMap.set(d.id, d.data()));

    const referredByCount = new Map<string, number>();
    usersSnap.docs.forEach((d) => {
      const referrer = d.data().referredBy;
      if (referrer) {
        referredByCount.set(referrer, (referredByCount.get(referrer) || 0) + 1);
      }
    });

    const users = usersSnap.docs.map((d) => {
      const uid = d.id;
      const u = d.data();
      const sub = subsMap.get(uid);
      const payments = paymentsByUser.get(uid) || [];
      const commissions = commissionsByReferrer.get(uid) || [];
      const prefs = telegramPrefsMap.get(uid);

      const finishedPayments = payments.filter((p: any) => p.status === "finished");
      const totalRevenue = finishedPayments.reduce(
        (sum: number, p: any) => sum + (p.priceAmountUsd || 0),
        0
      );

      const totalEarned = commissions.reduce(
        (s: number, c: any) => s + (c.commissionAmountUsd || 0),
        0
      );
      const paidCommissions = commissions
        .filter((c: any) => c.status === "paid")
        .reduce((s: number, c: any) => s + (c.commissionAmountUsd || 0), 0);
      const pendingCommissions = commissions
        .filter((c: any) => c.status === "pending" || c.status === "approved")
        .reduce((s: number, c: any) => s + (c.commissionAmountUsd || 0), 0);

      let subStatus = sub?.status || "none";
      let daysLeft = 0;
      if (sub) {
        const endDate = sub.subscriptionEndDate || sub.trialEndDate;
        if (endDate) {
          daysLeft = Math.max(
            0,
            Math.ceil(
              (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )
          );
          if (daysLeft <= 0 && subStatus !== "expired") {
            subStatus = "expired";
          }
        }
      }

      return {
        uid,
        displayName: u.displayName || null,
        email: u.email || null,
        photoURL: u.photoURL || null,
        createdAt: sub?.createdAt || u.lastSeenAt || null,
        lastSeenAt: u.lastSeenAt || null,
        subscription: {
          status: subStatus,
          daysLeft,
          endDate: sub?.subscriptionEndDate || sub?.trialEndDate || null,
        },
        telegram: {
          connected: !!u.telegramChatId,
          enabled: u.telegramEnabled ?? false,
          username: u.telegramUsername || null,
          connectedAt: u.telegramConnectedAt || null,
          preferences: prefs || null,
        },
        referral: {
          code: u.referralCode || null,
          referredCount: referredByCount.get(uid) || 0,
          totalEarned: Math.round(totalEarned * 100) / 100,
          paid: Math.round(paidCommissions * 100) / 100,
          pending: Math.round(pendingCommissions * 100) / 100,
          walletAddress: u.referralWalletAddress || null,
        },
        revenue: {
          totalPaid: Math.round(totalRevenue * 100) / 100,
          paymentCount: finishedPayments.length,
        },
      };
    });

    users.sort((a, b) => {
      const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bTime - aTime;
    });

    let visits = { total: 0, today: 0 };
    try {
      const visitSnap = await db.collection("config").doc("site_visits").get();
      if (visitSnap.exists) {
        const vd = visitSnap.data()!;
        const today = new Date().toISOString().slice(0, 10);
        visits = { total: vd.total || 0, today: vd.daily?.[today] || 0 };
      }
    } catch {}

    return NextResponse.json({ users, total: users.length, visits });
  } catch (error: any) {
    console.error("[Admin Users]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
