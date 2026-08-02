import re
with open(r'reports\errors\2b256fb6-01dd-41dc-b630-6161e88377f3.html', 'r', encoding='utf-8') as f:
    content = f.read()

containers = re.split(r'class="[^"]*Qr7Oae', content)
for c in containers[1:]:
    if 'This is a required question' in c:
        m = re.search(r'class="[^"]*M7eMe[^"]*">([^<]+)</span>', c)
        if m:
            print('Missing Field:', m.group(1))
