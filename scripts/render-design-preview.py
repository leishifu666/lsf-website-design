"""Render the fixed J-mode HTML guide from curated DESIGN.md examples."""

import argparse
from html import escape
import json
from pathlib import Path
import re
from string import Template
from urllib.parse import urlsplit


TEMPLATE = Path(__file__).resolve().parents[1] / "templates" / "design-preview.html"
SECTIONS = (
    ("colors", "配色"),
    ("type", "排版"),
    ("layout", "布局"),
    ("surfaces", "材质与形状"),
    ("motion", "动效与交互"),
    ("voice", "文案"),
    ("components", "组件样例"),
    ("rules", "使用约束"),
)


def text(value):
    return escape(str(value), quote=True)


def color(value):
    if not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", value):
        raise ValueError(f"Expected a hex color, got {value!r}")
    return value


def css_asset(path):
    if not re.fullmatch(r"[A-Za-z0-9._/-]+", path):
        raise ValueError(f"Unexpected CSS asset path: {path!r}")
    return f'url("{path}")'


def url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ("", "http", "https") or value.startswith("//"):
        raise ValueError(f"Unsupported preview URL: {value!r}")
    return text(value)


def link(href, label, new_tab=False):
    attrs = ' target="_blank" rel="noopener"' if new_tab else ""
    return f'<a href="{url(href)}"{attrs}>{text(label)}</a>'


def render_colors(items):
    figures = []
    for item in items:
        value = color(item["value"])
        figures.append(
            f'<figure class="swatch"><span class="swatch-paint" aria-hidden="true" style="--paint:{value}"></span>'
            f'<figcaption><strong>{text(item["label"])}</strong><code>{value}</code></figcaption></figure>'
        )
    return '<div class="swatches">' + "\n".join(figures) + "</div>"


def render_type(items):
    figures = []
    for item in items:
        size, weight, line = float(item["size"]), int(item["weight"]), float(item["line"])
        if not (8 <= size <= 120 and 100 <= weight <= 900 and 0.8 <= line <= 3):
            raise ValueError(f"Unsupported typography example: {item['label']}")
        figures.append(
            f'<figure class="type-sample" style="--type-size:{size:g}px;--type-weight:{weight};--type-line:{line:g}">'
            f'<span class="type-demo">{text(item["sample"])}</span>'
            f'<figcaption><strong>{text(item["label"])}</strong>{text(item["detail"])}</figcaption></figure>'
        )
    return '<div class="type-list">' + "\n".join(figures) + "</div>"


def render_cards(items):
    cards = []
    for item in items:
        value = f'<code>{text(item["value"])}</code>' if item.get("value") else ""
        cards.append(
            f'<article class="data-card"><h3>{text(item["label"])}</h3>'
            f'<p>{text(item["detail"])}</p>{value}</article>'
        )
    return '<div class="cards">' + "\n".join(cards) + "</div>"


def render_demo(section, name):
    target = section["href"]
    actions = [link(target, "独立打开交互样例 ↗", new_tab=True)]
    if section.get("motion_href"):
        actions.append(link(section["motion_href"], "打开动效演示 ↗", new_tab=True))
    return (
        '<div class="demo-bar">' + " ".join(actions) + '</div>'
        f'<iframe class="demo" src="{url(section.get("embed_href", target))}" '
        f'title="{text(name)} 组件交互样例" loading="lazy"></iframe>'
    )


def render(data):
    name = data["name"]
    hero = data["hero"]
    if hero.get("image"):
        background = color(hero["base"]) + " " + css_asset(hero["image"]) + " center / cover"
    else:
        stops = ", ".join(color(paint) for paint in hero["colors"])
        background = f"linear-gradient(132deg, {stops})"
    logo_class = ' class="logo-squircle-inverse"' if hero.get("logo_variant") == "squircle-inverse" else ""
    hero_content = (
        f'<img{logo_class} src="{url(hero["logo"])}" alt="{text(name)} 标志">'
        if hero.get("logo")
        else f'<strong class="identity-demo">{text(hero["sample"])}</strong>'
    )
    font = (
        '@font-face { font-family: "Design Specimen"; src: ' + css_asset(data["font_file"])
        + ' format("woff2"); font-weight: 100 900; font-display: swap; }'
        if data.get("font_file") else ""
    )
    source = data["source"]
    compare = data.get("compare")
    links = [link(source["href"], source["label"], new_tab=True)]
    if compare:
        links.append(link(compare["href"], compare["label"], new_tab=True))

    nav = ['<li><a href="#overview">概览</a></li>']
    sections = []
    entries = data["sections"]
    unknown = entries.keys() - dict(SECTIONS).keys()
    if unknown:
        raise ValueError(f"Unknown sections: {', '.join(sorted(unknown))}")
    for key, label in SECTIONS:
        if key not in entries:
            continue
        section = entries[key]
        if key == "components":
            body = render_demo(section, name)
        else:
            renderer = {"colors": render_colors, "type": render_type}.get(key, render_cards)
            body = renderer(section["items"])
        nav.append(f'<li><a href="#{key}">{label}</a></li>')
        sections.append(
            f'<section class="guide-section" id="{key}" aria-labelledby="{key}-title">\n'
            f'  <div class="section-head"><h2 id="{key}-title">{label}</h2>'
            f'<p>{text(section["description"])}</p></div>\n  {body}\n</section>'
        )
    return Template(TEMPLATE.read_text(encoding="utf-8")).substitute(
        name=text(name), description=text(data["description"]), font_face=font,
        hero_background=background, hero_content=hero_content, hero_label=text(hero["label"]),
        header_links=" ".join(links), navigation="\n".join(nav), sections="\n\n".join(sections),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--check", action="store_true", help="check that the output matches the template and data")
    args = parser.parse_args()
    markup = render(json.loads(args.data.read_text(encoding="utf-8")))
    if args.check:
        if markup != args.output.read_text(encoding="utf-8"):
            parser.exit(1, f"{args.output} needs regeneration.\n")
    else:
        args.output.write_text(markup, encoding="utf-8", newline="\n")
    print(args.output)


if __name__ == "__main__":
    main()
