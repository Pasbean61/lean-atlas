"""Build assets/body.glb from Z-Anatomy (https://github.com/Z-Anatomy/Models-of-human-anatomy, CC BY-SA 4.0).

Run headless:  LA_WORK=./work blender -b --factory-startup --disable-autoexec Z-Anatomy/Startup.blend --python tools/export_model.py
Output: $LA_WORK/out/body.glb (+ export_log.txt)
"""
import bpy, numpy as np, re, json, sys, os
S=os.environ.get('LA_WORK','./work')+'/'
OUT=S+'out/'; os.makedirs(OUT,exist_ok=True)
LOG=[]
def log(*a): LOG.append(" ".join(str(x) for x in a))

GROUPS={
 'upperChest':['Clavicular head of pectoralis major muscle'],
 'midChest':['Sternocostal head of pectoralis major muscle','(Abdominal part of pectoralis major muscle)'],
 'frontDelt':['Clavicular part of deltoid muscle'],
 'sideDelt':['Acromial part of deltoid muscle'],
 'rearDelt':['Scapular spinal part of deltoid muscle'],
 'upperTraps':['Descending part of trapezius muscle'],
 'midBack':['Transverse part of trapezius muscle','Ascending part of trapezius muscle','Rhomboid major muscle','Rhomboid minor muscle'],
 'rotatorCuff':['Infraspinatus muscle','Teres minor muscle','Supraspinatus muscle','Subscapularis muscle'],
 'lats':['Latissimus dorsi muscle','Teres major muscle'],
 'lowerBack':['Iliocostalis lumborum muscle','Longissimus thoracis muscle','Iliocostalis thoracis muscle','Spinalis thoracis muscle','Multifidus lumborum muscle','Quadratus lumborum muscle'],
 'biceps':['Long head of biceps brachii','Short head of biceps brachii','Brachialis muscle','Coracobrachialis muscle'],
 'triceps':['Long head of triceps brachii','Lateral head of triceps brachii','Medial head of triceps brachii','Anconeus muscle'],
 'forearms':['Brachioradialis muscle','Extensor carpi radialis longus','Extensor carpi radialis brevis','Extensor digitorum','Extensor digiti minimi','Humeral head of extensor carpi ulnaris','Ulnar head of extensor carpi ulnaris','Flexor carpi radialis','Palmaris longus muscle','Humeral head of flexor carpi ulnaris','Ulnar head of flexor carpi ulnaris','Humero-ulnar head of flexor digitorum superficialis','Radial head of flexor digitorum superficialis','Flexor digitorum profundus','Flexor pollicis longus','Superficial head of pronator teres','Deep head of pronator teres','Pronator quadratus','Supinator','Abductor pollicis longus','Extensor pollicis brevis','Extensor pollicis longus','Extensor indicis'],
 'abs':['Rectus abdominis muscle','Pyramidalis muscle'],
 'obliques':['External abdominal oblique muscle','Internal abdominal oblique muscle'],
 'serratus':['Serratus anterior muscle'],
 'glutes':['Gluteus maximus muscle'],
 'gluteMed':['Gluteus medius muscle','Gluteus minimus muscle','Tensor fasciae latae'],
 'quads':['Rectus femoris muscle','Vastus lateralis muscle','Vastus medialis muscle','Vastus intermedius muscle'],
 'adductors':['Adductor longus','Adductor brevis','Adductor magnus','(Adductor minimus)','Gracilis muscle','Pectineus muscle'],
 'hamstrings':['Long head of biceps femoris','Short head of biceps femoris','Semitendinosus muscle','Semimembranosus muscle'],
 'calves':['Lateral head of gastrocnemius','Medial head of gastrocnemius','Soleus muscle','Plantaris muscle'],
 'tibialis':['Tibialis anterior muscle','Extensor digitorum longus','Extensor hallucis longus'],
}
# fibre direction overrides in body frame (lateral, anterior, up); otherwise PCA of the belly
FIB={
 'External abdominal oblique muscle':(.7,0,.7),'Internal abdominal oblique muscle':(.7,0,-.7),
 'Gluteus maximus muscle':(.75,0,-.65),
 'Sternocostal head of pectoralis major muscle':(.95,0,.3),'Clavicular head of pectoralis major muscle':(.8,0,-.6),'(Abdominal part of pectoralis major muscle)':(.6,0,.8),
 'Latissimus dorsi muscle':(.6,0,.8),
 'Descending part of trapezius muscle':(.8,0,-.6),'Transverse part of trapezius muscle':(1,0,0),'Ascending part of trapezius muscle':(.6,0,.8),
 'Serratus anterior muscle':(0,.85,-.45),'Rhomboid major muscle':(.7,0,-.7),'Rhomboid minor muscle':(.7,0,-.7),
 'Infraspinatus muscle':(.95,0,.2),'Supraspinatus muscle':(1,0,0),'Teres major muscle':(.8,0,.6),'Teres minor muscle':(.85,0,.5),
 'Gluteus medius muscle':(.35,0,-.94),
}
TEND_MATS={'Tendon','Ligament','Fascia'}
SKIP_MATS={'Fascia','Bursa','Articular capsule','Text','Diaphragm'}
DEEP=re.compile(r'pharyn|aryten|crico|thyro-|palat|gloss|uvula|salping|constrictor|ocul|palpebrae|^(Inferior|Superior|Lateral|Medial) rectus muscle|^(Inferior|Superior) oblique muscle|staped|tympani|auricular|anal|coccyg|levator ani|pubo|perine|sphincter|spong|cavernos|cremaster|Innermost intercostal|Internal intercostal|Transversus abdominis|Transversus thoracis|Diaphragm|Trochlea|tendinous ring|tarsus|Tendinous arch',re.I)
TENDON_EXTRA=['Iliotibial tract','Palmar aponeurosis','Plantar aponeurosis']
DROP=['Posterior layer of thoracolumbar fascia']

def col_of(o,prefix): return any(c.name.startswith(prefix) for c in o.users_collection)
allmesh=[o for o in bpy.data.objects if o.type=='MESH' and len(o.data.polygons)>0]
musc=[o for o in allmesh if col_of(o,'4:')]
skel=[o for o in allmesh if col_of(o,'1:')]
log('muscle objs',len(musc),'skeleton objs',len(skel),'hidden skel',sum(1 for o in skel if o.hide_viewport or o.hide_render))
for n in ['Rectus abdominis muscle.r','Gluteus maximus muscle.r','Vastus lateralis muscle.l']:
    o=bpy.data.objects[n]; co=np.array([v.co for v in o.data.vertices[:400]]); log('centroid',n,co.mean(0).round(3))
log('eye objs',[o.name for o in allmesh if re.search(r'sclera|cornea|^iris|eyeball',o.name,re.I)][:20])
log('gltf props',[p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties if re.search('color|draco|attr|yup|select|apply|normal|material|tangent',p.identifier)])

def base(n): return re.sub(r'\.(l|r)$','',n)
def side(n): return n[-1] if re.search(r'\.(l|r)$',n) else ''

def read(obj,cap):
    n=len(obj.data.vertices); mod=None
    if cap and n>cap:
        mod=obj.modifiers.new('dec','DECIMATE'); mod.ratio=max(cap/n,0.05)
    use_eval=bool(obj.modifiers)
    if use_eval:
        dg=bpy.context.evaluated_depsgraph_get(); dg.update()
        ev=obj.evaluated_get(dg); me=ev.to_mesh()
    else: me=obj.data
    me.calc_loop_triangles()
    nv=len(me.vertices); nt=len(me.loop_triangles)
    V=np.empty(nv*3,dtype=np.float32); me.vertices.foreach_get('co',V); V=V.reshape(-1,3).astype(np.float64)
    M=np.array(obj.matrix_world); V=V@M[:3,:3].T+M[:3,3]
    T=np.empty(nt*3,dtype=np.int32); me.loop_triangles.foreach_get('vertices',T); T=T.reshape(-1,3)
    MI=np.empty(nt,dtype=np.int32); me.loop_triangles.foreach_get('material_index',MI)
    mats=[s.material.name if s.material else '' for s in obj.material_slots] or ['']
    if use_eval: ev.to_mesh_clear()
    if mod: obj.modifiers.remove(mod)
    return V,T,MI,mats

class Acc:
    def __init__(s): s.V=[];s.T=[];s.C=[];s.F=[];s.n=0
    def add(s,V,T,cls,fib):
        s.V.append(V);s.T.append(T+s.n);s.C.append(cls);s.F.append(np.tile(fib,(len(V),1)));s.n+=len(V)
    def arrays(s): return np.concatenate(s.V),np.concatenate(s.T),np.concatenate(s.C),np.concatenate(s.F)

def pca(V):
    c=V-V.mean(0); w,v=np.linalg.eigh(c.T@c); return v[:,2]

ANT=-1.0   # anterior is -Y in Blender (checked from centroids in the log)
def fibre(name,V,T,cls,sx):
    b=base(name)
    if b in FIB:
        l,a,u=FIB[b]; f=np.array([l*sx,a*ANT,u]); return f/np.linalg.norm(f)
    idx=np.unique(T[cls==0]) if (cls==0).any() else np.arange(len(V))
    if len(idx)<8: idx=np.arange(len(V))
    return pca(V[idx])

# lateral edge of rectus abdominis by height: the oblique aponeuroses (rectus sheath) in front of it are cut away
_rv=np.concatenate([read(bpy.data.objects['Rectus abdominis muscle'+sfx],None)[0] for sfx in ('.l','.r')])
RZ0,RZ1=_rv[:,2].min(),_rv[:,2].max(); RANT=np.sign(_rv[:,1].mean()) or -1.0
_bins=np.clip(((_rv[:,2]-RZ0)/0.01).astype(int),0,None); RPROF=np.zeros(_bins.max()+1)
np.maximum.at(RPROF,_bins,np.abs(_rv[:,0]))
log('rectus z',round(RZ0,3),round(RZ1,3),'anterior sign',RANT,'max half width',RPROF.max().round(3))
def cut_sheath(V,T):
    c=V[T].mean(1); zi=np.clip(((c[:,2]-RZ0)/0.01).astype(int),0,len(RPROF)-1)
    inside=(c[:,2]>RZ0-0.01)&(c[:,2]<RZ1+0.03)&(np.abs(c[:,0])<RPROF[zi]+0.006)&(c[:,1]*RANT>-0.02)
    return ~inside
outs={}   # name -> Acc
stats={}
def put(key,obj,cap,force_cls=None):
    V,T,MI,mats=read(obj,cap)
    if 'abdominal oblique' in obj.name:
        keep=cut_sheath(V,T); log('sheath cut',obj.name,int((~keep).sum()),'of',len(T)); T=T[keep]; MI=MI[keep]
    if len(T)==0: return
    if force_cls is None: cls=np.array([1 if mats[min(i,len(mats)-1)] in TEND_MATS else 0 for i in range(max(MI.max()+1,1))])[MI]
    else: cls=np.full(len(T),force_cls)
    sx=1.0 if V[:,0].mean()>=0 else -1.0
    f=fibre(obj.name,V,T,cls,sx)
    outs.setdefault(key,Acc()).add(V,T,cls,f)
    stats[key]=stats.get(key,0)+len(V)

used=set(); missing=[]
for gid,names in GROUPS.items():
    for b in names:
        found=False
        for sfx in ('.l','.r',''):
            o=bpy.data.objects.get(b+sfx)
            if o and o.type=='MESH' and len(o.data.polygons):
                put(f"m|{gid}|{b}",o,2600); used.add(o.name); found=True
        if not found: missing.append(b)
log('missing',missing)
tend=[];other=[]
for o in musc:
    if o.name in used: continue
    b=base(o.name); m0=o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else ''
    if b in DROP: continue
    if b in TENDON_EXTRA: put('tendons',o,2600,force_cls=1); tend.append(o.name); continue
    if m0 in SKIP_MATS or DEEP.search(b): continue
    if m0 in ('Tendon','Ligament'): put('tendons',o,2200,force_cls=1); tend.append(o.name); continue
    if m0=='Cartilage': continue
    put("other",o,950); other.append(o.name)
log('tendons',len(tend),tend)
log('other',len(other),sorted(set(base(n) for n in other)))
BONE=re.compile(r'^(Bone|Suture)'); nsk=0
for o in skel:
    if o.hide_render: continue
    m0=o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else ''
    if BONE.match(m0): cls=0
    elif m0=='Cartilage': cls=1
    elif m0 in ('Teeth','Dentine','Teeth-roots'): cls=2
    else: continue
    V,T,MI,mats=read(o,max(200,int(len(o.data.vertices)*0.2)))
    if len(T)==0: continue
    outs.setdefault('skeleton',Acc()).add(V,T,np.full(len(T),cls),np.array([0,0,1.0])); nsk+=1; stats['skeleton']=stats.get('skeleton',0)+len(V)
log('skeleton parts',nsk)

# ---- build new scene objects ----
MATN={'m':['belly','tendon'],'other':['belly','tendon'],'tendons':['belly','tendon'],'skeleton':['bone','cartilage','teeth']}
mats={}
def mat(n):
    if n not in mats: mats[n]=bpy.data.materials.new(n)
    return mats[n]
scene=bpy.data.scenes.new('export'); bpy.context.window.scene=scene
new=[]
tot_v=tot_t=0
for key,acc in outs.items():
    V,T,C,F=acc.arrays()
    me=bpy.data.meshes.new(key)
    me.from_pydata(V.tolist(),[],T.tolist())
    kind=key.split('|')[0]
    for n in MATN[kind]: me.materials.append(mat(n))
    me.polygons.foreach_set('material_index',C.astype(np.int32))
    me.polygons.foreach_set('use_smooth',np.ones(len(T),dtype=bool))
    ca=me.color_attributes.new('Col','FLOAT_COLOR','POINT')
    rgba=np.concatenate([F*0.5+0.5,np.ones((len(F),1))],1).astype(np.float32)
    ca.data.foreach_set('color',rgba.ravel())
    me.color_attributes.active_color=ca
    try: me.color_attributes.render_color_index=0
    except Exception as e: log('rci',e)
    me.update()
    ob=bpy.data.objects.new(key,me); scene.collection.objects.link(ob); new.append(ob)
    tot_v+=len(V); tot_t+=len(T)
log('outputs',len(outs),'verts',tot_v,'tris',tot_t)
log('stats',json.dumps(dict(sorted(stats.items(),key=lambda kv:-kv[1])[:14])))
allV=np.concatenate([np.concatenate(a.V) for a in outs.values()])
log('bounds',allV.min(0).round(3),allV.max(0).round(3))
for o in new: o.select_set(True)
bpy.context.view_layer.objects.active=new[0]
open(S+'export_log.txt','w').write("\n".join(LOG))
kw=dict(filepath=OUT+'body.glb',export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_normals=True,export_tangents=False,
        export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_active_vertex_color_when_no_material=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_color_quantization=8,export_draco_generic_quantization=12,
        export_animations=False,export_skins=False,export_morph=False,export_cameras=False,export_lights=False,export_extras=False)
props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kw={k:v for k,v in kw.items() if k in props or k=='filepath'}
r=bpy.ops.export_scene.gltf(**kw)
LOG.append('export '+str(r)+' size '+str(os.path.getsize(OUT+'body.glb')))
open(S+'export_log.txt','w').write("\n".join(LOG))
