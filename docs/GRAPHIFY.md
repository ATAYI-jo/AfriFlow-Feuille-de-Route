# Graphify — AfriFlow

Index de navigation du code pour les développeurs et assistants IA. L'analyse AST est locale, sans clé API ni modèle payant. Elle n'est pas une analyse exhaustive du HTML, du SQL, des comportements dynamiques ou des règles Supabase.

Depuis la racine du dépôt :

```powershell
python -m pip install -r tools/requirements-graphify.txt
graphify extract . --code-only
graphify cluster-only . --no-label
graphify query "market order validation" --budget 2000
graphify god-nodes --top 15
```

Les résultats restent dans `graphify-out/` (ignoré par Git) : `graph.json`, `GRAPH_REPORT.md` et, selon la taille du graphe, `graph.html`. Ouvrir le HTML localement si disponible. Relancer l'extraction après un changement important. Ne pas publier ce dossier sur Cloudflare Pages, ni ajouter de fichiers secrets au corpus.

Le workflow GitHub Actions Graphify vérifie l'extraction lors des modifications du code et peut être lancé manuellement. Il ne publie pas les graphes, ne modifie pas le site et n'utilise aucune clé LLM. Le fichier `AGENTS.md` guide les assistants compatibles ; les autres assistants doivent être invités à consulter le graphe explicitement.
