import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

type PublishedFile = { path?: unknown; id?: unknown };
const root = (Deno.env.get("DROPBOX_ROOT") ?? "").replace(/\/+$/, "");

function safePath(input: unknown): string {
  let path = String(input ?? "");
  if (!path || path === "/" || path === "Racine") path = root;
  if (path && !path.startsWith("/")) path = "/" + path;
  path = path.replace(/\/+$/, "");
  if (path.split("/").includes("..") || path.split("/").includes(".")) throw new Error("Chemin Dropbox interdit");
  const lower = path.toLowerCase();
  const allowedRoot = root.toLowerCase();
  if (lower !== allowedRoot && !lower.startsWith(allowedRoot + "/")) throw new Error("Chemin hors du dossier Dropbox autorisé");
  return path;
}

function inFolder(path: string, folder: string) {
  const current = path.toLowerCase();
  const parent = folder.toLowerCase();
  return parent === "" ? current.startsWith("/") : current.startsWith(parent + "/");
}

function publishedPaths(files: PublishedFile[]) {
  return files.flatMap((file) => {
    try {
      return typeof file?.path === "string" ? [safePath(file.path)] : [];
    } catch {
      return [];
    }
  });
}

function sharedEntries(folder: string, files: PublishedFile[]) {
  const current = safePath(folder);
  const directories = new Map<string, { name: string; id: null; path: string; dir: true; is_dir: true; type: "folder"; size: number }>();
  const directFiles = new Map<string, { name: string; id: string | null; path: string; dir: false; is_dir: false; type: "file"; size: number }>();

  for (const file of files) {
    if (typeof file?.path !== "string") continue;
    let path: string;
    try { path = safePath(file.path); } catch { continue; }
    if (!inFolder(path, current)) continue;
    const relative = path.slice(current.length).replace(/^\/+/, "");
    if (!relative) continue;
    const segments = relative.split("/").filter(Boolean);
    if (segments.length > 1) {
      const name = segments[0];
      const child = (current ? current + "/" : "/") + name;
      directories.set(child.toLowerCase(), { name, id: null, path: child, dir: true, is_dir: true, type: "folder", size: 0 });
    } else {
      directFiles.set(path.toLowerCase(), {
        name: segments[0], id: typeof file.id === "string" ? file.id : null, path, dir: false, is_dir: false, type: "file", size: 0,
      });
    }
  }
  return [...directories.values(), ...directFiles.values()].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "fr"));
}

async function dropboxToken() {
  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: Deno.env.get("DROPBOX_REFRESH_TOKEN") ?? "",
      client_id: Deno.env.get("DROPBOX_APP_KEY") ?? "",
      client_secret: Deno.env.get("DROPBOX_APP_SECRET") ?? "",
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Connexion Dropbox indisponible");
  return data.access_token as string;
}

async function dropbox(token: string, endpoint: string, body: unknown) {
  const response = await fetch("https://api.dropboxapi.com/2/" + endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("Dropbox : " + (data.error_summary || "opération refusée"));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return json({ error: "Connexion requise" }, 401);

    const { data: body } = await req.json().then((value) => ({ data: value })).catch(() => ({ data: {} }));
    const action = String(body?.action ?? "").toLowerCase();
    const { data: register, error: registerError } = await supabase
      .from("afriflow_state")
      .select("value")
      .eq("key", "pub:dbxshow")
      .maybeSingle();
    if (registerError) return json({ error: "Contrôle des documents indisponible" }, 503);

    const published: PublishedFile[] = Array.isArray(register?.value?.items) ? register.value.items : [];
    const publishedFilePaths = publishedPaths(published);
    const { data: admin } = await supabase.rpc("af_is_admin");
    const isAdmin = admin === true;
    const canRead = (path: string) => {
      const wanted = safePath(path).toLowerCase();
      return isAdmin || publishedFilePaths.some((publishedPath) => publishedPath.toLowerCase() === wanted);
    };

    if (["list", "browse", "ls", "get_folder", "folder", "files"].includes(action) || !action) {
      const path = safePath(body?.path ?? "");
      if (!isAdmin) return json({ entries: sharedEntries(path, published) });
      const token = await dropboxToken();
      const result = await dropbox(token, "files/list_folder", { path, limit: 2000 });
      const entries = (result.entries ?? []).map((entry: Record<string, unknown>) => {
        const directory = entry[".tag"] === "folder";
        return { name: entry.name, id: entry.id ?? null, path: entry.path_display, dir: directory, is_dir: directory, type: directory ? "folder" : "file", size: entry.size ?? 0 };
      }).sort((a: { dir: boolean; name: string }, b: { dir: boolean; name: string }) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "fr"));
      return json({ entries });
    }

    if (["link", "view", "download", "get_link"].includes(action)) {
      const path = safePath(body?.path ?? "");
      if (!canRead(path)) return json({ error: "Document non publié ou accès interdit" }, 403);
      const token = await dropboxToken();
      const result = await dropbox(token, "files/get_temporary_link", { path });
      return json({ link: result.link });
    }

    if (action === "stream") {
      const path = safePath(body?.path ?? "");
      if (!canRead(path)) return json({ error: "Document non publié ou accès interdit" }, 403);
      const token = await dropboxToken();
      const response = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Dropbox-API-Arg": JSON.stringify({ path }) },
      });
      if (!response.ok) throw new Error("Téléchargement Dropbox indisponible");
      return new Response(response.body, { headers: { ...cors, "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
    }

    if (action === "resolve") {
      if (!isAdmin) return json({ error: "Recherche réservée à l’administrateur" }, 403);
      const original = safePath(body?.path ?? "");
      const token = await dropboxToken();
      const name = original.split("/").pop() ?? "";
      try {
        const existing = await dropbox(token, "files/get_metadata", { path: original });
        if (existing[".tag"] === "file") return json({ id: existing.id, path: existing.path_display, status: "found" });
      } catch { /* The file may have been moved. */ }
      const lookup = await dropbox(token, "files/search_v2", { query: name, options: { path: root, filename_only: true, max_results: 100 } });
      const normalise = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const matches = (lookup.matches ?? []).map((match: { metadata?: { metadata?: Record<string, unknown> } }) => match.metadata?.metadata)
        .filter((file: Record<string, unknown> | undefined) => {
          if (!file || file[".tag"] !== "file" || normalise(String(file.name ?? "")) !== normalise(name)) return false;
          try { safePath(file.path_display); return true; } catch { return false; }
        });
      if (matches.length === 1) return json({ id: matches[0].id, path: matches[0].path_display, status: "relocated" });
      if (matches.length > 1) return json({ error: "Plusieurs fichiers portent ce nom. Réassociez le bon fichier.", code: "ambiguous" }, 409);
      return json({ error: "Fichier Dropbox introuvable. Réassociez-le depuis le navigateur Dropbox.", code: "not_found" }, 404);
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur Dropbox" }, 500);
  }
});
