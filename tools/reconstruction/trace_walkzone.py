"""Trace the 1842 plan's building blocks in the walk-zone change areas and split them into plots.

Outputs (EPSG:3346):
  walkzone_historic.geojson       plots (kind=plot, storeys, source, grade)
  walkzone_remove_modern.json     GRPK TOP_IDs replaced by the 1842 layout
  walkzone_overlay.jpg            check image: plan + removed (red) + kept (green) + new plots (blue)
"""
import sys, json, re, hashlib
import numpy as np
sys.path.insert(0, '/private/tmp/claude-501/-Users-pauliuss-snbx/90dd4c2e-1692-47f0-8f53-18b3e44e3556/scratchpad/pass2')
sys.path.insert(0, '/private/tmp/claude-501/-Users-pauliuss-snbx/90dd4c2e-1692-47f0-8f53-18b3e44e3556/scratchpad/vok_carto')
from vec import mask1842_geo, vectorize, warped_gray1842
from shapely.geometry import Polygon, MultiPolygon, Point, shape, mapping, MultiPoint, LineString
from shapely.ops import unary_union, voronoi_diagram
from PIL import Image, ImageDraw

OUT = sys.argv[1]
A = np.array(json.load(open('/private/tmp/claude-501/-Users-pauliuss-snbx/90dd4c2e-1692-47f0-8f53-18b3e44e3556/scratchpad/vok_carto/A2.json')))
SEED = '/Users/pauliuss/snbx/shadows-of-vilnius-seed/grpk/grpk_pastat_oldtown_epsg3346.geojson'
KVR = '/private/tmp/claude-501/-Users-pauliuss-snbx/90dd4c2e-1692-47f0-8f53-18b3e44e3556/scratchpad/pass2/kvr_zone.json'

# Zones drawn on wide_A2.jpg (E = 582700 + 0.4 x, N = 6061160 - 0.4 y)
px = lambda pts: Polygon([(582700 + 0.4 * x, 6061160 - 0.4 * y) for x, y in pts])
ZONES = {
    # SMC block ("lens" between Vokiečių, the west lane and Rūdninkų), incl. its Rūdninkų frontage
    'smc': px([(445, 452), (560, 486), (645, 527), (700, 585), (712, 620), (650, 662), (560, 702), (470, 742),
               (330, 778), (312, 730), (345, 640), (395, 540)]),
    # South side of Rūdninkų, west of the (surviving) Rūd4 / Did33 block
    'rud_s': px([(330, 782), (470, 748), (560, 712), (612, 692), (640, 760), (650, 860), (560, 900), (420, 950),
                 (300, 950), (290, 860)]),
    # South-west side of Vokiečių (rebuilt set back after the war) down to Ašmenos street
    'vok_sw': px([(440, 450), (392, 540), (345, 632), (250, 628), (140, 600), (95, 520), (110, 420), (160, 330),
                  (200, 250), (235, 225), (300, 290), (380, 380)]),
}
# Add-only zones: plan blocks with nothing standing on them today (the wedge between Vokiečių and
# Mėsinių cleared for the post-war boulevard, and lost houses further up Vokiečių). Modern buildings stay.
gx = lambda pts: Polygon([(582700 + 0.3 * x, 6061180 - 0.3 * y) for x, y in pts])
ADD_ZONES = {
    'wedge': gx([(300, 0), (870, 0), (870, 745), (610, 700), (320, 420), (300, 380)]),
    'vok_nw': gx([(0, 0), (300, 0), (300, 380), (250, 330), (90, 330), (0, 420)]),
}
# The market garden west of Vokiečių (tree drawings, not houses) stays open.
GARDEN = Polygon([(582728, 6060920), (582800, 6060920), (582800, 6060990), (582728, 6060990)])
ZONES['vok_sw'] = ZONES['vok_sw'].difference(GARDEN)
zone_all = unary_union(list(ZONES.values()))
E0, N0, E1, N1 = [round(v) for v in unary_union([zone_all] + list(ADD_ZONES.values())).bounds]
E0 -= 10; N0 -= 10; E1 += 10; N1 += 10
RES = 0.25

# --- 1. Plan building mask -> polygons ---------------------------------------------------------
M = mask1842_geo(A, E0, N0, E1, N1, RES)
def fill_small_holes(p, min_hole=250.0):
    # Courtyards on the plan are large and clean; smaller holes are gaps in light hatching.
    return Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area >= min_hole])
plan = [fill_small_holes(p) for p in vectorize(M, E0, N1, RES, minarea=6.0, simp=0.35) if p.geom_type == 'Polygon']
plan_u = unary_union(plan).buffer(0.8).buffer(-0.8)
plan_u = unary_union([fill_small_holes(p) for p in (plan_u.geoms if plan_u.geom_type == 'MultiPolygon' else [plan_u])])

# --- 2. Modern footprints: survivors vs removed -------------------------------------------------
kvr = json.load(open(KVR))
OLD = re.compile(r'\b(XV|XVI|XVII|XVIII)\s*a|\b1[5-7]\d\d\b|\b17[0-9]\d')
old_pts = []
for k in kvr:
    txt = (k.get('century') or '')
    first = re.split(r'[,;]', txt)[0]  # "statyta ..." comes first
    if OLD.search(first):
        gk = shape(k['geom'])
        old_pts.append(gk if gk.geom_type == 'Point' else gk.representative_point())

grpk = json.load(open(SEED))['features']
removed, kept = [], []
for f in grpk:
    g = shape(f['geometry'])
    if g.is_empty or g.area < 15: continue
    if not zone_all.contains(g.centroid): continue
    if g.intersection(zone_all).area / g.area < 0.85:
        kept.append((f['properties']['TOP_ID'], g)); continue
    cover = g.intersection(plan_u).area / g.area
    has_old = any(g.buffer(1.0).contains(p) for p in old_pts)
    if has_old and cover >= 0.5:
        kept.append((f['properties']['TOP_ID'], g))
    else:
        removed.append((f['properties']['TOP_ID'], g))

kept_u = unary_union([g for _, g in kept]).buffer(0.4) if kept else Polygon()

# --- 3. Plan blocks inside the zones, minus survivors, split into plots -------------------------
def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']

blocks = []
for name, z in ZONES.items():
    for p in polys(plan_u.intersection(z).difference(kept_u).buffer(-0.2).buffer(0.2)):
        if p.area >= 20: blocks.append((name, p))

# Add-only zones: post-war buildings standing mostly on 1842 street or courtyard space go too
add_all = unary_union(list(ADD_ZONES.values()))
done = {i for i, _ in removed} | {i for i, _ in kept}
for f in grpk:
    tid = f['properties']['TOP_ID']
    if tid in done: continue
    g = shape(f['geometry'])
    if g.is_empty or g.area < 15 or not add_all.contains(g.centroid): continue
    cover = g.intersection(plan_u).area / g.area
    has_old = any(g.buffer(1.0).contains(p) for p in old_pts)
    if cover < 0.4 and not has_old:
        removed.append((tid, g))
# Add-only zones: plan minus everything that stands (kept GRPK and the replacement plots above)
removed_ids = {i for i, _ in removed}
standing = []
for f in grpk:
    if f['properties']['TOP_ID'] in removed_ids: continue
    g = shape(f['geometry'])
    if g.is_empty or g.area < 15: continue
    if g.distance(unary_union(list(ADD_ZONES.values()))) > 5: continue
    standing.append(g.buffer(0))
standing_u = unary_union(standing + [p for _, p in blocks]).buffer(0.8)
for name, z in ADD_ZONES.items():
    for p in polys(plan_u.intersection(z).difference(standing_u).buffer(-1.5).buffer(1.5)):
        if p.area >= 30: blocks.append((name, p))

def split_plots(p, spacing=13.0):
    """Voronoi cells of seeds placed just inside the block's street fronts."""
    ext = p.exterior
    L = ext.length
    n = max(1, int(round(L / spacing)))
    inner = p.buffer(-3.0)
    seeds = []
    for i in range(n):
        q = ext.interpolate((i + 0.5) * L / n)
        # push the seed ~3 m inwards
        if not inner.is_empty:
            from shapely.ops import nearest_points
            q2 = nearest_points(inner, q)[0]
            seeds.append(q2)
        else:
            seeds.append(q)
    if len(seeds) < 2: return [p]
    cells = voronoi_diagram(MultiPoint(seeds), envelope=p.buffer(20))
    out = []
    for c in cells.geoms:
        for part in polys(c.intersection(p)):
            if part.area > 4: out.append(part)
    # merge slivers into their largest neighbour
    merged = []
    small = [q for q in out if q.area < 25]
    big = [q for q in out if q.area >= 25]
    for s in small:
        if not big: big.append(s); continue
        j = max(range(len(big)), key=lambda k: big[k].intersection(s.buffer(0.3)).area)
        u = unary_union([big[j], s])
        big[j] = u if u.geom_type == 'Polygon' else max(u.geoms, key=lambda g: g.area)
    return big

def storeys_for(pid, near_square):
    h = int(hashlib.md5(pid.encode()).hexdigest(), 16) % 100
    if near_square: return 3 if h < 55 else 2
    return 3 if h < 25 else 2

TH = Point(582994.6, 6060951.4)
features = []
for bi, (name, p) in enumerate(blocks):
    for pi, plot in enumerate(split_plots(p)):
        pid = f'{name}-{bi}-{pi}'
        plot = plot.simplify(0.25, preserve_topology=True)
        if plot.geom_type != 'Polygon' or plot.area < 12: continue
        features.append({
            'type': 'Feature',
            'properties': {'id': pid, 'kind': 'plot', 'zone': name,
                           'storeys': storeys_for(pid, plot.centroid.distance(TH) < 90),
                           'source': '1842 plan of Vilnius (Polona, public domain), traced; plots split at ~13 m frontage (conjecture)',
                           'grade': 'B-block/C-plot'},
            'geometry': mapping(plot),
        })

json.dump({'type': 'FeatureCollection', 'crs': 'EPSG:3346', 'features': features},
          open(f'{OUT}/walkzone_historic.geojson', 'w'))
json.dump({'note': 'Post-war footprints in the walk-zone change areas, replaced by the 1842 layout',
           'remove': [i for i, _ in removed]}, open(f'{OUT}/walkzone_remove_modern.json', 'w'), indent=1)

# --- 4. Check overlay ---------------------------------------------------------------------------
img = warped_gray1842(A, E0, N0, E1, N1, RES).convert('RGB')
d = ImageDraw.Draw(img, 'RGBA')
P = lambda cs: [((x - E0) / RES, (N1 - y) / RES) for x, y in cs]
for f in grpk:
    g = shape(f['geometry'])
    if g.centroid.distance(zone_all.centroid) > 400: continue
    for q in polys(g): d.line(P(q.exterior.coords), fill=(120, 120, 120, 160), width=1)
for _, g in removed:
    for q in polys(g): d.polygon(P(q.exterior.coords), outline=(230, 0, 0, 255), fill=(230, 0, 0, 50))
for _, g in kept:
    for q in polys(g): d.polygon(P(q.exterior.coords), outline=(0, 170, 0, 255), fill=(0, 170, 0, 60))
for f in features:
    q = shape(f['geometry'])
    d.polygon(P(q.exterior.coords), outline=(0, 60, 255, 255), fill=(0, 90, 255, 60))
    for h in q.interiors: d.line(P(h.coords), fill=(0, 60, 255, 255), width=1)
for z in ZONES.values(): d.line(P(z.exterior.coords), fill=(255, 140, 0, 255), width=2)
for z in ADD_ZONES.values(): d.line(P(z.exterior.coords), fill=(200, 0, 200, 255), width=2)
img.save(f'{OUT}/walkzone_overlay.jpg', quality=88)
print(json.dumps({'plan_polys': len(plan), 'blocks': len(blocks), 'plots': len(features),
                  'removed': len(removed), 'kept': [i for i, _ in kept], 'old_kvr_pts': len(old_pts),
                  'bbox': [E0, N0, E1, N1]}))
