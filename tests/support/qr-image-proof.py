"""Decode actual browser PNGs with independent system libzbar; never a JS QR oracle.
Usage: python3 tests/support/qr-image-proof.py IMAGE QUIET_PIXELS EXPECTED_CSS_PIXELS
Missing library/Pillow or an undecodable image is a failure, never a skip.
"""
import ctypes as c
import ctypes.util
import hashlib
import json
import sys
from PIL import Image

path = ctypes.util.find_library('zbar')
if path is None:
    raise RuntimeError('Independent libzbar decoder is required')
lib = c.CDLL(path)
for name in ['zbar_image_scanner_create', 'zbar_image_create']:
    getattr(lib, name).restype = c.c_void_p
for name in ['zbar_image_scanner_destroy', 'zbar_image_destroy']:
    getattr(lib, name).argtypes = [c.c_void_p]
lib.zbar_image_scanner_set_config.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int]
lib.zbar_image_set_format.argtypes = [c.c_void_p, c.c_ulong]
lib.zbar_image_set_size.argtypes = [c.c_void_p, c.c_uint, c.c_uint]
lib.zbar_image_set_data.argtypes = [c.c_void_p, c.c_void_p, c.c_ulong, c.c_void_p]
lib.zbar_scan_image.argtypes = [c.c_void_p, c.c_void_p]
lib.zbar_image_first_symbol.argtypes = [c.c_void_p]
lib.zbar_image_first_symbol.restype = c.c_void_p
lib.zbar_symbol_next.argtypes = [c.c_void_p]
lib.zbar_symbol_next.restype = c.c_void_p
lib.zbar_symbol_get_data.argtypes = [c.c_void_p]
lib.zbar_symbol_get_data.restype = c.c_void_p
lib.zbar_symbol_get_data_length.argtypes = [c.c_void_p]
lib.zbar_symbol_get_data_length.restype = c.c_uint
lib.zbar_symbol_get_type.argtypes = [c.c_void_p]
lib.zbar_version.argtypes = [c.POINTER(c.c_uint), c.POINTER(c.c_uint)]
major, minor = c.c_uint(), c.c_uint()
lib.zbar_version(c.byref(major), c.byref(minor))

image = Image.open(sys.argv[1]).convert('L')
quiet = int(sys.argv[2])
expected = int(sys.argv[3])
# Playwright rounds a fractional CSS clip outward. Its scale='css' PNG can
# include one extra boundary pixel belonging to the surrounding dialog.
# The test separately proves an exactly square SVG and integer module size.
def check_quiet(pixels):
    if quiet < 8 or pixels.width not in [expected, expected+1] or pixels.height not in [expected, expected+1]:
        raise RuntimeError('Screenshot does not match exact CSS QR geometry')
    for box in [(1,1,pixels.width-1,quiet-1),(1,pixels.height-quiet+1,pixels.width-1,pixels.height-1),
                (1,1,quiet-1,pixels.height-1),(pixels.width-quiet+1,1,pixels.width-1,pixels.height-1)]:
        if pixels.crop(box).getextrema() != (255,255):
            raise RuntimeError('Four-module white quiet zone was not preserved')

check_quiet(image)
# Keep the same dimensions but remove a whole module from the left quiet zone.
# The independent checker must reject this near miss for the quiet zone itself.
shift = quiet // 4
near_miss = Image.new('L', image.size, 255)
near_miss.paste(image.crop((shift,0,image.width,image.height)), (0,0))
try:
    check_quiet(near_miss)
except RuntimeError as error:
    if str(error) != 'Four-module white quiet zone was not preserved':
        raise
else:
    raise RuntimeError('Negative control accepted a three-module quiet zone')

def decode(pixels):
    scanner, frame = lib.zbar_image_scanner_create(), lib.zbar_image_create()
    buffer = c.create_string_buffer(pixels.tobytes())
    try:
        lib.zbar_image_scanner_set_config(scanner, 0, 0, 1)
        lib.zbar_image_set_format(frame, int.from_bytes(b'Y800','little'))
        lib.zbar_image_set_size(frame, pixels.width, pixels.height)
        lib.zbar_image_set_data(frame, buffer, pixels.width*pixels.height, None)
        if lib.zbar_scan_image(scanner, frame) != 1:
            raise RuntimeError('Expected exactly one independently decoded QR')
        symbol = lib.zbar_image_first_symbol(frame)
        if not symbol or lib.zbar_symbol_get_type(symbol) != 64 or lib.zbar_symbol_next(symbol):
            raise RuntimeError('Expected one QR symbol')
        return c.string_at(lib.zbar_symbol_get_data(symbol), lib.zbar_symbol_get_data_length(symbol)).decode('ascii')
    finally:
        lib.zbar_image_destroy(frame)
        lib.zbar_image_scanner_destroy(scanner)

texts = [decode(image.rotate(angle)) for angle in [0,90,180,270]]
if len(set(texts)) != 1:
    raise RuntimeError('Rotation changed the decoded bytes')
print(json.dumps({'decoder': f'libzbar {major.value}.{minor.value}', 'url': texts[0],
                  'urlSha256': hashlib.sha256(texts[0].encode()).hexdigest(),
                  'pixels': [image.width,image.height], 'expectedCssPixels': expected, 'quietPixels': quiet, 'captureRoundingPixels': 1, 'rotations': 4, 'missingQuietModuleRejected': True}))
