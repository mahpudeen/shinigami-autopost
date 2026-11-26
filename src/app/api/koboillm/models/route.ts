import { NextResponse, type NextRequest } from "next/server";
import { getSettingsDoc } from "@/lib/firebase-admin";
import { fetchKoboiModels } from "@/lib/koboillm";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
      baseUrl?: string;
    };

    let apiKey = body.apiKey?.trim() || "";
    let baseUrl = body.baseUrl?.trim() || "";

    if (!apiKey || !baseUrl) {
      const settings = await getSettingsDoc();
      if (!apiKey) apiKey = settings.koboillmApiKey;
      if (!baseUrl) baseUrl = settings.koboillmBaseUrl;
    }

    const models = await fetchKoboiModels(apiKey, baseUrl);
    return NextResponse.json({
      ok: true,
      total: models.length,
      models,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal memuat daftar model KoboiLLM.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
