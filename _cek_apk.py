import zipfile

z = zipfile.ZipFile(r'release-tmp\MoodA-APK\app-debug.apk')
names = z.namelist()

js_name = [x for x in names if x.endswith('app.js')][0]
html_name = [x for x in names if x.endswith('index.html')][0]
print('lokasi app.js :', js_name)

s = z.read(js_name).decode('utf-8', 'replace')
h = z.read(html_name).decode('utf-8', 'replace')

print('Atas nama label   :', 'r-nama-label' in s)
print('IndexedDB         :', 'mooda-db' in s)
print('Halaman Info      :', 'renderInfoPage' in s)
print('Cash (bukan Tunai):', "kv('Tunai'" not in s)
print('Terima kasih dobel:', s.count("out.push('Terima kasih!')"))
print('tab Info          :', 'data-view="info"' in h)
print('ukuran app.js     :', len(s))
