#!/usr/bin/env python3
"""Inspect a local glTF 2.0 or GLB. No third-party packages, fetching or writes to the model."""
import argparse
from collections import Counter
import json
from pathlib import Path
import struct


def read_document(stream, size):
    if stream.read(4) != b"glTF":
        stream.seek(0)
        return json.load(stream), None
    version, declared_size, json_size, kind = struct.unpack("<III4s", stream.read(16))
    if version != 2 or declared_size != size or kind != b"JSON" or json_size > size - 20:
        raise ValueError("Malformed glTF 2.0 GLB header or JSON chunk")
    doc = json.loads(stream.read(json_size))
    while stream.tell() < size:
        length, kind = struct.unpack("<I4s", stream.read(8))
        offset = stream.tell()
        if length > size - offset:
            raise ValueError("GLB chunk extends beyond file")
        if kind == b"BIN\0":
            return doc, (offset, length)
        stream.seek(length, 1)
    return doc, None


def input_times(doc, index, binary, stream):
    accessor = doc["accessors"][index]
    data = {"accessor": index, "count": accessor["count"]}
    if accessor.get("type") != "SCALAR" or accessor.get("componentType") != 5126:
        return {**data, "unavailable": "Animation input must be SCALAR/FLOAT"}
    if accessor.get("min") and accessor.get("max"):
        return {**data, "first": accessor["min"][0], "last": accessor["max"][0], "basis": "accessor.min/max"}
    if not binary or "bufferView" not in accessor or accessor.get("sparse") or not accessor["count"]:
        return {**data, "unavailable": "Missing bounds. External, sparse or absent time buffer is not read"}
    view = doc["bufferViews"][accessor["bufferView"]]
    relative = accessor.get("byteOffset", 0)
    stride = view.get("byteStride", 4)
    last = relative + (accessor["count"] - 1) * stride
    start = view.get("byteOffset", 0)
    if view["buffer"] != 0 or stride < 4 or start < 0 or relative < 0 or last + 4 > view["byteLength"] or start + last + 4 > binary[1]:
        return {**data, "unavailable": "Input lies outside the readable GLB buffer view"}
    def at(offset):
        stream.seek(binary[0] + start + offset)
        return struct.unpack("<f", stream.read(4))[0]
    return {**data, "first": at(relative), "last": at(last), "basis": "first/last GLB scalar input"}


def inspect_model(source):
    with source.open("rb") as stream:
        doc, binary = read_document(stream, source.stat().st_size)
        if doc.get("asset", {}).get("version") != "2.0":
            raise ValueError("Expected glTF asset.version 2.0")
        nodes = doc.get("nodes", [])
        parents = {child: i for i, node in enumerate(nodes) for child in node.get("children", [])}
        timing, animations = {}, []
        for index, clip in enumerate(doc.get("animations", [])):
            inputs = sorted({s["input"] for s in clip["samplers"]})
            for i in inputs:
                if i not in timing:
                    timing[i] = input_times(doc, i, binary, stream)
            known = inputs and all("first" in timing[i] for i in inputs)
            channels = clip["channels"]
            animations.append({
                "index": index, "name": clip.get("name"), "samplers": len(clip["samplers"]), "inputs": inputs,
                "channels": len(channels), "paths": dict(Counter(c["target"]["path"] for c in channels)),
                "targetNodes": sorted({c["target"]["node"] for c in channels if "node" in c["target"]}),
                "firstKeySeconds": min(timing[i]["first"] for i in inputs) if known else None,
                "lastKeySeconds": max(timing[i]["last"] for i in inputs) if known else None,
            })

    meshes = [{"index": i, "name": m.get("name"), "primitives": [
        {"material": p.get("material"), "mode": p.get("mode", 4), "attributes": p["attributes"],
         "targets": p.get("targets", []), "extensions": list(p.get("extensions", {}))} for p in m["primitives"]
    ]} for i, m in enumerate(doc.get("meshes", []))]
    lights = doc.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
    result = {
        "schemaVersion": 1, "sourceFile": source.name, "version": "2.0", "defaultScene": doc.get("scene"),
        "scenes": doc.get("scenes", []), "extensionsUsed": doc.get("extensionsUsed", []),
        "nodes": [{"index": i, "parent": parents.get(i), **{k: n[k] for k in
                   ("name", "children", "mesh", "skin", "camera", "matrix", "translation", "rotation", "scale") if k in n},
                   "light": n.get("extensions", {}).get("KHR_lights_punctual", {}).get("light")} for i, n in enumerate(nodes)],
        "meshes": meshes, "materials": doc.get("materials", []), "textures": doc.get("textures", []),
        "images": [{**img, **({"uri": "data: (embedded in file)"} if img.get("uri", "").startswith("data:") else {})}
                   for img in doc.get("images", [])],
        "skins": doc.get("skins", []), "animations": animations, "timingAccessors": list(timing.values()),
        "cameras": doc.get("cameras", []), "lights": lights,
    }
    result["counts"] = {k: len(result[k]) for k in ("nodes", "meshes", "materials", "textures", "images", "skins", "animations", "cameras", "lights")}
    result["counts"]["primitives"] = sum(len(m["primitives"]) for m in meshes)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path, help="Local .glb or .gltf")
    parser.add_argument("--out", type=Path, help="Write JSON here instead of stdout")
    args = parser.parse_args()
    try:
        if args.out and args.out.resolve() == args.model.resolve():
            raise ValueError("Choose a JSON output path different from the source model")
        result = inspect_model(args.model)
        encoded = json.dumps(result, ensure_ascii=True, indent=2)
        if args.out:
            args.out.write_text(encoded + "\n", encoding="utf-8")
            print(json.dumps(result["counts"]))
        else:
            print(encoded)
    except (ValueError, IndexError, KeyError, TypeError, OSError, struct.error) as error:
        parser.exit(1, f"inspect-gltf: {error}\n")
