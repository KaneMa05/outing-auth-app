"""Select an installed, available iPhone simulator; never download a new runtime."""
import json
import re
import sys


def select_device(inventory):
    choices = []
    for runtime, devices in inventory.get("devices", {}).items():
        match = re.fullmatch(r"com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?", runtime)
        if not match:
            continue
        version = tuple(int(part or 0) for part in match.groups())
        if version < (16, 0, 0):
            continue
        for device in devices:
            if not device.get("isAvailable") or not device.get("name", "").startswith("iPhone"):
                continue
            udid = device.get("udid", "")
            if re.fullmatch(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}", udid):
                choices.append((version, device["name"], udid))
    if not choices:
        raise ValueError("No available iPhone simulator on this runner")
    return sorted(choices, reverse=True)[0][2]


if __name__ == "__main__":
    print(select_device(json.load(sys.stdin)))
