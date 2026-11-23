# Rebuild ../index.html from the sources:  python3 src/build.py
import os, hashlib, re
d = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(d, 'app.src.html')).read()
s = s.replace('/*__CORE__*/', open(os.path.join(d, 'words.js')).read() + '\n' + open(os.path.join(d, 'core.js')).read()).replace('/*__UBDATA__*/', open(os.path.join(d, 'unblock_bank.json')).read())
root = os.path.dirname(d)
ver = hashlib.sha1(s.encode()).hexdigest()[:10]
s = s.replace('/*__VERSION__*/', ver)
open(os.path.join(root, 'index.html'), 'w').write(s)
sw = os.path.join(root, 'sw.js'); t = open(sw).read()
open(sw, 'w').write(re.sub(r"tray-table-[0-9a-f]+", 'tray-table-' + ver, t))
print('built', len(s), 'cache', ver)
