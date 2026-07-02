#!/usr/bin/env python3
"""Process user memes: crop TikTok watermark band and export clean webp files."""

from PIL import Image
import json
import os
import shutil

SRC = "/Users/mialicewu/Downloads/memes"
OUT = "/Users/mialicewu/Projects/y2k-gesture-memes/public/memes/user"

# Manual mapping: source filename prefix -> gesture key
MAPPING = {
    "temp_image_024A57E9": "celebrate",
    "temp_image_02CE325B": "angry",
    "temp_image_0D6A1849": "side_eye",
    "temp_image_15FC296D": "side_eye",
    "temp_image_3359633A": "side_eye",
    "temp_image_594C55A0": "cover_mouth",
    "temp_image_56D36DB9": "surprised",
    "temp_image_65E48FFD": "pointing",
    "temp_image_6A4EF116": "cover_mouth",
    "temp_image_74E0338C": "timeout",
    "temp_image_78F29657": "facepalm",
    "temp_image_86542005": "thinking",
    "temp_image_8D04EF35": "kiss",
    "temp_image_9FD9DC89": "cover_mouth",
    "temp_image_BF7D7D05": "stop",
    "temp_image_A0660B8F": "side_eye",
    "temp_image_A2C85685": "sad",
    "temp_image_94FDC115": "side_eye",
    "temp_image_F11901FE": "tongue_out",
    "temp_image_ABD72F7B": "smile",
    "temp_image_40E17BD0": "cover_mouth",
    "temp_image_88AB0715": "thumbs_up",
    "temp_image_A7A5434C": "peace_sign",
    "temp_image_A2C85685": "sad",
}


def crop_watermark(img: Image.Image) -> Image.Image:
    w, h = img.size
    # TikTok handle sits in bottom ~8-12% of frame
    crop_bottom = max(48, int(h * 0.11))
    cropped = img.crop((0, 0, w, h - crop_bottom))

    # Also trim a thin right strip where logo sometimes sits
    cw, ch = cropped.size
    right_trim = max(0, int(cw * 0.02))
    if right_trim:
        cropped = cropped.crop((0, 0, cw - right_trim, ch))
    return cropped


def main():
    os.makedirs(OUT, exist_ok=True)

    # Clear old processed files
    for name in os.listdir(OUT):
        if name.endswith(".webp"):
            os.remove(os.path.join(OUT, name))

    catalog = {}
    counters = {}

    for fname in sorted(os.listdir(SRC)):
        if not fname.lower().endswith(".webp"):
            continue

        prefix = fname.rsplit(".", 1)[0]
        key = None
        for k in MAPPING:
            if prefix.startswith(k) or k in prefix:
                key = MAPPING[k]
                break
        if not key:
            key = "smile"

        img = Image.open(os.path.join(SRC, fname)).convert("RGB")
        cleaned = crop_watermark(img)

        counters[key] = counters.get(key, 0) + 1
        out_name = f"{key}-{counters[key]}.webp"
        out_path = os.path.join(OUT, out_name)
        cleaned.save(out_path, "WEBP", quality=88, method=6)

        catalog.setdefault(key, {"label": key.replace("_", " ").title(), "kind": "pose", "images": []})
        catalog[key]["images"].append(f"user/{out_name}")

    # Set kinds
    expression_keys = {"smile", "surprised", "angry", "sad", "kiss", "tongue_out", "side_eye"}
    labels = {
        "cover_mouth": "Cover mouth",
        "thumbs_up": "Thumbs up",
        "peace_sign": "Peace sign",
        "wave": "Wave",
        "facepalm": "Facepalm",
        "thinking": "Thinking",
        "pointing": "Pointing",
        "shrug": "Shrug",
        "smile": "Smile",
        "surprised": "Surprised",
        "angry": "Angry",
        "sad": "Sad",
        "kiss": "Kiss face",
        "tongue_out": "Tongue out",
        "side_eye": "Side eye",
        "celebrate": "Celebrate",
        "stop": "Stop hand",
        "timeout": "Timeout",
    }
    for key, entry in catalog.items():
        entry["label"] = labels.get(key, entry["label"])
        entry["kind"] = "expression" if key in expression_keys else "pose"

    with open("/Users/mialicewu/Projects/y2k-gesture-memes/public/memes/memes.json", "w") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")

    print(f"Processed {sum(counters.values())} images into {len(catalog)} categories")


if __name__ == "__main__":
    main()
