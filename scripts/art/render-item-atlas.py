"""Sproto Racer HUD studio thumbnails. Blender 4.x, no external models/textures.
Render: blender -b -t 4 -P render-item-atlas.py -- ./item-renders
"""
import bpy, math, os, sys
from mathutils import Vector, Quaternion
from math import sin, cos, pi

ORDER=['soda','ball','bubble','slip','box','cursor','speaker','spool','triple','strip',
       'disc','fan','lob','ring','puck','broom','spring','siphon','rocket','comet']
DEST=os.path.abspath(sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'item-renders')
os.makedirs(DEST,exist_ok=True)
SIZE=int(os.environ.get('ITEM_SIZE','192'))
SCENE=bpy.context.scene
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
SCENE.render.engine='CYCLES' 
SCENE.cycles.samples=int(os.environ.get('ITEM_SAMPLES','52'))
SCENE.cycles.use_denoising=False
SCENE.cycles.max_bounces=4
SCENE.cycles.transmission_bounces=3
SCENE.render.resolution_x=SIZE;SCENE.render.resolution_y=SIZE;SCENE.render.resolution_percentage=100
SCENE.render.film_transparent=True
SCENE.render.image_settings.file_format='PNG'
SCENE.render.image_settings.color_mode='RGBA'
SCENE.view_settings.view_transform='AgX'
SCENE.view_settings.look='AgX - Medium High Contrast'
SCENE.view_settings.exposure=.30
SCENE.world.use_nodes=True
SCENE.world.node_tree.nodes.get('Background').inputs[0].default_value=(.38,.47,.62,1)
SCENE.world.node_tree.nodes.get('Background').inputs[1].default_value=.40

def area(name,pos,power,size,color):
    light=bpy.data.lights.new(name,'AREA')
    light.energy=power;light.shape='DISK';light.size=size;light.color=color
    obj=bpy.data.objects.new(name,light);SCENE.collection.objects.link(obj);obj.location=pos
    obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
area('Softbox left',(-3,-4,6),640,4,(1.00,.94,.84))
area('Softbox right',(4,-1,3),380,3,(.73,.89,1.00))
area('Back strip',(0,4,3.8),770,3,(.93,.96,1.00))
area('Eye bounce',(-.3,-5,0),85,3,(.82,.94,1.00))
cam=bpy.data.cameras.new('icon camera');CAM=bpy.data.objects.new('icon camera',cam)
SCENE.collection.objects.link(CAM);SCENE.camera=CAM;cam.type='ORTHO';cam.clip_end=60
MATS={}
INK='#202842'; CHAR='#272535'; TRACK='#3d455b'; STEEL='#b9c9db'; LIGHT='#fdf4d6'
GOLD='#f3a325'; ORANGE='#f8622d'; AQUA='#0dc2c9'; JADE='#37d6a0'; GOLDHI='#ffd063'
PINK='#ef2c74'; MAG='#bc1bcc'; PURPLE='#883bdb'; LIME='#9bd624'; WHITE='#fff9e6'

def rgb(h):
    h=h.lstrip('#');a=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(((v+.055)/1.055)**2.4 if v>.04045 else v/12.92 for v in a)

def mat(h,metal=0,rough=.29,emit=0,glass=0):
    key=(h,metal,rough,emit,glass)
    if key in MATS:return MATS[key]
    m=bpy.data.materials.new(h);m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF'); c=(*rgb(h),1)
    shader.inputs['Base Color'].default_value=c
    shader.inputs['Metallic'].default_value=metal
    shader.inputs['Roughness'].default_value=rough
    shader.inputs['Coat Weight'].default_value=.32 if not glass else .62
    shader.inputs['Coat Roughness'].default_value=.19
    shader.inputs['Transmission Weight'].default_value=glass
    if emit:
        shader.inputs['Emission Color'].default_value=c;shader.inputs['Emission Strength'].default_value=emit
    m.diffuse_color=c;MATS[key]=m;return m

WORK=[]
def obj(o,h,rough=.29,metal=0,emit=0,glass=0,smooth=True):
    o.data.materials.append(mat(h,metal,rough,emit,glass))
    if smooth:
        for f in o.data.polygons:f.use_smooth=True
    WORK.append(o);return o

def bevel(o,amount=.05,segments=3):
    if amount:
        b=o.modifiers.new('rounded seams','BEVEL');b.width=amount;b.segments=segments
        b.affect='EDGES';b.limit_method='ANGLE'
        n=o.modifiers.new('weighted studio normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=40

def quat_from_z(v):return Vector(v).to_track_quat('Z','Y')
def rot(o,orientation):
    if orientation is None:return
    if isinstance(orientation,Quaternion):
        o.rotation_mode='QUATERNION';o.rotation_quaternion=orientation
    else:o.rotation_euler=orientation

def box(loc,size,h,b=.05,ori=None,rough=.29,metal=0,emit=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    rot(o,ori);obj(o,h,rough,metal,emit)
    bevel(o,b);return o

def sphere(loc,scale,h,ori=None,rough=.22,metal=0,emit=0,glass=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=1,location=loc)
    o=bpy.context.object;o.scale=scale;rot(o,ori);return obj(o,h,rough,metal,emit,glass)

def cylinder(loc,r,d,h,axis=(0,0,1),r2=None,verts=40,b=.028,rough=.26,metal=0,emit=0):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=d,location=loc)
    o=bpy.context.object;rot(o,quat_from_z(axis));obj(o,h,rough,metal,emit);bevel(o,b);return o

def torus(loc,r,w,h,axis=(0,0,1),scale=(1,1,1),metal=0,rough=.25,emit=0):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=w,major_segments=64,minor_segments=12,location=loc)
    o=bpy.context.object;o.scale=scale;rot(o,quat_from_z(axis));return obj(o,h,rough,metal,emit)

def line(a,b,r,h,metal=0,r2=None,verts=18):
    delta=Vector(b)-Vector(a)
    return cylinder((Vector(a)+delta*.5),r,delta.length,h,axis=delta,r2=r2,verts=verts,b=r*.22,metal=metal)

def tube(points,r,h,metal=0,rough=.24,emit=0):
    curve=bpy.data.curves.new('form sweep','CURVE');curve.dimensions='3D';curve.resolution_u=18
    curve.bevel_depth=r;curve.bevel_resolution=3;curve.use_fill_caps=True
    sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for bp,co in zip(sp.bezier_points,points):bp.co=co;bp.handle_left_type=bp.handle_right_type='AUTO'
    o=bpy.data.objects.new('form sweep',curve);SCENE.collection.objects.link(o)
    curve.materials.append(mat(h,metal,rough,emit));WORK.append(o);return o

def prism(points,d,h,loc=(0,0,0),ori=None,b=.045,metal=0,rough=.27,emit=0):
    # Points lie in XY, extruded along local Z. Rewind if the polygon points face clockwise.
    if sum(a[0]*v[1]-a[1]*v[0] for a,v in zip(points,points[1:]+points[:1]))<0:points=points[::-1]
    n=len(points);verts=[(x,y,s*d*.5) for s in [-1,1] for x,y in points]
    faces=[list(reversed(range(n))),list(range(n,2*n))]
    for i in range(n):j=(i+1)%n;faces.append([i,j,n+j,n+i])
    me=bpy.data.meshes.new('extruded emblem');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new('extruded emblem',me);SCENE.collection.objects.link(o);o.location=loc;rot(o,ori)
    obj(o,h,rough,metal,emit);bevel(o,b);return o

FRONT=(pi/2,0,0); AXIS_FRONT=(0,-1,0)
BOLT=[(-.14,.39),(.21,.39),(.044,.053),(.248,.053),(-.223,-.475),(-.065,-.086),(-.253,-.086)]
SHIELD=[(0,.42),(.37,.27),(.34,-.065),(.24,-.29),(0,-.45),(-.24,-.29),(-.34,-.065),(-.37,.27)]
def emblem(points,loc,s,h,ori=FRONT,d=.045,depth=.014,metal=0,emit=0):
    prism([(a*s,b*s) for a,b in points],d,h,loc,ori,depth,metal,emit=emit)

def cluster_turn(first,angle,center=(0,0,0)):
    q=Quaternion((0,1,0),angle);p=Vector(center)
    for o in WORK[first:]:
        o.location=p+q@(o.location-p)
        old=o.rotation_quaternion if o.rotation_mode=='QUATERNION' else o.rotation_euler.to_quaternion()
        o.rotation_mode='QUATERNION';o.rotation_quaternion=q@old

def can(x,y,z,s,body,accent):
    def row(at,r,d,h,metal=0,r2=None):return cylinder((x,y,z+at*s),r*s,d*s,h,r2=None if r2 is None else r2*s,b=.02*s,metal=metal)
    row(0,.43,1.12,body,.24)
    row(.585,.415,.095,body,.19,.34)
    row(-.55,.397,.10,body,.21,.437)
    row(.635,.356,.057,STEEL,.75)
    torus((x,y,z+.664*s),.314*s,.023*s,STEEL,metal=.8)
    row(-.610,.373,.062,STEEL,.64)
    torus((x+.025*s,y-.035*s,z+.672*s),.083*s,.020*s,INK,scale=(1,1.53,1),metal=.15)
    row(-.205,.434,.18,accent,.14)
    row(-.313,.434,.032,STEEL,.55)
    sphere((x,y-.407*s,z+.08*s),(.208*s,.050*s,.342*s),accent,rough=.32)
    emblem(BOLT,(x,y-.448*s,z+.11*s),.66*s,WHITE,d=.043*s,depth=.016*s)

def soda():
    n=len(WORK);can(0,0,0,1.13,LIME,'#223c34')
    cluster_turn(n,-.14)

def bumper():
    sphere((0,0,0),(.85,.85,.85),ORANGE,rough=.22)
    axis=(.22,-.03,.975)
    torus((0,0,0),.792,.135,INK,axis=axis,rough=.34)
    torus((0,0,.155),.813,.029,'#ffb93a',axis=axis,metal=.25)
    torus((0,0,-.145),.789,.026,'#a83521',axis=axis)
    for a in [-2.62,-1.56,-.50,.54,1.59,2.64]:
        r=.868
        angle=(sin(a)*.99,cos(a)*.99,-.18*sin(a))
        cylinder((r*angle[0],r*angle[1],r*angle[2]),.087,.048,GOLDHI,axis=angle,verts=6,b=.016,metal=.36)
    cylinder((0,-.648,.48),.252,.06,'#da422b',axis=(0,-.79,.61),verts=6,b=.035)
    cylinder((0,-.685,.498),.167,.046,WHITE,axis=(0,-.79,.61),verts=6,b=.025)

def bubble():
    # Thin luminous shield-facing hardware defines the silhouette, glass keeps the face readable.
    sphere((0,0,0),(.74,.66,.77),'#57dff4',rough=.13,metal=.03,glass=.25)
    torus((0,-.36,0),.643,.057,'#73f6fc',axis=AXIS_FRONT,metal=.23,emit=.18)
    torus((0,0,0),.758,.042,'#3cdfeb',axis=(.46,.49,.73),metal=.19,emit=.16)
    emblem(SHIELD,(0,-.685,0),.73,'#167687',d=.078,depth=.028,metal=.2)
    emblem(SHIELD,(0,-.734,.015),.55,'#c8feff',d=.059,depth=.022,emit=.12)
    box((0,-.773,.03),(.077,.045,.29),'#2487a9',b=.021)
    box((0,-.773,.03),(.29,.045,.077),'#2487a9',b=.021)
    for dx,dz,r in [(-.46,.50,.077),(.47,-.31,.053),(.32,.60,.040)]:
        sphere((dx,-.49,dz),(r,r*.45,r),WHITE,rough=.16,emit=.24)

def slip():
    sphere((0,.02,-.31),(.89,.58,.23),'#682aa8',rough=.19)
    sphere((-.26,.08,-.18),(.605,.54,.293),'#a247cf',rough=.18)
    sphere((.17,.13,.04),(.58,.53,.475),'#bb68e5',rough=.20)
    sphere((.59,.15,-.242),(.29,.43,.25),'#b85be4',rough=.17)
    sphere((.56,.17,.017),(.183,.22,.302),'#b453dc',rough=.19)
    sphere((-.73,.11,-.29),(.235,.246,.11),'#9461db',rough=.21)
    for x,z,h in [(-.17,.062,.115),(.16,.153,.13)]:
        sphere((x,-.391,z),(.072,.084,h),'#4a185f',rough=.185)
        sphere((x-.018,-.461,z+.038),(.022,.023,.030),'#fff8e9',emit=.22)
    tube([(-.120,-.443,-.114),(.006,-.474,-.150),(.111,-.443,-.105)],.024,'#561b6c')
    sphere((.22,-.287,.380),(.155,.024,.045),'#ead4f8',rough=.22,ori=(0,.19,0))

def popup():
    box((0,0,-.263),(1.26,1.00,.81),'#e84b3c',b=.104)
    box((0,0,.010),(1.27,1.01,.166),'#ffe1b1',b=.05)
    box((0,0,.160),(1.275,1.01,.154),INK,b=.06)
    box((0,0,.243),(1.04,.77,.055),'#131324',b=.025)
    for x in [-.548,.548]:
        box((x,-.505,-.194),(.069,.044,.61),'#f78c55',b=.024)
    hinge=(-.04,.295,.683)
    box(hinge,(1.265,.849,.168),'#3b2945',ori=(-.62,0,0),b=.075)
    box((-.04,.305,.781),(1.18,.76,.086),'#7d3448',ori=(-.62,0,0),b=.052)
    pts=[(.230*cos(i*2*pi/24),.232*sin(i*2*pi/24),.25+i*.0057) for i in range(60)]
    tube(pts,.048,GOLDHI,metal=.58)
    sphere((0,-.021,.583),(.199,.196,.102),'#f3b345',metal=.30)
    emblem([(0,.255),(.20,0),(0,-.255),(-.20,0)],(0,-.529,-.271),1.0,'#4f2635',metal=.1)
    
def cursor():
    # The angular pointer silhouette reads even without its ceramic white center.
    arrow=[(-.67,-.56),(.71,.74),(.54,-.596),(.235,-.379),(-.017,-.741),(-.218,-.633),(.022,-.295)]
    prism(arrow,.26,'#8c1851',ori=FRONT,b=.075)
    emblem(arrow,(0,-.139,.013),.929,'#f32579',d=.139,depth=.048,metal=.15)
    prism([(-.437,-.453),(.553,.592),(.329,-.035),(.12,-.246),(-.024,-.222)],.048,'#f9a4c4',(0,-.222,.013),FRONT,b=.020,metal=.03)
    prism([(-.410,-.369),(.339,.411),(.113,-.144),(-.06,-.229)],.034,WHITE,(0,-.249,.012),FRONT,b=.011)
    for x,z in [(-.415,-.27),(.37,-.359)]:
        cylinder((x,-.177,z),.087,.058,'#551d53',axis=AXIS_FRONT,verts=8,b=.010)
        cylinder((x,-.215,z),.051,.046,'#ffc8df',axis=AXIS_FRONT,verts=8,b=.010,emit=.24)

def speaker():
    box((0,0,0),(1.068,.67,1.43),'#292138',b=.14)
    box((0,-.329,0),(.946,.137,1.318),'#4a2d64',b=.095)
    box((0,0,.742),(.713,.362,.085),'#703ab1',b=.031)
    for z,r in [(-.244,.317),(.353,.193)]:
        cylinder((0,-.419,z),r*1.22,.064,'#1f172f',axis=AXIS_FRONT,b=.030)
        torus((0,-.457,z),r*1.023,r*.147,'#b878ed',axis=AXIS_FRONT,metal=.32)
        cylinder((0,-.482,z),r*.86,.104,'#37224c',axis=AXIS_FRONT,r2=r*.61,b=.019)
        torus((0,-.538,z),r*.61,r*.078,'#8157ba',axis=AXIS_FRONT,rough=.29)
        sphere((0,-.545,z),(r*.447,.084,r*.447),'#24172c',rough=.21)
    for x in [-.38,.38]:
        for z in [-.533,.533]:
            cylinder((x,-.412,z),.034,.049,STEEL,axis=AXIS_FRONT,verts=8,b=.006,metal=.63)
    for z in [-.39,-.23,-.07,.09,.25]:
        box((.52,-.121,z),(.043,.21,.038),'#936fc1',b=.015,metal=.15)

def spool():
    axis=(1,0,0)
    cylinder((0,0,.111),.448,.958,'#366f5e',axis=axis,b=.053)
    for i in range(8):
        torus((-.347+i*.092,0,.111),.423,.054,['#48ede8','#37b1bf','#7df4ed'][i%3],axis=axis,metal=.15)
    for x in [-.538,.538]:
        cylinder((x,0,.111),.665,.159,'#293843',axis=axis,verts=16,b=.046,metal=.25)
        cylinder((x*1.12,0,.111),.477,.064,'#70c9b9',axis=axis,b=.039,metal=.24)
        torus((x*1.173,0,.111),.317,.034,CHAR,axis=axis)
        cylinder((x*1.19,0,.111),.169,.077,STEEL,axis=axis,verts=8,b=.022,metal=.71)
    tube([(.084,-.428,.20),(.163,-.57,-.187),(.302,-.656,-.488),(.410,-.697,-.515)],.075,'#55d2ca',metal=.2)
    tube([(.41,-.69,-.464),(.426,-.724,-.656),(.64,-.716,-.827),(.843,-.666,-.750),(.856,-.601,-.569),(.734,-.563,-.509)],.063,GOLDHI,metal=.78)
    sphere((.735,-.563,-.510),(.071,.065,.065),GOLDHI,metal=.60)

def triple():
    for x,y,z,h,a in [(-.421,.14,-.13,'#e5951f',.18),(.394,.217,-.141,'#ffc441',-.12),(-.014,-.219,.180,'#f7b226',0)]:
        n=len(WORK);can(x,y,z,.79,h,'#5c3653')
        cluster_turn(n,a,(x,y,z))

def strip():
    arr=[(-.42,-.19),(0,.125),(.42,-.19),(.30,-.43),(0,-.213),(-.30,-.43)]
    for i in range(4):
        y=(i-1.5)*.43; x=(1.5-i)*.135
        box((x,y,0.07*i),(1.166,.374,.166),'#244558',b=.073,ori=(.04,0,.005))
        box((x,y,.091+.07*i),(.973,.296,.047),'#08767e',b=.025)
        emblem(arr,(x,y+.073,.126+.07*i),.69,'#8ffde1',ori=(0,0,0),d=.044,depth=.014,emit=.30)
        for w in [-.482,.482]:
            box((x+w,y,.114+.07*i),(.066,.20,.046),'#49958d',b=.019,metal=.30)

def disc():
    cylinder((0,0,-.091),.814,.267,INK,b=.056,metal=.12)
    cylinder((0,0,.056),.750,.149,'#35dbe5',r2=.673,b=.040,metal=.30)
    torus((0,0,.143),.636,.044,'#84e9ef',metal=.36)
    cylinder((0,0,.16),.398,.128,'#1ba1b7',r2=.325,b=.040,metal=.20)
    cylinder((0,0,.227),.275,.056,LIGHT,verts=8,b=.028,metal=.19)
    for a in [.6,2.69,4.78]:
        x,y=.774*cos(a),.774*sin(a)
        box((x,y,.078),(.296,.204,.116),GOLD,b=.041,ori=(0,0,a),metal=.30)
        box((x,y,.141),(.231,.092,.032),LIGHT,b=.015,ori=(0,0,a),emit=.21)
    cluster_turn(0,-.11)

def fan():
    for d,h,at in [(-1,'#2ee1dd',(-.497,.01,-.08)),(0,'#ef448f',(0,-.147,.125)),(1,'#f6b542',(.497,.027,-.08))]:
        rot_y=.34*d
        n=len(WORK)
        x,y,z=at
        cylinder((x,y,z),.167,.687,h,verts=8,b=.033,r2=.152,metal=.17)
        cylinder((x,y,z+.462),.153,.366,LIGHT,verts=8,r2=.018,b=.018,metal=.19)
        cylinder((x,y,z-.366),.12,.207,INK,verts=8,r2=.174,b=.03)
        for a in [0,pi/2,pi,1.5*pi]:
            box((x+.146*cos(a),y+.146*sin(a),z-.249),(.124,.08,.204),h,ori=(0,0,a),b=.025)
        cluster_turn(n,rot_y,(x,y,z))

def lob():
    sphere((0,0,-.14),(.699,.642,.657),'#82bf14',rough=.17)
    torus((0,-.02,-.025),.636,.096,'#dae849',axis=(.02,.185,.982),metal=.16)
    sphere((-.165,-.503,-.135),(.250,.117,.202),'#afd631',rough=.17)
    sphere((.198,.057,.204),(.401,.358,.288),'#98d42f',rough=.17)
    cylinder((0,0,.428),.323,.188,'#37374a',r2=.282,b=.043,metal=.15)
    cylinder((0,0,.548),.245,.081,'#9b7bd4',b=.024,metal=.32)
    cylinder((.02,.01,.665),.124,.204,GOLDHI,verts=6,r2=.063,b=.024,metal=.35)
    for x,z in [(-.23,.283),(.268,-.085),(-.36,-.263)]:
        sphere((x,-.508,z),(.066,.032,.066),LIGHT,rough=.13)
    cluster_turn(0,.16)

def return_ring():
    axis=(.103,-.82,.564)
    torus((0,0,0),.665,.162,'#ec9c24',axis=axis,metal=.48)
    torus((0,-.093,.065),.677,.087,'#ffd256',axis=axis,metal=.35)
    torus((0,-.190,.127),.573,.029,'#b56e26',axis=axis,metal=.35)
    q=quat_from_z(axis)
    for i in range(3):
        t=i*2*pi/3+.407;pt=q@Vector((.763*cos(t),.763*sin(t),.044));ori=q@Quaternion((0,0,1),t)
        box(pt,(.256,.223,.264),ORANGE,b=.070,ori=ori,metal=.17)
        box(pt+q@Vector((0,0,.155)),(.138,.166,.037),LIGHT,b=.025,ori=ori,emit=.17)

def static_puck():
    cylinder((0,0,-.185),.787,.348,'#25273d',verts=16,b=.057)
    cylinder((0,0,-.034),.698,.138,'#52288a',verts=16,r2=.630,b=.047,metal=.19)
    cylinder((0,0,.062),.535,.174,'#904bdf',verts=12,r2=.473,b=.044,metal=.26)
    cylinder((0,0,.251),.370,.303,'#b14ae3',verts=5,r2=.091,b=.038,metal=.14)
    cylinder((0,0,.404),.104,.087,'#ffdbfb',verts=5,r2=.075,b=.018,emit=.28)
    for a in [.1,1.67,3.24,4.81]:
        x=.57*cos(a);y=.57*sin(a)
        line((x*.95,y*.95,.022),(x,y,.255),.085,GOLDHI,metal=.45,r2=.038,verts=8)
        box((x*1.18,y*1.18,-.107),(.137,.12,.059),'#e9b8fe',b=.021,ori=(0,0,a),emit=.27)

def broom():
    sphere((0,0,.061),(.669,.562,.446),'#3fcfac',rough=.20,metal=.15)
    cylinder((0,0,.235),.511,.117,'#246451',r2=.448,b=.046,metal=.24)
    torus((0,0,.297),.390,.032,'#adfde0',metal=.22,emit=.16)
    box((0,-.503,.102),(.947,.187,.292),'#243750',b=.126)
    for x in [-.217,.217]:
        box((x,-.605,.116),(.213,.048,.097),'#d9ffcc',b=.045,emit=.22)
    for x in [-.58,0,.58]:
        cylinder((x,-.187,-.330),.234,.178,'#b57730',r2=.179,verts=16,b=.024)
        for a in range(12):
            t=a*pi/6
            line((x+.13*cos(t),-.187+.13*sin(t),-.316),(x+.30*cos(t),-.187+.264*sin(t),-.505),.050,GOLDHI,r2=.032,verts=10)
        cylinder((x,-.187,-.456),.189,.107,GOLD,verts=14,b=.024)
    tube([(-.21,.23,.259),(-.22,.19,.489),(0,.175,.566),(.22,.19,.489),(.21,.26,.259)],.057,INK)

def spring():
    # Pair of shoes, each boot distinct from the large exposed working coil below.
    for x,y,z,a in [(-.38,.154,-.073,.13),(.376,-.107,.06,-.12)]:
        n=len(WORK)
        box((x,y,z-.45),(.632,.832,.114),'#29405a',b=.119)
        box((x,y,z-.374),(.665,.858,.093),'#ff8c4e',b=.096)
        pts=[(x+.189*cos(i*2*pi/22),y+.190*sin(i*2*pi/22),z-.365+i*.010) for i in range(48)]
        tube(pts,.046,GOLDHI,metal=.54)
        box((x,y-.013,z+.061),(.604,.804,.119),'#303956',b=.112)
        sphere((x,y-.167,z+.209),(.29,.324,.193),'#fe804a',rough=.22)
        sphere((x,y+.128,z+.270),(.253,.227,.285),'#ee6432',rough=.20)
        torus((x,y+.118,z+.498),.178,.047,'#fbe5af',scale=(1,1.06,1))
        sphere((x,y+.127,z+.480),(.151,.132,.05),'#4a2d32')
        for j in range(2):
            box((x,y-.15+j*.106,z+.362),(.29,.061,.047),WHITE,b=.020,ori=(.05,0,.027))
        cluster_turn(n,a,(x,y,z))

def siphon():
    # Turbine canister with a single broad intake and a visible side reservoir.
    axis=(.24,-.97,.10)
    q=quat_from_z(axis)
    def orient(p):return q@Vector(p)
    cylinder(orient((0,0,-.14)),.404,1.297,'#167d8c',axis=axis,r2=.335,b=.052,metal=.28)
    torus(orient((0,0,-.77)),.358,.081,CHAR,axis=axis,rough=.30)
    cylinder(orient((0,0,.099)),.438,.232,'#3ac7c7',axis=axis,b=.052,metal=.44)
    cylinder(orient((0,0,.426)),.442,.392,'#426eab',axis=axis,r2=.626,b=.064,metal=.36)
    torus(orient((0,0,.613)),.552,.074,'#61e6ed',axis=axis,metal=.24,emit=.11)
    cylinder(orient((0,0,.588)),.468,.044,'#2a2851',axis=axis,b=.020)
    cylinder(orient((0,0,.622)),.290,.053,'#3ca5b7',axis=axis,b=.022,metal=.23)
    for a in range(5):
        t=a*2*pi/5
        p=orient((.277*cos(t),.277*sin(t),.642))
        box(p,(.230,.073,.058),'#8df8f5',ori=q@Quaternion((0,0,1),t+.16),b=.023,emit=.22)
    tube([orient((.35,0,-.59)),orient((.54,0,-.48)),orient((.562,.032,-.18)),orient((.39,.031,.08))],.063,'#7ce4db',metal=.16)
    sphere(orient((.36,0,-.273)),(.181,.181,.211),'#55e5d1',rough=.18)

def rocket():
    cylinder((0,0,-.077),.291,.891,'#303955',r2=.351,b=.043,metal=.28)
    cylinder((0,0,.331),.350,.128,'#ffe5c4',r2=.336,b=.019,metal=.28)
    cylinder((0,0,.622),.338,.473,'#fa4d42',r2=.031,b=.034,metal=.15)
    torus((0,0,.198),.329,.030,'#ff8671',metal=.25)
    for i in range(3):
        a=i*2*pi/3
        q=Quaternion((0,0,1),a)
        p=q@Vector((.288,0,-.37))
        prism([(-.046,-.202),(.256,-.169),(.307,.015),(.145,.260),(-.059,.278)],.139,'#dd3839',p,q@Quaternion((1,0,0),pi/2),b=.044,metal=.17)
    cylinder((0,0,-.621),.282,.251,'#6f6882',r2=.222,b=.033,metal=.56)
    torus((0,0,-.746),.201,.051,'#ffba65',metal=.31,emit=.30)
    cylinder((0,0,-.761),.118,.048,'#fb6743',b=.017,emit=.41)
    emblem(BOLT,(0,-.330,.043),.44,WHITE,d=.035,depth=.013)
    cluster_turn(0,.56)

def comet():
    sphere((-.224,-.041,.173),(.613,.579,.615),'#ffba26',rough=.175,metal=.17)
    sphere((-.355,-.297,.427),(.324,.143,.158),'#ffd764',rough=.19,emit=.14)
    torus((-.224,-.041,.173),.618,.057,'#fff0a2',axis=(.25,.39,.886),metal=.25,emit=.10)
    for pts,w,h in [
        ([(-.102,.109,.078),(.281,.139,-.181),(.687,.132,-.457),(.846,.076,-.588)],.249,'#e9582a'),
        ([(-.104,.087,.18),(.313,-.083,-.225),(.687,-.122,-.257),(.853,-.095,-.340)],.163,'#ff8142'),
        ([(-.091,-.03,-.148),(.202,-.170,-.353),(.478,-.218,-.612),(.707,-.266,-.725)],.139,'#ff9448')]:
        for i in range(len(pts)-1):line(pts[i],pts[i+1],w*(1-i/(len(pts)-1)),h,r2=w*(1-(i+1)/(len(pts)-1))+.013,verts=22)
    for x,z,s in [(-.469,.339,.104),(-.021,-.106,.085),(-.304,-.302,.063)]:
        sphere((x,-.548,z),(s,.028,s),LIGHT,rough=.18,emit=.16)

BUILDERS=[soda,bumper,bubble,slip,popup,cursor,speaker,spool,triple,strip,disc,fan,lob,return_ring,static_puck,broom,spring,siphon,rocket,comet]
def render(name,index):
    # Orthographic per-icon bounds do not allow neighboring sprites to bleed into the HUD.
    aim=Vector((0,0,0)); direction=Vector((3.12,-6.8,4.55)).normalized()
    if name in ['strip','disc','puck']:direction=Vector((2.13,-4.0,5.9)).normalized()
    if name in ['cursor','return_ring']:direction=Vector((1.30,-6.9,3.25)).normalized()
    CAMERA_Q=(-direction).to_track_quat('-Z','Y')
    CAM.rotation_euler=CAMERA_Q.to_euler()
    bmin=[1e9,1e9];bmax=[-1e9,-1e9]
    bpy.context.view_layer.update()
    dep=bpy.context.evaluated_depsgraph_get()
    Q_INV=CAMERA_Q.inverted()
    for o in WORK:
        evaluated=o.evaluated_get(dep)
        mesh=evaluated.to_mesh()
        if mesh is None:continue
        for v in mesh.vertices:
            p=Q_INV@(evaluated.matrix_world@v.co)
            for c in [0,1]:
                bmin[c]=min(bmin[c],p[c]);bmax[c]=max(bmax[c],p[c])
        evaluated.to_mesh_clear()
    off=Vector(((bmin[0]+bmax[0])*.5,(bmin[1]+bmax[1])*.5,0))
    CAM.location=direction*8+CAMERA_Q@off
    cam.ortho_scale=max(bmax[0]-bmin[0],bmax[1]-bmin[1])/.84
    SCENE.render.filepath=os.path.join(DEST,f'{index:02d}-{name}.png')
    bpy.ops.render.render(write_still=True)

for i,(name,build) in enumerate(zip(ORDER,BUILDERS)):
    only=os.environ.get('ITEM_ONLY')
    if only and name not in only.split(','):continue
    build();render(name,i)
    for o in WORK:bpy.data.objects.remove(o,do_unlink=True)
    WORK.clear()
