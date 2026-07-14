export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    service: "nextjs",
    healthy: true,
    timestamp: new Date().toISOString()
  });
}

