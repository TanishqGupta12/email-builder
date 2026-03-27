import { NextResponse } from "next/server";
import { aggregateStats } from "@/lib/campaign-store";

export const runtime = "nodejs";

export async function GET() {
  const { sent, failed, pending, campaigns } = aggregateStats();

  const finished = sent + failed;
  const successRate = finished > 0 ? Math.round((sent / finished) * 1000) / 10 : 0;

  return NextResponse.json({
    totalEmailsSent: sent,
    totalFailed: failed,
    totalPending: pending,
    totalCampaigns: campaigns,
    successRate,
  });
}
