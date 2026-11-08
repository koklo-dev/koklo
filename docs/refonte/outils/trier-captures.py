"""Trie les captures réécrites par les e2e (design/screens/captures/).

Les e2e web réécrivent TOUTES les captures. Ce script restaure celles qui n'ont pas changé pour de vrai :
- pixels RGB identiques à HEAD (jamais getbbox() sur RGBA : il ne compare que l'alpha) ;
- ou moins de --seuil pixels différents (bruit : heure relative, survol de la souris, curseur), sauf dans les
  dossiers de --garder (écrans réellement modifiés par le ticket).

Usage, depuis la racine du dépôt :
  python3 docs/refonte/outils/trier-captures.py --dry
  python3 docs/refonte/outils/trier-captures.py --seuil 400 --garder S-dev-ui,S-idea
Toujours regarder ensuite les plus gros écarts restants avant de commiter.
"""
import argparse, io, subprocess
from collections import Counter
from PIL import Image, ImageChops

p = argparse.ArgumentParser()
p.add_argument("--dry", action="store_true", help="n'affiche que le tri, ne restaure rien")
p.add_argument("--seuil", type=int, default=0, help="restaure aussi sous ce nombre de pixels différents")
p.add_argument("--garder", default="", help="dossiers S-xxx jamais restaurés, séparés par des virgules")
args = p.parse_args()
keep = {d for d in args.garder.split(",") if d}

status = subprocess.run(["git", "status", "--short", "design/screens/captures"], capture_output=True, text=True).stdout
files = [l[3:] for l in status.splitlines() if l.startswith(" M")]
restore, kept, big = [], Counter(), []
for f in files:
    screen = f.split("/")[3]
    old = subprocess.run(["git", "show", "HEAD:" + f], capture_output=True).stdout
    a, b = Image.open(io.BytesIO(old)).convert("RGB"), Image.open(f).convert("RGB")
    if a.size != b.size:
        n = -1
    else:
        diff = ImageChops.difference(a, b)
        n = 0 if diff.getbbox() is None else sum(1 for px in diff.getdata() if px != (0, 0, 0))
    if n == 0 or (screen not in keep and 0 < n < args.seuil):
        restore.append(f)
    else:
        kept[screen] += 1
        big.append((n, f))
if restore and not args.dry:
    subprocess.run(["git", "checkout", "--"] + restore)
print(f"restaurées {len(restore)} · gardées {dict(kept)}")
for n, f in sorted(big, reverse=True)[:15]:
    print(f"  {'taille' if n < 0 else n:>8}  {f}")
