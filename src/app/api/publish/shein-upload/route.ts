import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { detectSheinImageType, hasExactImageBytes, isValidPublicImageResponse } from "@/lib/publish/shein-upload-validation";

const MAX_BYTES = 2_000_000;
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  const { data: auth } = client ? await client.auth.getUser() : { data: { user: null } };
  if (!auth.user) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Arquivo ausente." }, { status: 400 });
  if (!MIME_TO_EXTENSION[file.type]) return NextResponse.json({ message: "Use JPG, JPEG, PNG ou WEBP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: "A imagem deve ter até 2 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = detectSheinImageType(bytes);
  if (!detectedType || detectedType !== file.type) return NextResponse.json({ message: "O conteúdo real não corresponde a uma imagem JPG, PNG ou WEBP válida." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ message: "Storage não configurado." }, { status: 503 });

  const bucket = process.env.OFFER_IMAGE_STORAGE_BUCKET || "offer-images";
  const path = `${auth.user.id}/express/${crypto.randomUUID()}.${MIME_TO_EXTENSION[detectedType]}`;
  const upload = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: detectedType,
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ message: `Falha ao salvar imagem: ${upload.error.message}` }, { status: 502 });

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const stored = await supabase.storage.from(bucket).download(path);
  const storedBytes = stored.data ? Buffer.from(await stored.data.arrayBuffer()) : null;
  if (stored.error || !storedBytes || !hasExactImageBytes(bytes, storedBytes) || detectSheinImageType(storedBytes) !== detectedType) {
    await supabase.storage.from(bucket).remove([path]);
    return NextResponse.json({ message: "O objeto salvo não corresponde aos bytes originais." }, { status: 502 });
  }

  const publicResponse = await fetch(data.publicUrl, { cache: "no-store" });
  const publicContentType = publicResponse.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
  const publicBytes = publicResponse.ok ? Buffer.from(await publicResponse.arrayBuffer()) : null;
  if (!publicBytes || !isValidPublicImageResponse(publicResponse.status, publicContentType, publicBytes, bytes, detectedType)) {
    const responseBody = publicBytes?.toString("utf8").slice(0, 500) || "";
    console.error("[Shein upload public URL validation failed]", {
      url: data.publicUrl,
      bucket,
      path,
      status: publicResponse.status,
      responseBody,
      contentType: publicContentType,
    });
    await supabase.storage.from(bucket).remove([path]);
    return NextResponse.json({ message: `A URL pública não passou na validação (${publicResponse.status}).` }, { status: 502 });
  }

  return NextResponse.json({ url: data.publicUrl });
}
