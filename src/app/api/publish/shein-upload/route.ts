import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ message: "Storage não configurado." }, { status: 503 });

  const bucket = process.env.VIDEO_STORAGE_BUCKET || "videos";
  const path = `express/${auth.user.id}/${crypto.randomUUID()}.${MIME_TO_EXTENSION[file.type]}`;
  const upload = await supabase.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ message: `Falha ao salvar imagem: ${upload.error.message}` }, { status: 502 });

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
