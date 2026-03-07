import { getStatsResponse, revalidate } from "../route";

export { revalidate };

export async function GET(request: Request) {
  return getStatsResponse(request, { route: "api_stats_snapshot", allowUnfilteredFastPath: true });
}
