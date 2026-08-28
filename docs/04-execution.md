# 4. Execution

Commands to run, refresh, and publish.

---

## First run

```bash
git clone https://github.com/dfreriks-snow/supply-chain-ontology.git
cd supply-chain-ontology
npm install
npm run dev
```

Open <http://localhost:5179>. Eight of the nine pages work immediately from the
committed `data/sc_ontology.json` — no Snowflake connection needed.

Only **Ask the Ontology** needs credentials:

```bash
cp server/.env.example server/.env
# fill in account, user, private key path
npm run dev
```

The Ask page states what is missing if the configuration is incomplete, rather
than failing silently.

---

## Scripts

| Command | Does |
|---|---|
`npm run dev` | Server :3009 and client :5179 together |
`npm run build` | Typecheck and build both workspaces |
`npm run start` | Run the built server |
`npm run export-data` | Rebuild `data/sc_ontology.json` from the parent catalog |
`npm run deploy-views` | Create the Snowflake views, assert parity, fail on drift |
`npm run bake` | Snapshot the live API to `client/public/data/` |
`npm run build:static` | Build the credential-free public bundle |
`npm run preview:static` | Serve that bundle on :8899 |

`export-data` needs the [parent explorer](06-references.md#parent-project) as a
sibling directory — it imports `ontology_builder` rather than duplicating it.

---

## Ports

| Port | Process |
|---|---|
3009 | Express API |
5179 | Vite dev server (proxies `/api` → 3009) |
8899 | Static preview |

Both app ports are `strictPort`, so a clash fails loudly instead of silently
moving. If 3009 is taken, change `PORT` in `server/.env` **and** the proxy target
in `client/vite.config.ts` — they must match.

---

## Refreshing after the SAP catalog changes

In order:

```bash
npm run export-data     # re-slice from the parent catalog
npm run deploy-views    # re-assert Snowflake/JSON parity
npm run bake            # re-snapshot for the public build
```

`deploy-views` is the gate. If the Python and SQL scope rules have drifted it
exits non-zero, and the run stops before a mismatched semantic view can go out.

If product or entity counts change, the figures quoted in these docs and in the
README go stale. The app reads them live; the prose does not.

---

## Editing the semantic view

Always through the CLI:

```bash
cortex agent-studio sv-edit --file-path SUPPLY_CHAIN_ONTOLOGY_MODEL.sv.yaml \
  --operations '[{"operation":"validate_yaml"}]'

cortex agent-studio sv-deploy \
  --file-path cortex_project/SUPPLY_CHAIN_ONTOLOGY_MODEL.sv.yaml \
  --fqn SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL
```

After **any** edit, do both of these:

1. **Count facts and metrics.** `sv-edit` can report success and silently drop an
   operation.
2. **Run the example questions.** A model that validates and deploys clean can
   still fail every query.

```bash
curl -s localhost:3009/api/ask/examples | python3 -c '
import json,sys
for q in json.load(sys.stdin): print(q)'
```

Read [findings](05-findings.md#the-semantic-view-trap) before changing facts.

---

## Publishing the public build

GitHub Pages builds from the committed snapshots.

```bash
npm run dev             # one shell
npm run bake            # another
git add client/public/data
git commit -m "refresh snapshots"
git push
```

`.github/workflows/deploy.yml` runs on pushes touching `client/**`, refuses to
deploy with fewer than 20 snapshots, and builds with
`BASE_PATH=/<repo-name>/` because Pages serves project sites from a
subdirectory.

Enable it once under **Settings → Pages → Source: GitHub Actions**.

The guard exists because a missing-snapshot build succeeds and produces a site
where every page renders empty — worse than a red build.

---

## What the public build cannot do

Both are stated on screen rather than left to fail:

- **Ask** — needs Snowflake credentials, which a public site cannot hold.
- **Shortest path** — the pair space is quadratic; only expansion from the 24
  most-connected entities is baked.

Everything else works from the snapshot.

---

## Troubleshooting

**Ask returns `invalid identifier`** — a numeric column was promoted to a fact.
See [findings](05-findings.md#the-semantic-view-trap). The error response
includes the generated SQL; read it.

**A page is empty in the static build** — that view was not baked. Check
`client/public/data/` for the expected filename; the client shows "not in this
snapshot" rather than crashing.

**Traversal snapshots 404 in the static build** — the filename sanitizer in
`tools/bake_static.py` and `client/src/lib/api.ts` has drifted. They must apply
the identical substitution. Test over HTTP, not off disk.

**`deploy-views` fails parity** — the Python and SQL scope rules disagree. Fix
the rule, do not weaken the check.

**Shortest path always says "no path"** — expected between different components.
The graph is 94 components; see
[findings](05-findings.md#the-graph-is-not-what-it-looks-like).
