import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// "" = racine de l'app (dossier d'application) ; "/AfriFlow" = dossier d'une Dropbox complète
const ROOT = Deno.env.get("DROPBOX_ROOT") ?? "";

// Empêche de sortir du dossier ciblé
function safePath(raw: string): string {
  let p = (!raw || raw === "/" || raw === "Racine") ? ROOT : raw;
  if (p && !p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/+$/, "");
  if (p.split("/").includes("..")) throw new Error("Chemin interdit");
  const low = p.toLowerCase(), root = ROOT.toLowerCase();
  if (low !== root && !low.startsWith(root + "/")) throw new Error("Chemin interdit");
  return p;
}

async function dbxToken(): Promise<string> {
  const r = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: Deno.env.get("DROPBOX_REFRESH_TOKEN") ?? "",
      client_id: Deno.env.get("DROPBOX_APP_KEY") ?? "",
      client_secret: Deno.env.get("DROPBOX_APP_SECRET") ?? "",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Erreur de liaison Dropbox : " + (j.error_description || j.error));
  return j.access_token;
}

async function dbx(token: string, ep: string, body: unknown) {
  const r = await fetch("https://api.dropbox.com/2/" + ep, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Erreur Dropbox (" + ep + ") : " + (j.error_summary || JSON.stringify(j)));
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return J({ error: "Connexion requise" }, 401);
    const isAdmin = (await sb.rpc("af_is_admin")).data === true;
    const b = await req.json();
    const action = String(b.action || "").toLowerCase();
    // Authorize every Dropbox operation against the published-file register.
    // The Dropbox token belongs to AfriFloW, never to the requesting user.
    const filesResult = await sb.from("afriflow_state").select("value").eq("key","pub:dbxshow").maybeSingle();
    if (filesResult.error) return J({error:"Contrôle des documents indisponible"},503);
    const published = Array.isArray(filesResult.data?.value?.items) ? filesResult.data.value.items : [];
    const canRead = (path: string): boolean => isAdmin || published.some((f: any) =>
      typeof f?.path === "string" && f.path.toLowerCase() === path.toLowerCase()
    );


    // Résoudre un fichier déplacé/renommé sans sortir du dossier Dropbox autorisé.
    // Les correspondances ambiguës ne sont jamais ouvertes automatiquement.
    if (action === "resolve") {
      if (!isAdmin) return J({ error: "Recherche réservée à l’administrateur" }, 403);
      const original = safePath(String(b.path || ""));
      const token = await dbxToken();
      const name = original.split("/").pop() || "";
      try {
        const existing = await dbx(token, "files/get_metadata", { path: original });
        if (existing[".tag"] === "file") {
          return J({ id: existing.id, path: existing.path_display, status: "found" });
        }
      } catch (_error) { /* Ancien chemin : rechercher dans le dossier autorisé. */ }
      const lookup = await dbx(token, "files/search_v2", {
        query: name,
        options: { path: ROOT || "", filename_only: true, max_results: 100 }
      });
      const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const candidates = (lookup.matches || [])
        .map((match: any) => match.metadata?.metadata)
        .filter((file: any) => {
          if (!file || file[".tag"] !== "file" || norm(file.name) !== norm(name)) return false;
          try { safePath(String(file.path_display || "")); return true; } catch (_e) { return false; }
        });
      if (candidates.length === 1) {
        return J({ id: candidates[0].id, path: candidates[0].path_display, status: "relocated" });
      }
      if (candidates.length > 1) {
        return J({ error: "Plusieurs fichiers Dropbox portent ce nom. Réassociez le bon fichier dans la liste.", code: "ambiguous" }, 409);
      }
      return J({ error: "Fichier Dropbox introuvable. Il a peut-être été renommé. Réassociez-le depuis le navigateur Dropbox.", code: "not_found" }, 404);
    }

    // 1. Lister (tout utilisateur connecté)
    if (["list", "browse", "ls", "get_folder", "folder", "files"].includes(action) || !action) {
      if (!isAdmin) return J({ error: "Exploration Dropbox réservée à l’administrateur" }, 403);
      const p = safePath(String(b.path ?? ""));
      const token = await dbxToken();
      const j = await dbx(token, "files/list_folder", { path: p, limit: 2000 });
      const entries = j.entries
        .map((e: any) => {
          const isDir = e[".tag"] === "folder";
          return {
            name: e.name,
            id: e.id || null,
            path: e.path_display,
            dir: isDir,
            is_dir: isDir,
            type: isDir ? "folder" : "file",
            size: e.size ?? 0,
          };
        })
        .sort((a: any, c: any) => Number(c.dir) - Number(a.dir) || a.name.localeCompare(c.name));
      return J({ entries });
    }

    // 2. Upload (administrateur uniquement)
    if (action === "upload") {
      if (!isAdmin) return J({ error: "Réservé à l'administrateur" }, 403);
      const filePath = ROOT + "/" + String(b.name || "sans-titre").replace(/[\\/]/g, "_");
      const token = await dbxToken();
      const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Dropbox-API-Arg": JSON.stringify({ path: filePath, mode: "overwrite", autorename: true }),
          "Content-Type": "application/octet-stream",
        },
        body: Uint8Array.from(atob(b.base64Content), (c) => c.charCodeAt(0)),
      });
      if (!r.ok) throw new Error("Erreur lors de l'upload vers Dropbox : " + (await r.text()));
      return J({ success: true });
    }

    // 3. Lien temporaire (pour Word, Excel, PowerPoint et le téléchargement)
    if (["link", "view", "download", "get_link"].includes(action)) {
      const token = await dbxToken();
      const path = safePath(String(b.path || ""));
      if (!canRead(path)) return J({ error: "Document non publié ou accès interdit" }, 403);
      const j = await dbx(token, "files/get_temporary_link", { path });
      return J({ link: j.link });
    }

    // 4. Contenu d'un fichier pour affichage dans la page (PDF, images, vidéos, sons)
    if (action === "stream") {
      const token = await dbxToken();
      const path = safePath(String(b.path || ""));
      if (!canRead(path)) return J({ error: "Document non publié ou accès interdit" }, 403);
      const r = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Dropbox-API-Arg": JSON.stringify({ path }),
        },
      });
      if (!r.ok) throw new Error("Erreur Dropbox (download) : " + (await r.text()));
      return new Response(r.body, {
        headers: { ...cors, "Content-Type": "application/octet-stream" },
      });
    }

    return J({ error: "Action inconnue: " + action }, 400);
  } catch (e) {
    return J({ error: String((e as Error).message || e) }, 500);
  }
});