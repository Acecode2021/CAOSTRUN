from pathlib import Path
import base64
ROOT = Path(__file__).parent
fonts = []
for family, weight, style, file in [
    ('Barlow Condensed', '800', 'italic', 'barlow-condensed-800-italic.woff2'),
    ('Space Grotesk', '300 700', 'normal', 'space-grotesk-latin.woff2'),
]:
    data = base64.b64encode((ROOT / 'assets' / file).read_bytes()).decode()
    fonts.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{data}) format('woff2')}}")
css = (ROOT / 'src/style.css').read_text().replace('/*__FONTS__*/', '\n'.join(fonts))
js = (ROOT / 'src/game.js').read_text()
html = (ROOT / 'src/index.html').read_text().replace('/*__STYLES__*/', css).replace('/*__SCRIPT__*/', js)
(ROOT / 'index.html').write_text(html)
print(f'Built self-contained index.html ({len(html.encode()):,} bytes)')
