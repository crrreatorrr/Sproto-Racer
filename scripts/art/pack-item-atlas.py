"""Pack the 20 PNG tiles in a validated 5×4 lossless RGBA WebP atlas.
Usage: python pack-item-atlas.py [render-dir] [game src/items.js] [output]
"""
from pathlib import Path
import sys, re, json, hashlib
from PIL import Image, ImageDraw, ImageFont

DIR=Path(__file__).resolve().parent
renders=Path(sys.argv[1]) if len(sys.argv)>1 else DIR/'item-renders'
source=Path(sys.argv[2]) if len(sys.argv)>2 else DIR.parent.parent/'src/items.js'
dest=Path(sys.argv[3]) if len(sys.argv)>3 else DIR.parent.parent/'src/assets/item-icons.webp'
labels=re.findall(r"\{name:'([^']+)', model:'([^']+)'",source.read_text())
assert len(labels)==20 and len(set(labels))==20
atlas=Image.new('RGBA',(960,768))
colors={'light':'#e8edf3','dark':'#202b3a'}
qa={key:Image.new('RGB',(710,398),color) for key,color in colors.items()}
font=ImageFont.truetype("DejaVuSans.ttf",12)
data=[]
for i,(label,key) in enumerate(labels):
    path=renders/f'{i:02d}-{key}.png'
    if not path.is_file():raise FileNotFoundError(path)
    img=Image.open(path).convert('RGBA')
    if img.size!=(192,192):img=img.resize((192,192),Image.Resampling.LANCZOS)
    alpha=img.getchannel('A')
    source_bbox=alpha.point(lambda a:255 if a>20 else 0).getbbox()
    assert source_bbox and min(source_bbox[0],source_bbox[1],192-source_bbox[2],192-source_bbox[3])>=4, f'{label}: clipped Blender output {source_bbox}'
    # Center the actual silhouette rather than the extended perspective bounding box.
    img=img.crop((source_bbox[0]-3,source_bbox[1]-3,source_bbox[2]+3,source_bbox[3]+3))
    img.thumbnail((163,163),Image.Resampling.LANCZOS)
    if max(img.size)<155:
        scale=162/max(img.size)
        img=img.resize(tuple(round(v*scale) for v in img.size),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(192,192))
    canvas.paste(img,((192-img.width)//2,(192-img.height)//2))
    img=canvas
    alpha=img.getchannel('A')
    bbox=alpha.point(lambda a:255 if a>20 else 0).getbbox()
    assert bbox and min(bbox[0],bbox[1],192-bbox[2],192-bbox[3])>=10, f'{label}: no usable cell padding {bbox}'
    assert max(bbox[2]-bbox[0],bbox[3]-bbox[1])>=145, f'{label}: tiny object {bbox}'
    assert alpha.getextrema()==(0,255), f'{label}: missing transparent or opaque area'
    x,y=i%5*192,i//5*192
    atlas.paste(img,(x,y))
    tile=img.resize((42,42),Image.Resampling.LANCZOS)
    for theme,preview in qa.items():
        x2, y2=i%5*142,i//5*99
        preview.paste(tile,(x2+50,y2+12),tile)
        ImageDraw.Draw(preview).text((x2+71,y2+78),label,font=font,anchor='mm',fill='#16253d' if theme=='light' else '#eaf2ff')
    data.append({'index':i,'name':label,'key':key,'bounds':bbox})
atlas.save(dest,'WEBP',lossless=True,quality=100,method=6,exact=True)
round_trip=Image.open(dest).convert('RGBA')
assert hashlib.sha256(round_trip.tobytes()).digest()==hashlib.sha256(atlas.tobytes()).digest(), 'RGBA changed during lossless write'
for theme,preview in qa.items():preview.save(DIR/f'qa-42px-{theme}.png')
(DIR/'atlas-verification.json').write_text(json.dumps({'size':atlas.size,'items':data},indent=2)+'\n')
print(f'{dest}: {atlas.width}×{atlas.height}, {len(data)} distinct ordered cells, exact lossless RGBA, {dest.stat().st_size} bytes')
