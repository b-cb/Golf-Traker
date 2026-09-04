#!/usr/bin/env python3
import os
import requests
import re
import math

try:
    from PIL import Image
    import io
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

def calculate_bearing(lat1, lon1, lat2, lon2):
    rad = math.pi / 180.0
    dlon = (lon2 - lon1) * rad
    lat1r = lat1 * rad
    lat2r = lat2 * rad
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360.0) % 360.0

def load_maps_from_game_js():
    game_js_path = os.path.join(os.path.dirname(__file__), '..', 'page', 'game.js')
    if not os.path.exists(game_js_path):
        return []
    with open(game_js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Découpe par trou { par: pour extraire de façon 100% fiable
    raw_holes = content.split('{ par:')
    maps = []
    for chunk in raw_holes[1:]:
        src_m = re.search(r"src:\s*['\"]([^'\"]+)['\"]", chunk)
        bounds_m = re.search(r"bounds:\s*\{\s*topLat:\s*([\d\.]+)\s*,\s*bottomLat:\s*([\d\.]+)\s*,\s*leftLon:\s*([\d\.]+)\s*,\s*rightLon:\s*([\d\.]+)\s*\}", chunk)
        tee_m = re.search(r"tee:\s*\{\s*lat:\s*([\d\.]+)\s*,\s*lon:\s*([\d\.]+)\s*\}", chunk)
        flag_m = re.search(r"flag:\s*\{\s*lat:\s*([\d\.]+)\s*,\s*lon:\s*([\d\.]+)\s*\}", chunk)

        if src_m and bounds_m:
            item = {
                "src": src_m.group(1),
                "bounds": {
                    "topLat": float(bounds_m.group(1)),
                    "bottomLat": float(bounds_m.group(2)),
                    "leftLon": float(bounds_m.group(3)),
                    "rightLon": float(bounds_m.group(4))
                },
                "tee": {"lat": float(tee_m.group(1)), "lon": float(tee_m.group(2))} if tee_m else None,
                "flag": {"lat": float(flag_m.group(1)), "lon": float(flag_m.group(2))} if flag_m else None
            }
            maps.append(item)
    return maps

# Résolution cible : moitié droite de l'écran Zepp OS T-Rex 2 (225x454)
WIDTH = 225
HEIGHT = 454

def fetch_ign_map(item, output_path):
    bounds = item['bounds']
    tee = item.get('tee')
    flag = item.get('flag')

    # Si Tee et Flag sont définis, on calcule l'angle de cap
    bearing = 0.0
    if tee and flag:
        bearing = calculate_bearing(tee['lat'], tee['lon'], flag['lat'], flag['lon'])
        print(f"  -> Cap Tee -> Flag : {bearing:.1f}°")

    # ── Calcul de la taille source nécessaire pour éviter le clipping ──────────
    # Après une rotation de θ°, le rectangle W×H occupe une boîte de :
    #   W_bbox = W|cos θ| + H|sin θ|
    #   H_bbox = W|sin θ| + H|cos θ|
    # On doit donc télécharger une image de taille W_src × H_src AVANT rotation,
    # en gardant le même centre géographique mais avec des bounds élargis.
    rad = math.radians(bearing)
    abs_cos = abs(math.cos(rad))
    abs_sin = abs(math.sin(rad))
    W_src = int(math.ceil(WIDTH * abs_cos + HEIGHT * abs_sin))
    H_src = int(math.ceil(WIDTH * abs_sin + HEIGHT * abs_cos))

    # Calcul du centre géographique des bounds
    center_lat = (bounds['topLat'] + bounds['bottomLat']) / 2.0
    center_lon = (bounds['leftLon'] + bounds['rightLon']) / 2.0

    # Demi-étendue géographique originale par pixel
    lat_range = bounds['topLat'] - bounds['bottomLat']
    lon_range = bounds['rightLon'] - bounds['leftLon']
    lat_per_px = lat_range / HEIGHT
    lon_per_px = lon_range / WIDTH

    # Bounds élargis centrés sur le même point
    half_lat = lat_per_px * H_src / 2.0
    half_lon = lon_per_px * W_src / 2.0
    bbox_top    = center_lat + half_lat
    bbox_bottom = center_lat - half_lat
    bbox_left   = center_lon - half_lon
    bbox_right  = center_lon + half_lon

    bbox = f"{bbox_bottom},{bbox_left},{bbox_top},{bbox_right}"

    url = (
        "https://data.geopf.fr/wms-r/wms?"
        "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
        f"&BBOX={bbox}"
        "&CRS=EPSG:4326"
        f"&WIDTH={W_src}&HEIGHT={H_src}"
        "&LAYERS=HR.ORTHOIMAGERY.ORTHOPHOTOS"
        "&STYLES="
        "&FORMAT=image/png"
    )

    print(f"Téléchargement : {os.path.basename(output_path)} "
          f"(source {W_src}x{H_src} → cible {WIDTH}x{HEIGHT})...")
    response = requests.get(url)

    if response.status_code == 200:
        if bearing > 0 and HAS_PIL:
            img = Image.open(io.BytesIO(response.content))
            # Rotation ANTI-HORAIRE de bearing° : drapeau vers le HAUT
            # expand=False conserve W_src x H_src, les coins sont remplis en noir
            # mais le centre (la zone qui nous intéresse) reste intact
            rotated = img.rotate(bearing, resample=Image.BICUBIC, expand=False)
            # Recadrage du centre exact à WIDTH x HEIGHT
            rx, ry = rotated.size
            left   = (rx - WIDTH)  // 2
            top    = (ry - HEIGHT) // 2
            cropped = rotated.crop((left, top, left + WIDTH, top + HEIGHT))
            cropped.save(output_path, format="PNG")
            print(f"  -> Pivôté +{bearing:.1f}° (anti-horaire) et recadré à {WIDTH}x{HEIGHT} !")
        else:
            # Pas de rotation : on ré-utilise les bounds d'origine (taille exacte)
            bbox_orig = f"{bounds['bottomLat']},{bounds['leftLon']},{bounds['topLat']},{bounds['rightLon']}"
            url_orig = (
                "https://data.geopf.fr/wms-r/wms?"
                "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
                f"&BBOX={bbox_orig}"
                "&CRS=EPSG:4326"
                f"&WIDTH={WIDTH}&HEIGHT={HEIGHT}"
                "&LAYERS=HR.ORTHOIMAGERY.ORTHOPHOTOS"
                "&STYLES="
                "&FORMAT=image/png"
            )
            r2 = requests.get(url_orig)
            if r2.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(r2.content)
                print("  -> Sauvegardé (sans rotation)")
            else:
                print(f"  -> Échec fallback (Code {r2.status_code})")
    else:
        print(f"  -> Échec (Code {response.status_code})")
        print(response.text)


def main():
    assets_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', '454x454-amazfit-t-rex-2')
    os.makedirs(assets_dir, exist_ok=True)
    
    if not HAS_PIL:
        print("[ATTENTION] La librairie Pillow (PIL) n'est pas installée dans votre venv.")
        print(" -> Pour pivoter automatiquement les cartes avec le drapeau en haut, faites : pip install Pillow\n")

    maps = load_maps_from_game_js()
    print(f"--- Trouvé {len(maps)} cartes configurées dans page/game.js ---")
    
    for item in maps:
        out_path = os.path.join(assets_dir, item['src'])
        fetch_ign_map(item, out_path)
                
    print("Terminé ! Toutes les images ont été téléchargées dans le dossier assets/.")

if __name__ == "__main__":
    main()
