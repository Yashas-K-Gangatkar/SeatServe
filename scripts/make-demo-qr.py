# Task 34 — generate the live-demo QR code used by the pitch sheet (and as a printable asset)
import qrcode
from qrcode.constants import ERROR_CORRECT_M

url = 'https://notifetch.in/?qr=GVTHGD4Q6F'
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=12, border=2)
qr.add_data(url)
qr.make(fit=True)
# High-contrast for scan reliability: near-black modules on white
img = qr.make_image(fill_color='#141a21', back_color='#ffffff')
img.save('/home/z/my-project/download/notifetch-demo-qr.png')
print('QR saved:', url)
