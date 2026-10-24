"""Read-only HWP 5 text extraction. Requires olefile==0.47.

HWP records and controls follow Hancom's published HWP 5 format:
https://tech.hancom.com/python-hwp-parsing-2/
Usage: python read-interview-hwp.py INPUT.hwp OUTPUT.json [olefile module directory]
This reads paragraph text, including text in tables; it does not render pages.
"""
import json
import struct
import sys
import zlib
from pathlib import Path

if len(sys.argv) > 3:
    sys.path.insert(0, str(Path(sys.argv[3]).resolve()))
import olefile


def extract(path):
    paragraphs = []
    with olefile.OleFileIO(path) as ole:
        header = ole.openstream("FileHeader").read()
        if not header.startswith(b"HWP Document File"):
            raise ValueError("Not an HWP 5 document")
        flags = struct.unpack_from("<I", header, 36)[0]
        if flags & 6:
            raise ValueError("Encrypted or distribution-only HWP is not supported")
        for stream in sorted(s for s in ole.listdir() if s[0] == "BodyText"):
            raw = ole.openstream(stream).read()
            data = zlib.decompress(raw, -15) if flags & 1 else raw
            pos = 0
            while pos < len(data):
                if pos + 4 > len(data):
                    raise ValueError("Truncated record header")
                value = struct.unpack_from("<I", data, pos)[0]
                pos += 4
                tag, size = value & 1023, value >> 20
                if size == 4095:
                    size = struct.unpack_from("<I", data, pos)[0]
                    pos += 4
                offset = pos
                chunk = data[pos:pos + size]
                if len(chunk) != size:
                    raise ValueError("Truncated record")
                pos += size
                if tag != 67:
                    continue
                units = struct.unpack("<" + "H" * (size // 2), chunk)
                kept, i = [], 0
                while i < len(units):
                    code = units[i]
                    if code < 32:
                        if code in (9, 10, 13, 30, 31):
                            kept.append(32)
                        # Inline/extended controls occupy 8 UTF-16 code units.
                        i += 8 if code in (1,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,21,22,23) else 1
                    else:
                        kept.append(code)
                        i += 1
                text = struct.pack("<" + "H" * len(kept), *kept).decode("utf-16le").strip()
                if text:
                    paragraphs.append(dict(stream="/".join(stream), offset=offset, text=text))
    return paragraphs


if __name__ == "__main__":
    result = extract(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Extracted {len(result)} text paragraphs.")
