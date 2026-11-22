import hashlib
import pathlib
import zipfile

apk = pathlib.Path(r"release-tmp\MoodA-3.2.0.apk")
data = apk.read_bytes()

print("ukuran        :", len(data))
print("sha256        :", hashlib.sha256(data).hexdigest())

z = zipfile.ZipFile(apk)
names = z.namelist()


def find(suffix):
    return [n for n in names if n.endswith(suffix)]


js = z.read(find("app.js")[0]).decode("utf-8", "replace")
html = z.read(find("index.html")[0]).decode("utf-8", "replace")
manifest = z.read("AndroidManifest.xml")

checks = {
    "app.js: plugin pembaruan": "MoodaUpdater" in js,
    "app.js: versi 3.2.0": "3.2.0" in js,
    "app.js: fungsi cekPembaruan": "cekPembaruan" in js,
    "app.js: banner update": "update-banner" in js,
    "html: kartu Pembaruan aplikasi": "Pembaruan aplikasi" in html,
    "manifest: REQUEST_INSTALL_PACKAGES": "REQUEST_INSTALL_PACKAGES".encode("utf-16-le") in manifest,
    "manifest: provider .apk": "com.mooda.kasir.apk".encode("utf-16-le") in manifest,
    "manifest: MoodaApkProvider": "MoodaApkProvider".encode("utf-16-le") in manifest,
    "dex: kelas MoodaUpdater": any(b"MoodaUpdater" in z.read(n) for n in find(".dex")),
}
for k, v in checks.items():
    print(("OK   " if v else "GAGAL") + "  " + k)