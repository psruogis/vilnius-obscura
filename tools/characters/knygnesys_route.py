# One-off helper for docs/characters/knygnesys.md: routes the courier over the game street graph
# (public/data/area.json roads) and writes docs/characters/knygnesys-route.{json,svg}.
# Run from the repo root: python tools/characters/knygnesys_route.py  (Python 3, standard library only)

import json, glob, math, heapq

d = json.load(open('public/data/area.json', encoding='utf-8'))
osm = json.load(open(glob.glob('shadows-of-vilnius-seed/osm/*.json')[0], encoding='utf-8'))
TH = tuple(d['meta']['townHall']); WR = d['meta']['walkRadius']


# WGS84 -> LKS94 (EPSG:3346): Transverse Mercator on GRS80 (Snyder)
def lks94(lon, lat):
    a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9998; lon0 = math.radians(24)
    e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    phi = math.radians(lat); lam = math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2
    C = ep2 * math.cos(phi) ** 2; A = (lam - lon0) * math.cos(phi)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    E = 500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120)
    Nn = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
                                        + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, Nn


def local(lon, lat):
    E, N = lks94(lon, lat)
    return (E - 583000, -(N - 6061000))


els = osm['elements']; nodes = {e['id']: e for e in els if e['type'] == 'node'}


def way_centroid(wid):
    w = next(e for e in els if e['type'] == 'way' and e['id'] == wid)
    pts = [local(nodes[n]['lon'], nodes[n]['lat']) for n in w['nodes'][:-1] if n in nodes]
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)), pts


th_osm, _ = way_centroid(111866535)
print(f"projection check: Town Hall OSM centroid -> ({th_osm[0]:.1f},{th_osm[1]:.1f}); game meta townHall = {TH}")
church, church_ring = way_centroid(55447268)
print(f"St Nicholas (way 55447268) local = ({church[0]:.1f},{church[1]:.1f}), {math.dist(church, TH):.0f} m from Town Hall")

# street graph from the game's own roads
key = lambda p: (round(p[0] * 2) / 2, round(p[1] * 2) / 2)
G = {}; street_of = {}
for r in d['roads']:
    L = r['line']
    for p, q in zip(L, L[1:]):
        a, b = key(p), key(q); w = math.dist(a, b)
        G.setdefault(a, {})[b] = w; G.setdefault(b, {})[a] = w
        nm = r.get('name') or ('courtyard passage (tarpuvartė)' if r.get('tunnel') else '(unnamed footway)')
        street_of[(a, b)] = street_of[(b, a)] = nm


def nearest(pt):
    return min(G, key=lambda n: math.dist(n, pt))


def dijkstra(s, t, avoid=0):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        dd, u = heapq.heappop(pq)
        if u == t:
            break
        if dd > dist[u]:
            continue
        for v, w in G[u].items():
            if avoid and math.dist(((u[0] + v[0]) / 2, (u[1] + v[1]) / 2), TH) < avoid:
                w = w * 25
            nd = dd + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    path = [t]
    while path[-1] != s:
        path.append(prev[path[-1]])
    return path[::-1], dist[t]


aus = [tuple(p) for r in d['roads'] if r.get('name') == 'Aušros Vartų g.' for p in r['line']]
gate_end = max(aus, key=lambda p: p[1])  # +Z is south
S = key(gate_end)
assert S in G, f'start node {S} missing from graph'
T = nearest(church); SQ = nearest(TH)
print(f"start (south end of Aušros Vartų g.) {S}, {math.dist(S, TH):.0f} m from Town Hall; end node by church {T}")

pa, _ = dijkstra(S, T, avoid=95)
la = sum(math.dist(a, b) for a, b in zip(pa, pa[1:]))
p1, l1 = dijkstra(S, SQ); p2, l2 = dijkstra(SQ, T); pb, lb = p1 + p2[1:], l1 + l2


def legs(path):
    out = []
    for a, b in zip(path, path[1:]):
        s = street_of.get((a, b), '?'); w = math.dist(a, b)
        if out and out[-1][0] == s:
            out[-1][1] += w
        else:
            out.append([s, w])
    return out


def simplify(path, tol=1.5):
    if len(path) < 3:
        return path
    a, b = path[0], path[-1]

    def dseg(p):
        ax, az = a; bx, bz = b; px, pz = p; dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-9; t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
        return math.dist(p, (ax + t * dx, az + t * dz))
    i = max(range(1, len(path) - 1), key=lambda k: dseg(path[k]))
    if dseg(path[i]) > tol:
        return simplify(path[:i + 1], tol)[:-1] + simplify(path[i:], tol)
    return [a, b]


res = {}
for name, path, L in (('A_quiet', pa, la), ('B_via_square', pb, lb)):
    lg = legs(path)
    inside = sum(math.dist(a, b) for a, b in zip(path, path[1:])
                 if math.dist(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), TH) <= WR)
    print(f"\nRoute {name}: {L:.0f} m, {L / 1.2 / 60:.1f} min loaded at 1.2 m/s; {inside:.0f} m inside the playable radius")
    for s, w in lg:
        print(f"   {w:6.0f} m  {s}")
    res[name] = {'length_m': round(L, 1), 'inside_walk_radius_m': round(inside, 1),
                 'legs': [{'street': s, 'length_m': round(w, 1)} for s, w in lg],
                 'waypoints': [[round(x, 1), round(z, 1)] for x, z in simplify(path)]}
res['_frame'] = d['meta']['frame']; res['_townHall'] = list(TH)
res['_church'] = [round(church[0], 1), round(church[1], 1)]; res['_start'] = list(S)
res['_note'] = 'Waypoints on the game street graph (public/data/area.json roads). See docs/characters/knygnesys.md.'
json.dump(res, open('docs/characters/knygnesys-route.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# SVG map
cx, cz = (S[0] + T[0] + TH[0]) / 3, (S[1] + T[1] + TH[1]) / 3; half = 330
x0, z0, W = cx - half, cz - half, 2 * half; sc = 900 / W


def P(p):
    return f"{(p[0] - x0) * sc:.1f},{(p[1] - z0) * sc:.1f}"


def XY(p):
    return (p[0] - x0) * sc, (p[1] - z0) * sc


svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" font-family="Georgia,serif">',
       '<rect width="900" height="900" fill="#efe8dc"/>']
for b in d['buildings']:
    ring = b['rings'][0]
    fill = '#b9483a' if b.get('role') == 'stcasimir' else ('#d9a441' if b.get('role') == 'townhall' else '#cfc4b3')
    svg.append(f'<polygon points="{" ".join(P(p) for p in ring)}" fill="{fill}" stroke="#a89c89" stroke-width="0.5"/>')
svg.append(f'<polygon points="{" ".join(P(p) for p in church_ring)}" fill="#2f6b4f" stroke="#1d4532" stroke-width="1"/>')
for r in d['roads']:
    svg.append(f'<polyline points="{" ".join(P(p) for p in r["line"])}" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round"/>')
tx, tz = XY(TH)
svg.append(f'<circle cx="{tx:.1f}" cy="{tz:.1f}" r="{WR * sc:.1f}" fill="none" stroke="#6b5b45" stroke-dasharray="4 4" stroke-width="1.2"/>')
svg.append(f'<polyline points="{" ".join(P(p) for p in pa)}" fill="none" stroke="#2f6b4f" stroke-width="3" stroke-dasharray="7 5"/>')
svg.append(f'<polyline points="{" ".join(P(p) for p in pb)}" fill="none" stroke="#7a1f14" stroke-width="3.5"/>')


def label(p, text, dx=8, dy=-8, col='#2b2217'):
    x, z = XY(p)
    svg.append(f'<circle cx="{x:.1f}" cy="{z:.1f}" r="5" fill="{col}"/>'
               f'<text x="{x + dx:.1f}" y="{z + dy:.1f}" font-size="15" fill="{col}">{text}</text>')


label(S, 'from the Gate of Dawn', 8, 18)
label(T, 'St Nicholas, the attic', -160, -12, '#1d4532')
label(TH, 'Town Hall', 10, -10)
svg.append('<g font-size="14" fill="#2b2217"><rect x="16" y="16" width="340" height="120" fill="#efe8dc" stroke="#a89c89"/>'
           '<line x1="28" y1="40" x2="68" y2="40" stroke="#7a1f14" stroke-width="3.5"/><text x="78" y="45">B: through the square (the player sees him)</text>'
           '<line x1="28" y1="64" x2="68" y2="64" stroke="#2f6b4f" stroke-width="3" stroke-dasharray="7 5"/><text x="78" y="69">A: the quiet way</text>'
           '<line x1="28" y1="88" x2="68" y2="88" stroke="#6b5b45" stroke-dasharray="4 4"/><text x="78" y="93">playable radius (110 m)</text>'
           '<rect x="30" y="104" width="12" height="12" fill="#b9483a"/><text x="50" y="115">Orthodox cathedral (former St Casimir)</text></g>')
svg.append('<text x="884" y="884" text-anchor="end" font-size="11" fill="#6b5b45">north up · streets © OpenStreetMap contributors (ODbL) · footprints GRPK (CC BY 4.0)</text></svg>')
open('docs/characters/knygnesys-route.svg', 'w', encoding='utf-8').write('\n'.join(svg))
print('\nwrote docs/characters/knygnesys-route.json and .svg')
