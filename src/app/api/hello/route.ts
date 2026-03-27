import { NextResponse } from "next/server";

export async function GET() {
  const envLoaded = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ANTHROPIC_API_KEY
  );

  return NextResponse.json({
    message: "hello",
    time: new Date().toISOString(),
    envLoaded,
  });
}
