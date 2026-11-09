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

    // 1. Lister (tout utilisateur connecté)
    if (["list", "browse", "ls", "get_folder", "folder", "files"].includes(action) || !action) {
      const p = safePath(String(b.path ?? ""));
      const token = await dbxToken();
      const j = await dbx(token, "files/list_folder", { path: p, limit: 2000 });
      const entries = j.entries
        .map((e: any) => {
          const isDir = e[".tag"] === "folder";
          return {
            name: e.name,
            path: e.path_display,
            dir: isDir,
            is_dir: isDir,
            type: isDir ? "folder" : "file",
            size: e.size ?? 0,
            id: e.id ?? null,
          };
        })
        .sort((a: any, c: any) => Number(c.dir) - Number(a.dir) || a.name.localeCompare(c.name));
      return J({ entries });
    }

    // Recherche en lecture seule d'un fichier déplacé : exact nom + extension, unique seulement.
    // Le chemin de secours ne doit jamais correspondre approximativement à un autre document.
    if (action === "resolve") {
      const raw = String(b.path || "");
      const p = safePath(raw);
      const token = await dbxToken();
      try {
        const m = await dbx(token, "files/get_metadata", { path: p, include_deleted: false });
        if (m[".tag"] === "file") return J({ path: m.path_display, id: m.id, exact: true });
      } catch (err) {
        if (!/not_found/i.test(String((err as Error).message))) throw err;
      }
      const knownId = String(b.id || "");
      if (/^id:[a-zA-Z0-9_-]+$/.test(knownId)) {
        try {
          const m = await dbx(token, "files/get_metadata", { path: knownId });
          if (m[".tag"] === "file") return J({ path: m.path_display, id: m.id, moved: true });
        } catch (err) {
          if (!/not_found/i.test(String((err as Error).message))) throw err;
        }
      }
      const name = p.split("/").pop() || "";
      if (!name || name.length < 4) return J({ error: "Nom de document insuffisant pour retrouver le fichier." }, 404);
      const result = await dbx(token, "files/search_v2", {
        query: name,
        options: { path: ROOT || "", filename_only: true, max_results: 100 }
      });
      const matches = (result.matches || []).map((x: any) => x.metadata?.metadata || x.metadata)
        .filter((x: any) => x?.[".tag"] === "file" && x.name?.normalize("NFC").toLowerCase() === name.normalize("NFC").toLowerCase());
      if (matches.length === 1) return J({ path: matches[0].path_display, id: matches[0].id, moved: true });
      if (matches.length > 1) return J({ error: "Plusieurs fichiers portent ce nom. Choisissez le bon dans l'explorateur Dropbox.", ambiguous: true }, 409);
      return J({ error: "Fichier introuvable. Il a peut-être été renommé ou supprimé. Choisissez-le dans l'explorateur Dropbox.", not_found: true }, 404);
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
      const j = await dbx(token, "files/get_temporary_link", { path: safePath(String(b.path || "")) });
      return J({ link: j.link });
    }

    // 4. Contenu d'un fichier pour affichage dans la page (PDF, images, vidéos, sons)
    if (action === "stream") {
      const token = await dbxToken();
      const path = safePath(String(b.path || ""));
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