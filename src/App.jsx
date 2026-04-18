
import { useState, useReducer, useRef, useCallback, useEffect } from "react";

const SB_URL = "https://epydslvgxgucjemzfuxn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVweWRzbHZneGd1Y2plbXpmdXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjE4NjQsImV4cCI6MjA5MTc5Nzg2NH0.0xFvwqwixO1hTBWVIugGmxOObRAaV31CP0MOcBBbDVA";
const WA = "6285745754951";
let tk = null;

const sb = async (p, { method="GET", body, headers:x={} }={}) => {
  const h = { apikey:SB_KEY, "Content-Type":"application/json", Authorization:`Bearer ${tk||SB_KEY}`, ...x };
  const r = await fetch(`${SB_URL}${p}`, { method, headers:h, body:body?JSON.stringify(body):undefined });
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text(); return t ? JSON.parse(t) : null;
};
const login = async (e,p) => { const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:{apikey:SB_KEY,"Content-Type":"application/json"}, body:JSON.stringify({email:e,password:p}) }); if(!r.ok) throw new Error("Login gagal"); const d=await r.json(); tk=d.access_token; return d; };
const logoutAuth = () => { tk=null; };
const H = (x={}) => ({ headers:{ "Prefer":"return=representation", ...x } });

const dbP = () => sb("/rest/v1/products?is_active=eq.true&order=id.asc", H());
const dbO = () => sb("/rest/v1/orders?status=neq.archived&order=id.desc", H());
const dbAO = () => sb("/rest/v1/orders?order=id.desc", H());
const dbCD = () => sb("/rest/v1/closed_dates?order=date.asc", H());
const dbS = () => sb("/rest/v1/settings?order=id.asc", H());
const dbIO = (o) => sb("/rest/v1/orders", { method:"POST", body:o, ...H() });
const dbUO = (id,d) => sb(`/rest/v1/orders?id=eq.${id}`, { method:"PATCH", body:d, ...H() });
const dbXO = (id) => sb(`/rest/v1/orders?id=eq.${id}`, { method:"PATCH", body:{status:"archived"}, ...H() });
const dbIP = (p) => sb("/rest/v1/products", { method:"POST", body:p, ...H() });
const dbUP = (id,p) => sb(`/rest/v1/products?id=eq.${id}`, { method:"PATCH", body:p, ...H() });
const dbDP = (id) => sb(`/rest/v1/products?id=eq.${id}`, { method:"PATCH", body:{is_active:false}, ...H() });
const dbSO = (id,v) => sb(`/rest/v1/products?id=eq.${id}`, { method:"PATCH", body:{is_sold_out:v}, ...H() });
const dbTD = async (ds) => { const e=await sb(`/rest/v1/closed_dates?date=eq.${ds}`,H()); if(e&&e.length>0){await sb(`/rest/v1/closed_dates?date=eq.${ds}`,{method:"DELETE"});return false;}else{await sb("/rest/v1/closed_dates",{method:"POST",body:{date:ds},...H()});return true;} };
const dbUS = async (k,v) => {
  const existing = await sb(`/rest/v1/settings?key=eq.${k}&select=key`, H());
  if (existing && existing.length > 0) return sb(`/rest/v1/settings?key=eq.${k}`, { method:"PATCH", body:{value:v}, ...H() });
  return sb("/rest/v1/settings", { method:"POST", body:{key:k,value:v}, ...H() });
};
const dbGN = () => sb("/rest/v1/rpc/generate_order_number", { method:"POST", body:{} });

const fmt = (n) => "Rp "+n.toLocaleString("id-ID");
const dfmt = (d) => { const D=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"],M=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]; return `${D[d.getDay()]}, ${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`; };
const jp = (v,fb=[]) => { if(!v) return fb; if(typeof v==="string") try{return JSON.parse(v)}catch{return fb;} return v; };

const DAYS = [{key:"monday",label:"Senin"},{key:"tuesday",label:"Selasa"},{key:"wednesday",label:"Rabu"},{key:"thursday",label:"Kamis"},{key:"friday",label:"Jumat"},{key:"saturday",label:"Sabtu"},{key:"sunday",label:"Minggu"}];
const todayKey = () => DAYS[(new Date().getDay()+6)%7].key;
const todayLabel = () => DAYS[(new Date().getDay()+6)%7].label;
const readSchedIds = (v) => { const p=jp(v,null);const r={};DAYS.forEach(d=>{r[d.key]=Array.isArray(p&&p[d.key])?p[d.key].map(Number).filter(x=>!isNaN(x)):[];});return r; };

const parseImages = (v) => { if(!v) return []; if(typeof v!=="string") return []; const t=v.trim(); if(t.startsWith("[")){ try{const a=JSON.parse(t);return Array.isArray(a)?a.filter(x=>typeof x==="string"&&x):[];}catch{return [v];} } return [v]; };
const firstImg = (v) => parseImages(v)[0]||"";
const packImages = (arr) => arr.length<=1?(arr[0]||""):JSON.stringify(arr);

const applyVoucher = (code,list,subtotal) => {
  if(!code||!code.trim()) return {ok:false,err:"",discount:0,voucher:null};
  const v=(list||[]).find(x=>(x.code||"").toUpperCase()===code.trim().toUpperCase());
  if(!v) return {ok:false,err:"Kode voucher tidak ditemukan",discount:0,voucher:null};
  if(v.active===false) return {ok:false,err:"Kode voucher tidak aktif",discount:0,voucher:null};
  if(v.expiresAt){const ex=new Date(v.expiresAt+"T23:59:59");if(new Date()>ex) return {ok:false,err:"Kode voucher sudah kedaluwarsa",discount:0,voucher:null};}
  const minO=Number(v.minOrder)||0;
  if(minO>0&&subtotal<minO) return {ok:false,err:`Minimal order ${fmt(minO)}`,discount:0,voucher:null};
  let discount=v.type==="fixed"?Number(v.value)||0:Math.round(subtotal*(Number(v.value)||0)/100);
  const cap=Number(v.maxDiscount)||0;
  if(v.type==="percentage"&&cap>0) discount=Math.min(discount,cap);
  discount=Math.max(0,Math.min(discount,subtotal));
  return {ok:true,err:"",discount,voucher:v};
};

const Img = ({name,color,img,size="md"}) => {
  const s={sm:"h-16 w-16 rounded-2xl",md:"h-36 w-full rounded-none",lg:"h-52 w-full rounded-none"};
  if(img) return <div className={`${s[size]} overflow-hidden`}><img src={img} alt={name} className="w-full h-full object-cover"/></div>;
  return <div className={`${s[size]} flex items-center justify-center text-white text-xs font-medium`} style={{backgroundColor:color||"#D4A574"}}><span className="opacity-70 px-2 text-center">{name}</span></div>;
};

const cR = (st,a) => {
  switch(a.type){
    case "ADD":{const k=`${a.item.id}-${a.item.size||""}-${a.item.flavor||""}`;const e=st.find(i=>i.key===k);if(e)return st.map(i=>i.key===k?{...i,qty:i.qty+a.item.qty}:i);return[...st,{...a.item,key:k}];}
    case "UPD":return a.qty<=0?st.filter(i=>i.key!==a.key):st.map(i=>i.key===a.key?{...i,qty:a.qty}:i);
    case "DEL":return st.filter(i=>i.key!==a.key);
    case "CLR":return[];
    default:return st;
  }
};

const Badge = ({children,variant="default"}) => {
  const v={default:"bg-amber-700 text-white",best:"bg-orange-500 text-white",rec:"bg-emerald-600 text-white",sw:"bg-yellow-500 text-white",sp:"bg-emerald-600 text-white",sb:"bg-blue-500 text-white",sd:"bg-stone-500 text-white"};
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md ${v[variant]||v.default}`}>{children}</span>;
};
const LB = ({label}) => { if(!label)return null; if(label==="Best Seller")return <Badge variant="best">⭐ Best Seller</Badge>; if(label==="Rekomendasi")return <Badge variant="rec">✓ Rekomendasi</Badge>; return <Badge>{label}</Badge>; };

const Btn = ({children,onClick,variant="primary",full,disabled,className=""}) => {
  const b="font-semibold rounded-2xl transition-all duration-300 text-center active:scale-[0.97]",sz=full?"w-full py-3.5 px-5 text-[15px]":"py-2.5 px-6 text-sm";
  const vr={primary:"bg-amber-800 text-white hover:bg-amber-900 shadow-lg shadow-amber-800/20",secondary:"bg-white/90 text-amber-900 border-2 border-amber-200 hover:bg-amber-50",danger:"bg-red-500 text-white hover:bg-red-600",whatsapp:"bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20",ghost:"text-amber-800 hover:bg-amber-50"};
  return <button onClick={onClick} disabled={disabled} className={`${b} ${sz} ${vr[variant]} ${disabled?"opacity-50 cursor-not-allowed":""} ${className}`}>{children}</button>;
};
const Inp = ({label,required,...p}) => (<div className="mb-4">{label&&<label className="block text-sm font-medium text-stone-600 mb-1.5">{label}{required&&<span className="text-red-400 ml-0.5">*</span>}</label>}<input {...p} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent focus:bg-white transition"/></div>);
const ImgUp = ({value,onChange,label="Foto"}) => { const [drag,setDrag]=useState(false);const ref=useRef();const proc=useCallback(f=>{if(!f||!f.type.startsWith("image/"))return;const r=new FileReader();r.onload=e=>onChange(e.target.result);r.readAsDataURL(f);},[onChange]); return(<div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">{label}</label>{value?(<div className="relative rounded-2xl overflow-hidden"><img src={value} alt="" className="w-full h-44 object-cover"/><button onClick={()=>onChange("")} className="absolute top-3 right-3 bg-black/50 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-black/70">✕</button></div>):(<div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])proc(e.dataTransfer.files[0])}} onPaste={e=>{const it=e.clipboardData?.items;if(it)for(let i=0;i<it.length;i++)if(it[i].type.startsWith("image/")){proc(it[i].getAsFile());break;}}} tabIndex={0} onClick={()=>ref.current?.click()} className={`w-full h-36 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${drag?"border-amber-400 bg-amber-50":"border-stone-200 hover:border-amber-300"}`}><span className="text-3xl mb-2 opacity-40">📷</span><p className="text-xs text-stone-400 text-center px-4">Klik, drag & drop, atau paste</p><input ref={ref} type="file" accept="image/*" className="hidden" onChange={e=>{if(e.target.files[0])proc(e.target.files[0])}}/></div>)}</div>);};

const ImgsUp = ({value,onChange,label="Foto Produk",max=5}) => {
  const imgs=parseImages(value);const [drag,setDrag]=useState(false);const ref=useRef();
  const setImgs=(arr)=>onChange(packImages(arr));
  const add=useCallback((files)=>{const list=Array.from(files||[]).filter(f=>f&&f.type.startsWith("image/"));if(list.length===0)return;const slots=max-imgs.length;if(slots<=0)return;const take=list.slice(0,slots);const reads=take.map(f=>new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(f);}));Promise.all(reads).then(urls=>setImgs([...imgs,...urls]));},[imgs,max,onChange]);
  const remove=(i)=>setImgs(imgs.filter((_,j)=>j!==i));
  const move=(i,dir)=>{const j=i+dir;if(j<0||j>=imgs.length)return;const a=[...imgs];[a[i],a[j]]=[a[j],a[i]];setImgs(a);};
  return(<div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">{label} <span className="text-stone-400 font-normal text-xs">({imgs.length}/{max} — foto pertama jadi utama)</span></label>
    <div className="grid grid-cols-3 gap-2 mb-2">{imgs.map((u,i)=>(<div key={i} className="relative rounded-2xl overflow-hidden aspect-square bg-stone-100 group"><img src={u} alt="" className="w-full h-full object-cover"/>{i===0&&<span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-amber-700 text-white px-1.5 py-0.5 rounded-full shadow">UTAMA</span>}<button onClick={()=>remove(i)} className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/80">✕</button><div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between opacity-0 group-hover:opacity-100 transition">{i>0?<button onClick={()=>move(i,-1)} className="bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-black/80">←</button>:<span/>}{i<imgs.length-1?<button onClick={()=>move(i,1)} className="bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-black/80">→</button>:<span/>}</div></div>))}
      {imgs.length<max&&<div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);add(e.dataTransfer.files);}} onPaste={e=>{const it=e.clipboardData?.items;if(it){const files=[];for(let i=0;i<it.length;i++)if(it[i].type.startsWith("image/"))files.push(it[i].getAsFile());if(files.length)add(files);}}} tabIndex={0} onClick={()=>ref.current?.click()} className={`aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${drag?"border-amber-400 bg-amber-50":"border-stone-200 hover:border-amber-300"}`}><span className="text-2xl opacity-40">📷</span><p className="text-[10px] text-stone-400 text-center px-1 mt-1">Tambah</p><input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={e=>{if(e.target.files)add(e.target.files);}}/></div>}
    </div>
    <p className="text-[11px] text-stone-400">Klik, drag & drop, atau paste. Hover untuk geser urutan.</p>
  </div>);
};

const FCart = ({cart,onClick}) => { const c=cart.reduce((s,i)=>s+i.qty,0);if(c===0)return null; return <button onClick={onClick} className="fixed bottom-20 right-4 z-40 bg-amber-800 text-white rounded-full flex items-center justify-center shadow-xl shadow-amber-900/30 hover:bg-amber-900 transition-all active:scale-90 hover:scale-105" style={{width:56,height:56}}><span className="text-xl">🛒</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-md" style={{width:22,height:22}}>{c}</span></button>; };
const Spin = ({text="Memuat..."}) => (<div className="flex flex-col items-center justify-center py-20 text-stone-400"><div className="w-10 h-10 rounded-full animate-spin mb-4" style={{borderWidth:3,borderStyle:"solid",borderColor:"#E7E0D8",borderTopColor:"#92400E"}}/><p className="text-sm font-medium">{text}</p></div>);
const Skel = () => (<div className="px-5 pb-8"><div className="flex items-center gap-2 mb-4"><div className="w-8 h-[2px] bg-stone-200 rounded-full"/><div className="h-5 w-40 bg-stone-200 rounded-lg animate-pulse"/></div>{[1,2,3].map(i=>(<div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 mb-3 flex"><div className="w-28 h-[100px] bg-stone-200 animate-pulse"/><div className="flex-1 p-4 space-y-2"><div className="h-4 w-24 bg-stone-200 rounded animate-pulse"/><div className="h-3 w-40 bg-stone-100 rounded animate-pulse"/><div className="h-4 w-20 bg-stone-200 rounded animate-pulse"/></div></div>))}</div>);

const Shell = ({title,onBack,children,onHome}) => (<div className="min-h-screen bg-stone-50"><header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-stone-100 px-4 py-3.5 flex items-center gap-3">{onBack&&<button onClick={onBack} className="text-stone-400 hover:text-stone-700 text-lg transition">←</button>}{onHome&&<button onClick={onHome} className="font-bold text-amber-800 text-lg tracking-tight">SJB</button>}{title&&<h1 className="font-bold text-stone-800 text-[15px] truncate">{title}</h1>}</header><main className="pb-28">{children}</main><div className="fixed bottom-4 right-4 z-50"><a href={`https://wa.me/${WA}?text=Halo, saya butuh bantuan`} target="_blank" rel="noreferrer" className="bg-emerald-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 text-xl hover:bg-emerald-600 hover:scale-105 transition-all">💬</a></div></div>);

const dbTrack = (phone) => sb(`/rest/v1/orders?customer_phone=eq.${encodeURIComponent(phone)}&status=neq.archived&order=id.desc`, H());

const StoreInfo = ({settings:st,onBack,onHome}) => {
  const hasInfo = st.store_address||st.store_hours||st.store_payment_info||st.store_minimum_order||st.store_about||st.store_maps_url;
  return(<Shell title="Info Toko" onBack={onBack} onHome={onHome}><div className="px-5 py-5">
    {!hasInfo?<div className="text-center py-16 text-stone-300"><p className="text-4xl mb-3">📝</p><p className="text-stone-400">Info toko belum diisi</p></div>:<>
      {st.store_about&&<div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 mb-4 border border-amber-100"><p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{st.store_about}</p></div>}
      {st.store_address&&<div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-3"><div className="flex items-start gap-3"><span className="text-2xl">📍</span><div className="flex-1"><p className="text-xs text-stone-400 mb-1">Alamat</p><p className="text-sm text-stone-700 whitespace-pre-line">{st.store_address}</p>{st.store_maps_url&&<a href={st.store_maps_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-amber-700 font-semibold underline">🗺️ Buka di Google Maps</a>}</div></div></div>}
      {st.store_hours&&<div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-3"><div className="flex items-start gap-3"><span className="text-2xl">🕐</span><div><p className="text-xs text-stone-400 mb-1">Jam Operasional</p><p className="text-sm text-stone-700 whitespace-pre-line">{st.store_hours}</p></div></div></div>}
      {st.store_payment_info&&<div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-3"><div className="flex items-start gap-3"><span className="text-2xl">💳</span><div><p className="text-xs text-stone-400 mb-1">Pembayaran</p><p className="text-sm text-stone-700 whitespace-pre-line">{st.store_payment_info}</p></div></div></div>}
      {st.store_minimum_order&&<div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-3"><div className="flex items-start gap-3"><span className="text-2xl">📦</span><div><p className="text-xs text-stone-400 mb-1">Minimum Order</p><p className="text-sm text-stone-700 whitespace-pre-line">{st.store_minimum_order}</p></div></div></div>}
    </>}
  </div></Shell>);
};

const FAQ = ({settings:st,onBack,onHome}) => {
  const faqs = jp(st.faq_json,[]);
  const [open,setOpen] = useState(-1);
  return(<Shell title="FAQ" onBack={onBack} onHome={onHome}><div className="px-5 py-5">
    {faqs.length===0?<div className="text-center py-16 text-stone-300"><p className="text-4xl mb-3">❓</p><p className="text-stone-400">Belum ada pertanyaan</p></div>:<div className="space-y-3">{faqs.map((f,i)=>(<div key={i} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden"><button onClick={()=>setOpen(open===i?-1:i)} className="w-full p-4 flex items-center justify-between text-left hover:bg-stone-50 transition"><span className="text-sm font-semibold text-stone-800 flex-1 pr-3">{f.q}</span><span className={`text-stone-400 transition-transform ${open===i?"rotate-180":""}`}>▼</span></button>{open===i&&<div className="px-4 pb-4 pt-0 border-t border-stone-100"><p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line mt-3">{f.a}</p></div>}</div>))}</div>}
  </div></Shell>);
};

const StoreClosed = () => (<div className="min-h-screen bg-stone-50 flex items-center justify-center px-5"><div className="text-center"><div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5"><span className="text-4xl">🔒</span></div><h2 className="text-xl font-bold text-stone-800 mb-2">Toko Sedang Tutup</h2><p className="text-sm text-stone-400 mb-6 max-w-xs mx-auto leading-relaxed">Maaf, saat ini kami belum menerima pesanan. Silakan kembali lagi nanti atau hubungi kami via WhatsApp.</p><a href={`https://wa.me/${WA}?text=Halo, apakah toko sudah buka?`} target="_blank" rel="noreferrer"><Btn variant="whatsapp">💬 Hubungi Kami</Btn></a></div></div>);

const Tracking = ({onBack,onHome}) => {
  const [phone,setPhone]=useState("");const [orders,setOrders]=useState(null);const [loading,setLoading]=useState(false);const [err,setErr]=useState("");const [cancelling,setCancelling]=useState("");
  const statusInfo={waiting:{label:"Menunggu Verifikasi",color:"bg-yellow-100 text-yellow-800 border-yellow-200",icon:"⏳",desc:"Pesanan diterima, menunggu konfirmasi pembayaran",step:1},paid:{label:"Pembayaran Dikonfirmasi",color:"bg-emerald-100 text-emerald-800 border-emerald-200",icon:"✅",desc:"Pembayaran sudah dikonfirmasi, pesanan akan segera diproses",step:2},process:{label:"Sedang Diproses",color:"bg-blue-100 text-blue-800 border-blue-200",icon:"👨‍🍳",desc:"Pesanan kamu sedang dibuat dengan penuh cinta",step:3},done:{label:"Selesai",color:"bg-stone-100 text-stone-600 border-stone-200",icon:"🎉",desc:"Pesanan siap diambil! Terima kasih sudah order",step:4}};
  const steps=["Verifikasi","Lunas","Diproses","Selesai"];
  const search=async()=>{if(!phone.trim()){setErr("Masukkan nomor HP");return;}setErr("");setLoading(true);try{const r=await dbTrack(phone.trim());setOrders(r||[]);}catch{setErr("Gagal memuat data. Coba lagi.");}setLoading(false);};

  const doCancel=async(o)=>{
    if(!confirm(`Yakin ingin membatalkan pesanan ${o.order_number}?`))return;
    setCancelling(o.order_number);
    try{
      await dbXO(o.id);
      const msg=`Halo admin,%0A%0ASaya ingin membatalkan pesanan:%0ANo Order: ${o.order_number}%0ANama: ${o.customer_name}%0A%0AMohon diproses. Terima kasih.`;
      window.open(`https://wa.me/${WA}?text=${msg}`,"_blank");
      const r=await dbTrack(phone.trim());
      setOrders(r||[]);
    }catch{alert("Gagal cancel. Coba lagi.");}
    setCancelling("");
  };

  return(<Shell title="Cek Pesanan" onBack={onBack} onHome={onHome}><div className="px-5 py-5">
    <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 mb-5"><div className="text-center mb-4"><span className="text-4xl">📦</span><h2 className="text-lg font-bold text-stone-800 mt-2">Cek Status Pesanan</h2><p className="text-xs text-stone-400 mt-1">Masukkan nomor HP yang digunakan saat order</p></div><div className="flex gap-2"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="08xxxxxxxxxx" type="tel" className="flex-1 border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><Btn onClick={search} disabled={loading}>{loading?"...":"Cari"}</Btn></div>{err&&<p className="text-red-500 text-sm mt-2">⚠️ {err}</p>}</div>
    {orders!==null&&orders.length===0&&<div className="text-center py-12 text-stone-300"><p className="text-4xl mb-3">🔍</p><p className="text-stone-400 font-medium">Tidak ada pesanan ditemukan</p><p className="text-xs text-stone-400 mt-1">Pastikan nomor HP sudah benar</p></div>}
    {orders&&orders.length>0&&<div className="space-y-4">{orders.map(o=>{const si=statusInfo[o.status]||statusInfo.waiting;const pd=new Date(o.pickup_date+"T00:00:00");
      return(<div key={o.id} className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
        <div className="flex items-center justify-between mb-4"><div><p className="text-[11px] text-stone-400">No. Order</p><p className="font-bold text-amber-800">{o.order_number}</p></div><span className={`text-xs font-semibold px-3 py-1 rounded-full border ${si.color}`}>{si.icon} {si.label}</span></div>
        <div className="flex items-center justify-between mb-5 px-2">{steps.map((s,i)=>(<div key={i} className="flex flex-col items-center flex-1"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${i+1<=si.step?"bg-amber-800 text-white":"bg-stone-200 text-stone-400"}`}>{i+1<=si.step?"✓":i+1}</div><p className={`text-[9px] text-center ${i+1<=si.step?"text-amber-800 font-semibold":"text-stone-400"}`}>{s}</p></div>))}</div>
        <div className="bg-stone-50 rounded-2xl p-4 mb-3"><p className="text-sm text-stone-600 mb-2">{si.desc}</p><div className="text-xs text-stone-400 space-y-1"><p>📝 Tanggal order: {o.order_date}</p><p>📅 Tanggal ambil: {dfmt(pd)}</p><p>💰 Total: <span className="font-bold text-amber-800">{fmt(o.total)}</span></p></div></div>
        <div className="text-xs text-stone-400 mb-3">{(o.items||[]).map((it,i)=><p key={i}>• {it.name} ×{it.qty}{it.size?` (${it.size})`:"" }{it.flavor?` — ${it.flavor}`:""}</p>)}</div>
        {o.status==="waiting"&&<button onClick={()=>doCancel(o)} disabled={cancelling===o.order_number} className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-2xl text-sm font-semibold hover:bg-red-100 transition disabled:opacity-50">{cancelling===o.order_number?"Membatalkan...":"❌ Batalkan Pesanan"}</button>}
        {["paid","process"].includes(o.status)&&<a href={`https://wa.me/${WA}?text=Halo admin, saya ingin edit/batalkan pesanan ${o.order_number}`} target="_blank" rel="noreferrer" className="block text-center w-full py-3 bg-stone-50 text-stone-600 border border-stone-200 rounded-2xl text-sm font-semibold hover:bg-stone-100 transition">💬 Hubungi Admin via WhatsApp</a>}
      </div>);})}</div>}
  </div></Shell>);
};

const PriceDisplay = ({price,discount,soldOut}) => {
  const disc = discount||0;
  const dp = disc>0?Math.round(price*(1-disc/100)):price;
  return (<div className="flex items-center gap-2">{disc>0&&!soldOut&&<span className="text-[10px] text-stone-400 line-through">{fmt(price)}</span>}<span className={`font-bold text-sm ${soldOut?"text-stone-400 line-through":"text-amber-800"}`}>{disc>0&&!soldOut?fmt(dp):fmt(price)}</span>{disc>0&&!soldOut&&<span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">-{disc}%</span>}</div>);
};

/* ── CUSTOMER ── */

const Home = ({products,onCat,onProd,cart,onCart,heroBg,loading,onTrack,onInfo,onFAQ,schedIds}) => {
  const todayIds=(schedIds&&schedIds[todayKey()])||[];
  const isScheduled=todayIds.length>0;
  const visible=products.filter(p=>!isScheduled||p.category==="special"||p.category==="savory"||todayIds.includes(p.id));
  const bs=visible.filter(p=>p.label==="Best Seller").slice(0,3);
  const todayProds=products.filter(p=>(p.category==="classic"||p.category==="harian")&&todayIds.includes(p.id));
  const hs=heroBg?{backgroundImage:`linear-gradient(to bottom,rgba(62,39,18,0.55),rgba(62,39,18,0.75)),url(${heroBg})`,backgroundSize:"cover",backgroundPosition:"center"}:{};
  return(<Shell>
    <div className={`text-white px-6 pt-14 pb-12 text-center relative overflow-hidden ${!heroBg?"bg-gradient-to-br from-amber-800 via-amber-900 to-stone-900":""}`} style={hs}>
      <div className="relative z-10"><p className="text-amber-200/80 text-xs tracking-[0.2em] uppercase mb-3 font-medium">Homemade Bakery</p><h1 className="text-3xl font-bold mb-2 tracking-tight">Sinar Jaya Bakery</h1><p className="text-amber-100/70 text-sm mb-4 max-w-xs mx-auto leading-relaxed">Menyempurnakan setiap momen spesial dengan kue buatan tangan penuh cinta</p>
        <div className="flex justify-center gap-6 mb-4 text-amber-100/80 text-xs"><span>🌿 Fresh Daily</span><span>🎨 Custom Order</span><span>❤️ Homemade</span></div></div></div>
    <div className="px-5 -mt-4 relative z-10"><div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 flex items-center gap-3 mb-4"><span className="text-lg">⚡</span><p className="text-sm text-stone-600 flex-1"><span className="font-semibold text-amber-800">Slot terbatas</span> setiap hari — pesan sekarang!</p></div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={()=>onCat("special")} className="bg-amber-800 text-white rounded-2xl py-3.5 px-2 text-center font-semibold text-[11px] leading-tight shadow-lg shadow-amber-800/20 hover:bg-amber-900 transition-all active:scale-[0.97]">🎉<br/>Special<br/>Selection</button>
        <button onClick={()=>onCat("classic")} className="bg-amber-800 text-white rounded-2xl py-3.5 px-2 text-center font-semibold text-[11px] leading-tight shadow-lg shadow-amber-800/20 hover:bg-amber-900 transition-all active:scale-[0.97]">🍩<br/>Daily<br/>Selection</button>
        <button onClick={()=>onCat("savory")} className="bg-amber-800 text-white rounded-2xl py-3.5 px-2 text-center font-semibold text-[11px] leading-tight shadow-lg shadow-amber-800/20 hover:bg-amber-900 transition-all active:scale-[0.97]">🥨<br/>Savory<br/>Snack</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <button onClick={onTrack} className="bg-white text-amber-800 rounded-2xl py-3 px-2 text-center font-medium text-xs shadow-sm border border-stone-100 hover:border-amber-200 hover:shadow-md transition-all">📦 Cek Pesanan</button>
        <button onClick={onInfo} className="bg-white text-stone-700 rounded-2xl py-3 px-2 text-center font-medium text-xs shadow-sm border border-stone-100 hover:border-amber-200 hover:shadow-md transition-all">📍 Info Toko</button>
        <button onClick={onFAQ} className="bg-white text-stone-700 rounded-2xl py-3 px-2 text-center font-medium text-xs shadow-sm border border-stone-100 hover:border-amber-200 hover:shadow-md transition-all">❓ FAQ</button>
      </div>
    </div>
    {!loading&&todayProds.length>0&&<div className="px-5 pt-6"><div className="flex items-center gap-2 mb-4"><div className="w-8 h-[2px] bg-amber-300 rounded-full"/><h2 className="font-bold text-stone-800 text-lg">🍞 Tersedia Hari Ini — {todayLabel()}</h2></div>
      <div className="grid grid-cols-2 gap-3">{todayProds.map(p=>(<button key={p.id} onClick={()=>!p.is_sold_out&&onProd(p.id)} className={`rounded-2xl overflow-hidden text-left group ${p.is_sold_out?"opacity-50 cursor-not-allowed":"hover:scale-[1.02]"} transition-all duration-300`}><div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 h-full"><div className="overflow-hidden relative"><div className={`${p.is_sold_out?"":"group-hover:scale-110"} transition-transform duration-700`}><Img name={p.name} color={p.color} img={firstImg(p.image_url)} size="md"/></div>{p.is_sold_out&&<div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center"><span className="bg-red-500/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">Stok Habis</span></div>}{p.label&&!p.is_sold_out&&<div className="absolute top-2 left-2"><LB label={p.label}/></div>}</div><div className="p-3.5"><p className="font-bold text-sm text-stone-800 mb-1">{p.name}</p>{p.description&&<p className="text-[10px] text-stone-400 mb-2 line-clamp-2 leading-relaxed">{p.description}</p>}<div className="flex items-center justify-between"><PriceDisplay price={p.price} discount={p.discount} soldOut={p.is_sold_out}/>{!p.is_sold_out&&<span className="text-amber-600 text-lg group-hover:translate-x-1 transition-transform">→</span>}</div></div></div></button>))}</div>
    </div>}
    {loading?<Skel/>:(<div className="px-5 pb-8 pt-6"><div className="flex items-center gap-2 mb-4"><div className="w-8 h-[2px] bg-amber-300 rounded-full"/><h2 className="font-bold text-stone-800 text-lg">Favorit Pelanggan</h2></div>
      <div className="flex flex-col gap-3">{bs.map(p=>(<button key={p.id} onClick={()=>!p.is_sold_out&&onProd(p.id)} className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 text-left w-full flex group ${p.is_sold_out?"opacity-60 cursor-not-allowed":"hover:shadow-md hover:border-amber-200"} transition-all`}>
        <div className="w-28 min-h-[100px] flex-shrink-0 overflow-hidden relative"><Img name={p.name} color={p.color} img={firstImg(p.image_url)} size="md"/>{p.is_sold_out&&<div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">Habis</span></div>}</div>
        <div className="flex-1 p-4 flex flex-col justify-center"><div className="flex items-center gap-2 mb-1"><span className="font-bold text-stone-800">{p.name}</span><LB label={p.label}/></div><p className="text-xs text-stone-400 mb-2 line-clamp-2 leading-relaxed">{p.recommendation}</p><PriceDisplay price={p.price} discount={p.discount} soldOut={p.is_sold_out}/></div>
        <div className="flex items-center pr-4 text-stone-300 group-hover:text-amber-600 transition">›</div></button>))}</div></div>)}
    <FCart cart={cart} onClick={onCart}/></Shell>);
};

const Catalog = ({products,category,onProd,onBack,cart,onCart,onHome,schedIds}) => {
  const todayIds=(schedIds&&schedIds[todayKey()])||[];
  const isScheduled=category==="classic"&&todayIds.length>0;
  const all=products.filter(p=>category==="classic"?((p.category==="classic"||p.category==="harian")&&(!isScheduled||todayIds.includes(p.id))):p.category===category);
  const fl=isScheduled?[...all].sort((a,b)=>(todayIds.includes(b.id)?1:0)-(todayIds.includes(a.id)?1:0)):all;
  const sp=category==="special",sv=category==="savory";
  const t=sp?"Special Selection":sv?"Savory Snack Selection":"Daily Selection";
  const icon=sp?"🎉":sv?"🥨":"🍩";
  const subtitle=sp?"Untuk momen spesial & perayaan":sv?"Cemilan gurih favorit":"Pilihan harian favorit";
  const bgCls=sp?"bg-gradient-to-b from-purple-50 to-stone-50":sv?"bg-gradient-to-b from-orange-50 to-stone-50":"bg-gradient-to-b from-amber-50 to-stone-50";
  return(<Shell title={t} onBack={onBack} onHome={onHome}>
    <div className={`px-5 pt-5 pb-3 ${bgCls}`}><div className="flex items-center gap-3 mb-2"><span className="text-3xl">{icon}</span><div><h2 className="text-lg font-bold text-stone-800">{t}</h2><p className="text-xs text-stone-400">{subtitle}</p></div></div>{sp&&<div className="bg-white/70 backdrop-blur-sm text-purple-700 text-xs px-4 py-2.5 rounded-xl mb-1 border border-purple-100 mt-3">ℹ️ Minimal pemesanan H-5</div>}{!sp&&!sv&&todayIds.length>0&&<div className="bg-white/70 backdrop-blur-sm text-emerald-700 text-xs px-4 py-2.5 rounded-xl mb-1 border border-emerald-100 mt-3">🍞 Produk dengan label <span className="font-semibold">✓ Hari Ini</span> tersedia {todayLabel()}</div>}</div>
    <div className="px-5 py-4">{fl.length===0?<div className="text-center py-20 text-stone-300"><p className="text-5xl mb-4">🍰</p><p className="font-medium text-stone-400">Produk belum tersedia</p></div>:(<div className="grid grid-cols-2 gap-3">{fl.map(p=>{const today=!sp&&todayIds.includes(p.id);return(<button key={p.id} onClick={()=>!p.is_sold_out&&onProd(p.id)} className={`rounded-2xl overflow-hidden text-left group ${p.is_sold_out?"opacity-50 cursor-not-allowed":"hover:scale-[1.02]"} transition-all duration-300`}><div className={`bg-white rounded-2xl overflow-hidden shadow-sm h-full border ${today?"border-emerald-300":"border-stone-100"}`}><div className="overflow-hidden relative"><div className={`${p.is_sold_out?"":"group-hover:scale-110"} transition-transform duration-700`}><Img name={p.name} color={p.color} img={firstImg(p.image_url)} size="md"/></div>{p.is_sold_out&&<div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center"><span className="bg-red-500/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">Stok Habis</span></div>}{p.label&&!p.is_sold_out&&<div className="absolute top-2 left-2"><LB label={p.label}/></div>}{today&&!p.is_sold_out&&<div className="absolute top-2 right-2"><span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full shadow">✓ Hari Ini</span></div>}</div><div className="p-3.5"><p className="font-bold text-sm text-stone-800 mb-1">{p.name}</p>{p.portion&&<p className="text-[10px] text-stone-400 mb-1">👥 {p.portion}</p>}<p className="text-[10px] text-stone-400 mb-2.5 line-clamp-2 leading-relaxed">{p.recommendation}</p><div className="flex items-center justify-between"><PriceDisplay price={p.price} discount={p.discount} soldOut={p.is_sold_out}/>{!p.is_sold_out&&<span className="text-amber-600 text-lg group-hover:translate-x-1 transition-transform">→</span>}</div></div></div></button>);})}</div>)}</div>
    <FCart cart={cart} onClick={onCart}/></Shell>);
};

const ImgCarousel = ({imgs,name,color}) => {
  const [i,setI]=useState(0);const touchX=useRef(0);
  const n=imgs.length;
  if(n===0) return <Img name={name} color={color} size="lg"/>;
  if(n===1) return <Img name={name} color={color} img={imgs[0]} size="lg"/>;
  const go=(dir)=>setI(v=>(v+dir+n)%n);
  return(<div className="relative h-52 w-full overflow-hidden bg-stone-100" onTouchStart={e=>{touchX.current=e.touches[0].clientX;}} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-touchX.current;if(Math.abs(dx)>40)go(dx<0?1:-1);}}>
    <img src={imgs[i]} alt={name} className="w-full h-full object-cover transition-opacity duration-300"/>
    <button onClick={()=>go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm text-lg">‹</button>
    <button onClick={()=>go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm text-lg">›</button>
    <div className="absolute top-2 right-3 bg-black/50 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">{i+1}/{n}</div>
    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">{imgs.map((_,j)=>(<button key={j} onClick={()=>setI(j)} className={`h-1.5 rounded-full transition-all ${j===i?"bg-white w-5":"bg-white/50 w-1.5 hover:bg-white/80"}`}/>))}</div>
  </div>);
};

const Product = ({product:pr,onBack,onAdd,cart,onCart,onHome}) => {
  const sz=jp(pr.sizes,[]),fl=jp(pr.flavors,[]),isCl=pr.category==="classic"||pr.category==="harian"||pr.category==="savory",disc=pr.discount||0,mq=pr.max_qty||0;
  const imgs=parseImages(pr.image_url);
  const [si,setSi]=useState(sz.length>0?0:-1);
  const [fv,setFv]=useState(isCl?[]:(fl.length>0?fl[0]:""));
  const [qty,setQty]=useState(1);
  const [note,setNote]=useState("");
  const sa=si>=0?sz[si].add:0,bp=pr.price+sa,up=disc>0?Math.round(bp*(1-disc/100)):bp,tot=up*qty;
  const maxQ=mq>0?mq:9999;
  const toggleF=f=>setFv(pv=>{if(!Array.isArray(pv))return[f];if(pv.includes(f))return pv.filter(x=>x!==f);return[...pv,f];});
  const flDisp=isCl?(Array.isArray(fv)?fv.join(", "):""):(fv||"");

  return(<Shell onBack={onBack} onHome={onHome}>
    <div className="relative"><ImgCarousel imgs={imgs} name={pr.name} color={pr.color}/><div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-stone-50 to-transparent pointer-events-none"/></div>
    <div className="px-5 -mt-6 relative z-10">
      <div className="bg-white rounded-3xl shadow-md border border-stone-100 p-5 mb-4"><div className="flex items-start justify-between mb-3"><div><h2 className="text-xl font-bold text-stone-800 mb-1">{pr.name}</h2>{pr.portion&&<p className="text-xs text-stone-400">👥 {pr.portion}</p>}</div><LB label={pr.label}/></div><p className="text-sm text-stone-500 leading-relaxed mb-3">{pr.description}</p>{pr.recommendation&&<div className="bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 text-xs px-4 py-3 rounded-xl border border-amber-100/50">💡 {pr.recommendation}</div>}{mq>0&&<p className="text-xs text-stone-400 mt-2">📦 Maks. {mq} per pesanan</p>}</div>

      {sz.length>0&&<div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 mb-4"><p className="text-sm font-bold text-stone-800 mb-3">📏 Pilih Ukuran</p><div className="flex flex-col gap-2">{sz.map((s,i)=>(<button key={i} onClick={()=>setSi(i)} className={`border-2 rounded-2xl px-4 py-3.5 text-left text-sm transition-all flex items-center justify-between ${i===si?"border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 font-semibold text-amber-900 shadow-sm":"border-stone-200 text-stone-600 hover:border-stone-300"}`}><span>{s.name}</span><span className="font-bold">{disc>0?<><span className="line-through text-stone-400 text-xs mr-1">{fmt(pr.price+s.add)}</span>{fmt(Math.round((pr.price+s.add)*(1-disc/100)))}</>:fmt(pr.price+s.add)}</span></button>))}</div></div>}

      {fl.length>0&&<div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 mb-4"><p className="text-sm font-bold text-stone-800 mb-1">🎨 Pilih Rasa</p>{isCl&&<p className="text-xs text-stone-400 mb-3">Bisa pilih lebih dari 1</p>}{!isCl&&<div className="mb-3"/>}<div className="flex flex-wrap gap-2">{fl.map(f=>{const sel=isCl?(Array.isArray(fv)&&fv.includes(f)):f===fv;return(<button key={f} onClick={()=>isCl?toggleF(f):setFv(f)} className={`border-2 rounded-full px-5 py-2.5 text-sm transition-all ${sel?"border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 font-semibold text-amber-900 shadow-sm":"border-stone-200 text-stone-600 hover:border-stone-300"}`}>{sel&&isCl&&"✓ "}{f}</button>);})}</div></div>}

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 mb-4"><p className="text-sm font-bold text-stone-800 mb-3">🔢 Jumlah {mq>0&&<span className="text-stone-400 font-normal text-xs">(maks. {mq})</span>}</p><div className="flex items-center gap-4"><button onClick={()=>setQty(Math.max(1,qty-1))} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-lg font-bold text-stone-500 hover:bg-amber-100 hover:text-amber-700 transition-all active:scale-90">−</button><span className="text-2xl font-bold w-10 text-center text-stone-800">{qty}</span><button onClick={()=>setQty(Math.min(maxQ,qty+1))} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-lg font-bold text-stone-500 hover:bg-amber-100 hover:text-amber-700 transition-all active:scale-90">+</button></div></div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 mb-4"><p className="text-sm font-bold text-stone-800 mb-3">📝 Catatan <span className="text-stone-400 font-normal text-xs">(opsional)</span></p><textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Tulisan di kue, request khusus, dll" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white transition"/></div>

      <div className="bg-gradient-to-r from-amber-800 to-amber-900 rounded-3xl p-5 mb-4 flex items-center justify-between shadow-lg"><div><p className="text-amber-200 text-xs mb-0.5">Total Harga</p>{disc>0&&<p className="text-amber-300/60 text-sm line-through">{fmt(bp*qty)}</p>}<p className="text-2xl font-bold text-white">{fmt(tot)}</p></div><div className="text-right">{disc>0&&<p className="text-xs font-bold text-emerald-300 mb-0.5">Diskon {disc}%</p>}<p className="text-amber-200 text-xs mb-0.5">{qty} item</p><p className="text-amber-100 text-xs">@ {fmt(up)}</p></div></div>

      <Btn onClick={()=>onAdd({id:pr.id,name:pr.name,color:pr.color,img:firstImg(pr.image_url),size:si>=0?sz[si].name:"",flavor:flDisp,qty,unitPrice:up,note,category:pr.category})} full>🛒 Tambah ke Keranjang</Btn><div className="h-6"/>
    </div><FCart cart={cart} onClick={onCart}/></Shell>);
};

const Cart = ({cart,dispatch:d,onCheckout,onBack,onHome}) => {
  const tot=cart.reduce((s,i)=>s+i.unitPrice*i.qty,0);
  return(<Shell title="Keranjang" onBack={onBack} onHome={onHome}><div className="px-5 py-5">{cart.length===0?<div className="text-center py-20 text-stone-300"><p className="text-5xl mb-4">🛒</p><p className="font-medium text-stone-400">Belum ada pesanan</p></div>:(<>
    {cart.map(it=>(<div key={it.key} className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-stone-100 flex gap-3"><div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden"><Img name={it.name} color={it.color} img={it.img} size="sm"/></div><div className="flex-1 min-w-0"><div className="flex items-start justify-between"><div><p className="font-bold text-stone-800 text-sm">{it.name}</p>{it.size&&<p className="text-[11px] text-stone-400">{it.size}</p>}{it.flavor&&<p className="text-[11px] text-stone-400">{it.flavor}</p>}{it.note&&<p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">📝 {it.note}</p>}</div><button onClick={()=>d({type:"DEL",key:it.key})} className="text-stone-300 hover:text-red-500 text-sm ml-2 transition">✕</button></div><div className="flex items-center justify-between mt-3"><div className="flex items-center gap-2 bg-stone-50 rounded-full px-1 py-0.5"><button onClick={()=>d({type:"UPD",key:it.key,qty:it.qty-1})} className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-bold text-stone-500">−</button><span className="font-bold text-sm w-5 text-center">{it.qty}</span><button onClick={()=>d({type:"UPD",key:it.key,qty:it.qty+1})} className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-bold text-stone-500">+</button></div><p className="text-amber-800 font-bold text-sm">{fmt(it.unitPrice*it.qty)}</p></div></div></div>))}
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 mb-5 flex items-center justify-between border border-amber-100"><span className="font-semibold text-stone-600">Total Pesanan</span><span className="text-2xl font-bold text-amber-800">{fmt(tot)}</span></div>
    <Btn onClick={onCheckout} full>Lanjut Pesan →</Btn></>)}</div></Shell>);
};

const Checkout = ({cart,settings:st,orders,closedDates:cd,onSubmit,onBack,onHome}) => {
  const [nm,setNm]=useState("");const [ph,setPh]=useState("");const [dt,setDt]=useState("");const [tm,setTm]=useState("");const [ref,setRef]=useState("");const [err,setErr]=useState("");const [sub,setSub]=useState(false);
  const [vCode,setVCode]=useState("");const [vApplied,setVApplied]=useState(null);const [vErr,setVErr]=useState("");
  const hasSp=cart.some(i=>i.category==="special"),ltc=parseInt(st.lead_time_classic||"0"),lts=parseInt(st.lead_time_special||"5"),ld=hasSp?lts:ltc,quota=parseInt(st.daily_quota||"20");
  const today=new Date(),minD=new Date(today);minD.setDate(minD.getDate()+ld);const minDS=minD.toISOString().split("T")[0];
  const ood=orders.filter(o=>o.pickup_date===dt).length,isFull=hasSp&&ood>=quota,isClosed=cd.some(d=>d.date===dt),sl=hasSp?Math.max(0,quota-ood):null;
  const subtotal=cart.reduce((s,i)=>s+i.unitPrice*i.qty,0);
  const voucherList=jp(st.vouchers_json,[]);
  const discount=vApplied?vApplied.discount:0,grandTotal=Math.max(0,subtotal-discount);
  const applyCode=()=>{const r=applyVoucher(vCode,voucherList,subtotal);if(!r.ok){setVErr(r.err||"Kode tidak valid");setVApplied(null);return;}setVErr("");setVApplied({code:r.voucher.code,discount:r.discount,type:r.voucher.type,value:r.voucher.value});};
  const removeVoucher=()=>{setVApplied(null);setVCode("");setVErr("");};
  const go=async()=>{if(!nm.trim())return setErr("Nama wajib diisi");if(!ph.trim())return setErr("Nomor HP wajib diisi");if(!dt)return setErr("Tanggal wajib dipilih");if(hasSp&&!tm)return setErr("Jam ambil wajib dipilih");if(isClosed)return setErr("Tanggal tutup");if(isFull)return setErr("Slot penuh");setErr("");setSub(true);try{const on=await dbGN();onSubmit({name:nm.trim(),phone:ph.trim(),date:dt,time:tm,orderNum:on,referenceImage:ref,voucher:vApplied,subtotal,discount,total:grandTotal});}catch{setErr("Gagal, coba lagi.");}setSub(false);};
  return(<Shell title="Checkout" onBack={onBack} onHome={onHome}><div className="px-5 py-5">
    {hasSp&&<div className="bg-amber-50 text-amber-800 text-xs px-4 py-3 rounded-2xl mb-5 border border-amber-100">ℹ️ Minimal H-{lts}</div>}
    <Inp label="Nama" required value={nm} onChange={e=>setNm(e.target.value)} placeholder="Nama lengkap"/>
    <Inp label="Nomor HP" required value={ph} onChange={e=>setPh(e.target.value)} placeholder="08xxxxxxxxxx" type="tel"/>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Tanggal Ambil<span className="text-red-400 ml-0.5">*</span></label><input type="date" value={dt} min={minDS} onChange={e=>setDt(e.target.value)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 transition"/><p className="text-xs text-stone-400 mt-1.5">{hasSp?`Minimal H-${lts}`:"Bisa same day"}</p></div>
    {hasSp&&<div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Jam Ambil<span className="text-red-400 ml-0.5">*</span></label><input type="time" value={tm} onChange={e=>setTm(e.target.value)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 transition"/><p className="text-xs text-stone-400 mt-1.5">Pilih jam yang diinginkan</p></div>}
    {hasSp&&<ImgUp value={ref} onChange={setRef} label="Foto Referensi (opsional)"/>}

    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">🎟️ Kode Voucher <span className="text-stone-400 font-normal text-xs">(opsional)</span></label>
      {vApplied?(<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between"><div><p className="text-sm font-bold text-emerald-800">✓ {vApplied.code}</p><p className="text-xs text-emerald-700 mt-0.5">Diskon {fmt(vApplied.discount)} {vApplied.type==="percentage"?`(-${vApplied.value}%)`:""}</p></div><button onClick={removeVoucher} className="text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition">Hapus</button></div>):(<>
        <div className="flex gap-2"><input value={vCode} onChange={e=>{setVCode(e.target.value.toUpperCase());setVErr("")}} placeholder="Masukkan kode promo" className="flex-1 border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 transition uppercase"/><Btn onClick={applyCode} variant="secondary" disabled={!vCode.trim()}>Pakai</Btn></div>
        {vErr&&<p className="text-xs text-red-500 mt-1.5">⚠️ {vErr}</p>}
      </>)}
    </div>

    <div className="bg-white rounded-2xl p-4 border border-stone-100 mb-4 space-y-1.5 text-sm">
      <div className="flex justify-between text-stone-600"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
      {discount>0&&<div className="flex justify-between text-emerald-600"><span>Diskon voucher</span><span>−{fmt(discount)}</span></div>}
      <div className="flex justify-between pt-1.5 border-t border-stone-100 font-bold text-stone-800"><span>Total</span><span className="text-amber-800">{fmt(grandTotal)}</span></div>
    </div>

    {dt&&isClosed&&<div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">❌ Tanggal tutup.</div>}
    {dt&&isFull&&!isClosed&&<div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">❌ Slot penuh.</div>}
    {dt&&!isClosed&&!isFull&&sl!==null&&<div className={`text-sm px-4 py-3 rounded-2xl mb-4 border ${sl<=5?"bg-orange-50 text-orange-700 border-orange-100":"bg-emerald-50 text-emerald-700 border-emerald-100"}`}>{sl<=5?`⚡ Sisa ${sl} slot`:`✅ Tersedia (${sl} slot)`}</div>}
    {err&&<div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">⚠️ {err}</div>}
    <Btn onClick={go} full disabled={sub}>{sub?"Memproses...":"Lihat Preview →"}</Btn></div></Shell>);
};

const Preview = ({cart,checkout:co,onSend,onBack,onHome}) => {
  const [sending,setSending]=useState(false);
  const sub=co.subtotal||cart.reduce((s,i)=>s+i.unitPrice*i.qty,0);
  const disc=co.discount||0,tot=co.total!=null?co.total:Math.max(0,sub-disc),pd=new Date(co.date+"T00:00:00"),oid=co.orderNum;
  const timeStr=co.time?` pukul ${co.time}`:"";
  const voucherLine=co.voucher?`%0AVoucher: ${co.voucher.code} (−${fmt(disc)})`:"";
  const waText=`Halo, saya ingin order:%0A%0ANo Order: ${oid}%0ANama: ${co.name}%0A%0AProduk:%0A${cart.map(i=>{let l=`- ${i.name} x${i.qty}`;if(i.size)l+=` (${i.size})`;if(i.flavor)l+=` — ${i.flavor}`;if(i.note)l+=`%0A  Catatan: ${i.note}`;return l;}).join("%0A")}%0A%0ATanggal Ambil: ${dfmt(pd)}${timeStr}%0ASubtotal: ${fmt(sub)}${voucherLine}%0ATotal: ${fmt(tot)}%0A%0AStatus: Menunggu Verifikasi`;
  const waLink=`https://wa.me/${WA}?text=${waText}`;
  const notes=[cart.map(i=>i.note).filter(Boolean).join("; "),co.voucher?`[Voucher: ${co.voucher.code} −${fmt(disc)}]`:""].filter(Boolean).join(" ");
  const go=async()=>{setSending(true);try{await dbIO({order_number:oid,customer_name:co.name,customer_phone:co.phone,items:cart.map(i=>({name:i.name,size:i.size,flavor:i.flavor,qty:i.qty,unitPrice:i.unitPrice})),total:tot,note:notes,pickup_date:co.date,status:"waiting",reference_image:co.referenceImage||""});window.open(waLink,"_blank");onSend();}catch{alert("Gagal menyimpan order.");}setSending(false);};
  return(<Shell title="Preview Order" onBack={onBack} onHome={onHome}><div className="px-5 py-5">
    <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 mb-5"><div className="text-center mb-5"><p className="text-[11px] text-stone-400 uppercase tracking-wider mb-1">No. Order</p><p className="text-xl font-bold text-amber-800">{oid}</p></div>
      <div className="border-t border-dashed border-stone-200 pt-4 mb-4 space-y-3">{cart.map(it=>(<div key={it.key} className="flex justify-between items-start"><div className="flex-1"><p className="font-semibold text-stone-800 text-sm">{it.name} <span className="text-stone-400 font-normal">×{it.qty}</span></p>{it.size&&<p className="text-[11px] text-stone-400">{it.size}</p>}{it.flavor&&<p className="text-[11px] text-stone-400">{it.flavor}</p>}{it.note&&<p className="text-[11px] text-stone-400">📝 {it.note}</p>}</div><p className="font-semibold text-stone-700 text-sm">{fmt(it.unitPrice*it.qty)}</p></div>))}</div>
      <div className="border-t border-stone-200 pt-4 space-y-1.5 text-sm mb-5">
        <div className="flex justify-between text-stone-600"><span>Subtotal</span><span>{fmt(sub)}</span></div>
        {disc>0&&<div className="flex justify-between text-emerald-600"><span>🎟️ {co.voucher?.code}</span><span>−{fmt(disc)}</span></div>}
        <div className="flex justify-between pt-2 border-t border-stone-100"><span className="font-semibold text-stone-600">Total</span><span className="text-2xl font-bold text-amber-800">{fmt(tot)}</span></div>
      </div>
      <div className="bg-stone-50 rounded-2xl p-4 text-sm text-stone-600 space-y-2"><p>👤 {co.name}</p><p>📱 {co.phone}</p><p>📅 {dfmt(pd)}{co.time&&` · 🕐 ${co.time}`}</p></div></div>
    <Btn onClick={go} full variant="whatsapp" disabled={sending}>{sending?"Mengirim...":"📲 Kirim ke WhatsApp"}</Btn>
    <p className="text-xs text-center text-stone-400 mt-4">Jika WhatsApp tidak terbuka, <a href={waLink} target="_blank" rel="noreferrer" className="text-amber-700 underline">klik di sini</a></p></div></Shell>);
};

/* ── ADMIN ── */

const ALogin = ({onLogin}) => {
  const [em,setEm]=useState("");const [pw,setPw]=useState("");const [err,setErr]=useState("");const [ld,setLd]=useState(false);
  const go=async()=>{setLd(true);setErr("");try{await login(em,pw);onLogin();}catch(e){setErr("Login gagal: "+(e.message||"Coba lagi"));}setLd(false);};
  return(<div className="min-h-screen bg-stone-50 flex items-center justify-center px-4"><div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-7 w-full max-w-sm"><h1 className="text-xl font-bold text-center text-stone-800 mb-1">Admin Panel</h1><p className="text-sm text-center text-stone-400 mb-6">Sinar Jaya Bakery</p><Inp label="Email" value={em} onChange={e=>{setEm(e.target.value);setErr("")}} placeholder="Email admin"/><Inp label="Password" type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("")}} placeholder="••••••••"/>{err&&<p className="text-red-500 text-sm mb-3">⚠️ {err}</p>}<Btn onClick={go} full disabled={ld}>{ld?"Masuk...":"Masuk"}</Btn></div></div>);
};

const AOrders = ({orders,onRefresh:rf,newCount}) => {
  const [q,setQ]=useState("");const [fs,setFs]=useState("all");const [busy,setBusy]=useState("");
  const sL={waiting:"Menunggu",paid:"Lunas",process:"Diproses",done:"Selesai"},sV={waiting:"sw",paid:"sp",process:"sb",done:"sd"},sF={waiting:"paid",paid:"process",process:"done"};

  const today=new Date().toISOString().split("T")[0];
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const tmw=tomorrow.toISOString().split("T")[0];
  const upcomingOrders=orders.filter(o=>(o.pickup_date===today||o.pickup_date===tmw)&&["paid","process"].includes(o.status));

  const sendReminder=(o)=>{
    const isToday=o.pickup_date===today;
    const msg=`Halo ${o.customer_name}! 👋%0A%0AKami ingatkan pesanan Anda:%0ANo Order: ${o.order_number}%0A%0ABisa diambil ${isToday?"*hari ini*":"*besok*"} (${o.pickup_date}).%0A%0ATerima kasih sudah memesan di Sinar Jaya Bakery! 🍞`;
    window.open(`https://wa.me/${o.customer_phone.replace(/^0/,"62")}?text=${msg}`,"_blank");
  };

  let ls=[...orders];if(fs!=="all")ls=ls.filter(o=>o.status===fs);if(q)ls=ls.filter(o=>o.customer_name.toLowerCase().includes(q.toLowerCase())||o.customer_phone.includes(q)||o.order_number.toLowerCase().includes(q.toLowerCase()));
  return(<div>
    {newCount>0&&<div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center gap-3"><span className="text-2xl">🔔</span><p className="text-sm text-amber-800 font-semibold">{newCount} pesanan baru masuk!</p></div>}

    {upcomingOrders.length>0&&<div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3"><span className="text-lg">📅</span><p className="text-sm font-bold text-blue-900">Reminder Pickup ({upcomingOrders.length})</p></div>
      <div className="space-y-2">{upcomingOrders.map(o=>{const isToday=o.pickup_date===today;return(<div key={o.id} className="bg-white rounded-xl p-3 flex items-center justify-between gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-bold text-stone-800 truncate">{o.customer_name}</p><p className="text-xs text-stone-500">{o.order_number} · {isToday?<span className="text-red-600 font-semibold">Hari ini</span>:<span className="text-orange-600 font-semibold">Besok</span>}</p></div><button onClick={()=>sendReminder(o)} className="bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap">💬 Reminder</button></div>);})}</div>
    </div>}

    <Inp placeholder="Cari nama / no HP / no order..." value={q} onChange={e=>setQ(e.target.value)}/>
    <div className="flex gap-2 mb-5 overflow-x-auto pb-1">{["all","waiting","paid","process","done"].map(s=><button key={s} onClick={()=>setFs(s)} className={`text-xs px-4 py-2 rounded-full whitespace-nowrap border-2 transition-all font-medium ${s===fs?"bg-amber-800 text-white border-amber-800":"border-stone-200 text-stone-500 hover:border-stone-300"}`}>{s==="all"?"Semua":sL[s]}{s==="waiting"&&newCount>0?` (${newCount})`:""}</button>)}</div>
    {ls.length===0?<div className="text-center py-12 text-stone-300"><p className="text-4xl mb-3">📋</p><p className="text-stone-400">Belum ada pesanan</p></div>:ls.map(o=>(<div key={o.id} className="bg-white rounded-2xl p-5 mb-3 shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-3"><span className="font-bold text-sm text-stone-800">{o.order_number}</span><Badge variant={sV[o.status]}>{sL[o.status]}</Badge></div>
      <p className="text-sm text-stone-600">👤 {o.customer_name} · 📱 {o.customer_phone}</p>
      <div className="mt-2 text-xs text-stone-400">{(o.items||[]).map((it,i)=><p key={i}>{it.name} ×{it.qty}{it.size?` (${it.size})`:"" }{it.flavor?` — ${it.flavor}`:""}</p>)}</div>
      {o.note&&<p className="text-xs text-stone-400 mt-1">📝 {o.note}</p>}
      {o.reference_image&&<div className="mt-2"><p className="text-xs text-stone-400 mb-1">📷 Referensi:</p><img src={o.reference_image} alt="Referensi" className="w-32 h-32 object-cover rounded-lg border border-stone-200"/></div>}
      <div className="flex items-center justify-between mt-3 text-xs text-stone-400"><div><p>📝 Order: {o.order_date}</p><p>📅 Ambil: {o.pickup_date}</p></div><span className="font-bold text-amber-800 text-sm">{fmt(o.total)}</span></div>
      <div className="flex gap-2 mt-4">{sF[o.status]&&<Btn onClick={async()=>{setBusy(o.order_number);try{await dbUO(o.id,{status:sF[o.status]});await rf();}catch{}setBusy("")}} variant="primary" className="text-xs flex-1" disabled={busy===o.order_number}>{o.status==="waiting"?"💰 Tandai Bayar":o.status==="paid"?"⚙️ Proses":"✅ Selesai"}</Btn>}{o.status==="done"&&<Btn onClick={async()=>{setBusy(o.order_number);try{await dbXO(o.id);await rf();}catch{}setBusy("")}} variant="danger" className="text-xs" disabled={busy===o.order_number}>🗑️</Btn>}</div>
    </div>))}
  </div>);
};

const AMenu = ({products,onRefresh:rf}) => {
  const [ed,setEd]=useState(null);
  const [fm,setFm]=useState({name:"",price:"",category:"classic",subcategory:"",label:"",description:"",color:"#D4A574",image_url:"",flavors:[],sizes:[],discount:0,max_qty:0});
  const [sv,setSv]=useState(false);
  const addF=()=>setFm(f=>({...f,flavors:[...f.flavors,""]}));const upF=(i,v)=>setFm(f=>({...f,flavors:f.flavors.map((x,j)=>j===i?v:x)}));const rmF=i=>setFm(f=>({...f,flavors:f.flavors.filter((_,j)=>j!==i)}));
  const addS=()=>setFm(f=>({...f,sizes:[...f.sizes,{name:"",add:0}]}));const upS=(i,k,v)=>setFm(f=>({...f,sizes:f.sizes.map((x,j)=>j===i?{...x,[k]:k==="add"?parseInt(v)||0:v}:x)}));const rmS=i=>setFm(f=>({...f,sizes:f.sizes.filter((_,j)=>j!==i)}));
  const save=async()=>{if(!fm.name||!fm.price)return;setSv(true);const d={name:fm.name,price:Number(fm.price),category:fm.category,label:fm.label,description:fm.description,color:fm.color,image_url:fm.image_url,flavors:fm.flavors.filter(f=>f.trim()),sizes:fm.sizes.filter(s=>s.name.trim()),discount:Number(fm.discount)||0,max_qty:Number(fm.max_qty)||0};try{if(ed==="new")await dbIP(d);else await dbUP(ed,d);await rf();setEd(null);}catch{alert("Gagal menyimpan");}setSv(false);};

  if(ed!==null) return(<div className="bg-white rounded-2xl p-5 border border-stone-100">
    <h3 className="font-bold text-stone-800 mb-4">{ed==="new"?"Tambah Produk":"Edit Produk"}</h3>
    <ImgsUp value={fm.image_url} onChange={v=>setFm(f=>({...f,image_url:v}))} label="Foto Produk"/>
    <Inp label="Nama" value={fm.name} onChange={e=>setFm(f=>({...f,name:e.target.value}))}/>
    <Inp label="Harga" type="number" value={fm.price} onChange={e=>setFm(f=>({...f,price:e.target.value}))}/>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Diskon <span className="text-stone-400 font-normal text-xs">(% — 0 = tanpa diskon)</span></label><div className="flex items-center gap-3"><input type="number" min="0" max="100" value={fm.discount||0} onChange={e=>setFm(f=>({...f,discount:Math.min(100,Math.max(0,parseInt(e.target.value)||0))}))} className="w-24 border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><span className="text-sm text-stone-500">%</span>{fm.discount>0&&fm.price&&<span className="text-xs text-emerald-600 font-medium">→ {fmt(Math.round(Number(fm.price)*(1-fm.discount/100)))}</span>}</div></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Maks. Qty per Order <span className="text-stone-400 font-normal text-xs">(0 = tanpa batas)</span></label><input type="number" min="0" value={fm.max_qty||0} onChange={e=>setFm(f=>({...f,max_qty:parseInt(e.target.value)||0}))} className="w-32 border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Kategori</label><select value={fm.category==="harian"?"classic":fm.category} onChange={e=>setFm(f=>({...f,category:e.target.value}))} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50"><option value="classic">Daily Selection</option><option value="savory">Savory Snack Selection</option><option value="special">Special</option></select><p className="text-xs text-stone-400 mt-1">Daily = menu harian. Savory = cemilan gurih. Special perlu H-5.</p></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Sub-kategori <span className="text-stone-400 font-normal text-xs">(opsional)</span></label><input value={fm.subcategory||""} onChange={e=>setFm(f=>({...f,subcategory:e.target.value}))} placeholder="Contoh: Roti Manis, Kue Kering" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Label <span className="text-stone-400 font-normal text-xs">(opsional)</span></label><input value={fm.label} onChange={e=>setFm(f=>({...f,label:e.target.value}))} placeholder="Contoh: Best Seller, Diskon 20%, Baru" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Warna Placeholder</label><input type="color" value={fm.color} onChange={e=>setFm(f=>({...f,color:e.target.value}))} className="w-12 h-10 rounded-xl border-0 cursor-pointer"/></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Deskripsi</label><textarea value={fm.description} onChange={e=>setFm(f=>({...f,description:e.target.value}))} rows={2} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-2">🎨 Pilihan Rasa</label>{fm.flavors.map((f,i)=>(<div key={i} className="flex gap-2 mb-2"><input value={f} onChange={e=>upF(i,e.target.value)} placeholder={`Rasa ${i+1}`} className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><button onClick={()=>rmF(i)} className="text-red-400 hover:text-red-600 px-2 text-sm transition">✕</button></div>))}<button onClick={addF} className="text-sm text-amber-700 font-medium hover:text-amber-900 transition">+ Tambah Rasa</button></div>
    <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-2">📏 Pilihan Ukuran</label>{fm.sizes.map((s,i)=>(<div key={i} className="flex gap-2 mb-2"><input value={s.name} onChange={e=>upS(i,"name",e.target.value)} placeholder="Nama ukuran" className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><input type="number" value={s.add} onChange={e=>upS(i,"add",e.target.value)} placeholder="+Harga" className="w-28 border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><button onClick={()=>rmS(i)} className="text-red-400 hover:text-red-600 px-2 text-sm transition">✕</button></div>))}<button onClick={addS} className="text-sm text-amber-700 font-medium hover:text-amber-900 transition">+ Tambah Ukuran</button><p className="text-xs text-stone-400 mt-1">Harga 0 = harga dasar</p></div>
    <div className="flex gap-2"><Btn onClick={save} full disabled={sv}>{sv?"Menyimpan...":"💾 Simpan"}</Btn><Btn onClick={()=>setEd(null)} variant="ghost" full>Batal</Btn></div></div>);

  return(<div>
    <Btn onClick={()=>{setFm({name:"",price:"",category:"classic",subcategory:"",label:"",description:"",color:"#D4A574",image_url:"",flavors:[],sizes:[],discount:0,max_qty:0});setEd("new");}} full className="mb-5">+ Tambah Produk</Btn>
    {products.map(p=>(<div key={p.id} className={`bg-white rounded-2xl p-4 mb-2 shadow-sm border border-stone-100 ${p.is_sold_out?"opacity-60":""}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"><Img name={p.name} color={p.color} img={firstImg(p.image_url)} size="sm"/></div><div><p className="font-bold text-sm text-stone-800">{p.name}{p.is_sold_out&&<span className="text-red-500 text-xs font-normal ml-2">· Habis</span>}{p.discount>0&&<span className="text-emerald-600 text-xs font-normal ml-2">-{p.discount}%</span>}</p><p className="text-xs text-stone-400">{p.category==="special"?"Special":p.category==="savory"?"Savory":"Daily"} · {fmt(p.price)}{p.max_qty>0&&` · Max ${p.max_qty}`}</p></div></div>
      <div className="flex gap-1"><button onClick={async()=>{try{await dbSO(p.id,!p.is_sold_out);await rf();}catch{}}} className={`text-xs px-2 py-1 rounded-lg transition ${p.is_sold_out?"text-emerald-600 hover:bg-emerald-50":"text-orange-500 hover:bg-orange-50"}`}>{p.is_sold_out?"✅":"⛔"}</button><button onClick={()=>{const fl=jp(p.flavors,[]),sz=jp(p.sizes,[]);setFm({name:p.name,price:String(p.price),category:p.category,subcategory:"",label:p.label||"",description:p.description||"",color:p.color||"#D4A574",image_url:p.image_url||"",flavors:Array.isArray(fl)?fl:[],sizes:Array.isArray(sz)?sz:[],discount:p.discount||0,max_qty:p.max_qty||0});setEd(p.id);}} className="text-xs text-amber-700 px-2 py-1 hover:bg-amber-50 rounded-lg transition">✏️</button><button onClick={async()=>{try{await dbDP(p.id);await rf();}catch{}}} className="text-xs text-red-400 px-2 py-1 hover:bg-red-50 rounded-lg transition">🗑️</button></div></div></div>))}
  </div>);
};

const ACal = ({closedDates:cd,orders,quota,onToggle}) => {
  const [m,setM]=useState(new Date().getMonth());const [y,setY]=useState(new Date().getFullYear());const [busy,setBusy]=useState("");
  const dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay(),mn=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  return(<div className="bg-white rounded-2xl p-5 border border-stone-100"><div className="flex items-center justify-between mb-5"><button onClick={()=>{if(m===0){setM(11);setY(v=>v-1);}else setM(v=>v-1);}} className="text-stone-400 hover:text-stone-700 px-2 text-lg transition">‹</button><h3 className="font-bold text-stone-800">{mn[m]} {y}</h3><button onClick={()=>{if(m===11){setM(0);setY(v=>v+1);}else setM(v=>v+1);}} className="text-stone-400 hover:text-stone-700 px-2 text-lg transition">›</button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-2">{["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(d=><div key={d} className="font-medium text-stone-400 py-1">{d}</div>)}</div>
    <div className="grid grid-cols-7 gap-1 text-center text-sm">{Array(fd).fill(null).map((_,i)=><div key={`e${i}`}/>)}{Array.from({length:dim},(_,i)=>{const d=i+1,ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,ic=cd.some(c=>c.date===ds),oc=orders.filter(o=>o.pickup_date===ds).length;return<button key={d} onClick={async()=>{setBusy(ds);await onToggle(ds);setBusy("")}} disabled={busy===ds} className={`py-2.5 rounded-xl transition-all relative text-sm ${ic?"bg-red-100 text-red-700 font-bold":oc>=quota?"bg-orange-100 text-orange-700":"hover:bg-stone-100"}`}>{d}{oc>0&&!ic&&<span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400">{oc}</span>}</button>})}</div>
    <div className="flex gap-4 mt-4 text-xs text-stone-400"><span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 rounded-md"/> Tutup</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-orange-100 rounded-md"/> Penuh</span></div></div>);
};

const AStats = ({orders,settings:st,onRefresh:rf}) => {
  const today=new Date().toISOString().split("T")[0],tm=today.slice(0,7),ps=["paid","process","done","archived"];
  const watermark=parseInt(st?.stats_reset_id||"0");
  const scoped=orders.filter(o=>o.id>watermark);
  const dr=scoped.filter(o=>o.order_date===today&&ps.includes(o.status)).reduce((s,o)=>s+o.total,0);
  const mr=scoped.filter(o=>(o.order_date||"").startsWith(tm)&&ps.includes(o.status)).reduce((s,o)=>s+o.total,0);
  const up=scoped.filter(o=>o.status==="waiting").reduce((s,o)=>s+o.total,0);
  const totalOrders=scoped.filter(o=>ps.includes(o.status)).length;
  const uniqueCust=new Set(scoped.filter(o=>ps.includes(o.status)).map(o=>(o.customer_phone||"").replace(/\D/g,""))).size;
  const ordersToday=scoped.filter(o=>o.order_date===today&&ps.includes(o.status)).length;
  const ordersMonth=scoped.filter(o=>(o.order_date||"").startsWith(tm)&&ps.includes(o.status)).length;
  const pc={};scoped.forEach(o=>(o.items||[]).forEach(it=>{pc[it.name]=(pc[it.name]||0)+it.qty;}));const rk=Object.entries(pc).sort((a,b)=>b[1]-a[1]);
  const doReset=async()=>{if(!confirm("Reset statistik ke 0? Data pesanan lama tetap tersimpan, hanya tidak dihitung di statistik."))return;const maxId=orders.reduce((m,o)=>Math.max(m,o.id||0),0);try{await dbUS("stats_reset_id",String(maxId));if(rf)await rf();}catch{alert("Gagal reset, coba lagi.");}};
  const undoReset=async()=>{try{await dbUS("stats_reset_id","0");if(rf)await rf();}catch{alert("Gagal, coba lagi.");}};
  return(<div>
    <div className="grid grid-cols-2 gap-3 mb-4"><div className="bg-white rounded-2xl p-5 text-center shadow-sm border border-stone-100"><p className="text-[11px] text-stone-400 mb-1">Omzet Hari Ini</p><p className="text-lg font-bold text-emerald-600">{fmt(dr)}</p></div><div className="bg-white rounded-2xl p-5 text-center shadow-sm border border-stone-100"><p className="text-[11px] text-stone-400 mb-1">Omzet Bulan Ini</p><p className="text-lg font-bold text-emerald-600">{fmt(mr)}</p></div></div>
    <div className="bg-orange-50 rounded-2xl p-5 mb-4 text-center border border-orange-100"><p className="text-[11px] text-stone-400 mb-1">Belum Dibayar</p><p className="text-lg font-bold text-orange-600">{fmt(up)}</p></div>
    <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-stone-100"><h3 className="font-bold text-sm text-stone-800 mb-3">📦 Total Pesanan & Pelanggan</h3><div className="grid grid-cols-2 gap-3"><div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"/><p className="text-[11px] text-stone-400">Total Pesanan</p></div><p className="text-2xl font-bold text-stone-800">{totalOrders}</p><p className="text-[10px] text-stone-400 mt-0.5">{ordersToday} hari ini · {ordersMonth} bulan ini</p></div><div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/><p className="text-[11px] text-stone-400">Pelanggan Unik</p></div><p className="text-2xl font-bold text-stone-800">{uniqueCust}</p><p className="text-[10px] text-stone-400 mt-0.5">berdasarkan No HP</p></div></div></div>
    <div className="bg-stone-50 rounded-2xl p-4 mb-5 border border-stone-100 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-stone-600">🔄 Reset Statistik</p><p className="text-[11px] text-stone-400 mt-0.5">{watermark>0?`Terpasang dari order #${watermark}`:"Hitung semua pesanan"}</p></div>{watermark>0?<button onClick={undoReset} className="text-xs font-semibold text-amber-700 hover:text-amber-900 px-3 py-2 rounded-lg hover:bg-amber-50 transition whitespace-nowrap">Batalkan Reset</button>:<button onClick={doReset} className="text-xs font-semibold text-red-600 hover:text-white hover:bg-red-500 border border-red-200 px-3 py-2 rounded-lg transition whitespace-nowrap">Reset ke 0</button>}</div>
    <h3 className="font-bold text-sm text-stone-800 mb-3">🏆 Produk Terlaris</h3>{rk.length===0?<p className="text-sm text-stone-400">Belum ada data</p>:rk.map(([n,c],i)=>(<div key={n} className="bg-white rounded-2xl p-4 mb-2 flex items-center justify-between shadow-sm border border-stone-100"><div className="flex items-center gap-3"><span className="text-sm font-bold text-stone-300 w-6">#{i+1}</span><span className="text-sm font-semibold text-stone-800">{n}</span></div><span className="text-sm text-amber-800 font-bold">{c}×</span></div>))}
  </div>);
};

const ASettings = ({settings:st,onRefresh:rf}) => {
  const [v,setV]=useState(st);const [sv,setSv]=useState(false);const [saveErr,setSaveErr]=useState("");
  const isOpen=v.store_open!=="false";
  const save=async(k,val)=>{setSv(true);setSaveErr("");try{await dbUS(k,val);setV(x=>({...x,[k]:val}));if(rf)rf();}catch(e){setSaveErr("Gagal menyimpan: "+(e.message||"coba lagi"));}setSv(false);};
  const faqs=jp(v.faq_json,[]);
  const addFAQ=()=>{const n=[...faqs,{q:"",a:""}];save("faq_json",JSON.stringify(n));};
  const updFAQ=(i,k,val)=>{const n=faqs.map((f,j)=>j===i?{...f,[k]:val}:f);setV(x=>({...x,faq_json:JSON.stringify(n)}));};
  const rmFAQ=(i)=>{const n=faqs.filter((_,j)=>j!==i);save("faq_json",JSON.stringify(n));};
  const saveFAQ=()=>save("faq_json",v.faq_json);

  const vouchers=jp(v.vouchers_json,[]);
  const persistVouchers=(arr)=>save("vouchers_json",JSON.stringify(arr));
  const addVoucher=()=>persistVouchers([...vouchers,{code:"",type:"percentage",value:10,minOrder:0,maxDiscount:0,expiresAt:"",active:true,description:""}]);
  const updVoucher=(i,k,val)=>{const n=vouchers.map((vc,j)=>j===i?{...vc,[k]:val}:vc);setV(x=>({...x,vouchers_json:JSON.stringify(n)}));};
  const rmVoucher=(i)=>{if(!confirm("Hapus voucher ini?"))return;persistVouchers(vouchers.filter((_,j)=>j!==i));};
  const saveVouchers=()=>save("vouchers_json",v.vouchers_json);
  return(<div className="space-y-4">
    {saveErr&&<div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-2xl border border-red-200">⚠️ {saveErr}</div>}
    <div className={`rounded-2xl p-5 border-2 flex items-center justify-between ${isOpen?"bg-emerald-50 border-emerald-200":"bg-red-50 border-red-200"}`}><div><p className="font-bold text-stone-800">{isOpen?"🟢 Toko Buka":"🔴 Toko Tutup"}</p><p className="text-xs text-stone-400 mt-0.5">{isOpen?"Customer bisa order":"Customer tidak bisa order"}</p></div><button onClick={()=>save("store_open",isOpen?"false":"true")} className={`px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${isOpen?"bg-red-500 text-white hover:bg-red-600":"bg-emerald-600 text-white hover:bg-emerald-700"}`}>{isOpen?"Tutup Toko":"Buka Toko"}</button></div>

    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-4">📍 Info Toko</h3>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Tentang Toko</label><textarea value={v.store_about||""} onChange={e=>setV(x=>({...x,store_about:e.target.value}))} onBlur={()=>save("store_about",v.store_about||"")} rows={3} placeholder="Cerita singkat tentang toko..." className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Alamat</label><textarea value={v.store_address||""} onChange={e=>setV(x=>({...x,store_address:e.target.value}))} onBlur={()=>save("store_address",v.store_address||"")} rows={2} placeholder="Jl. ..." className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Link Google Maps</label><input value={v.store_maps_url||""} onChange={e=>setV(x=>({...x,store_maps_url:e.target.value}))} onBlur={()=>save("store_maps_url",v.store_maps_url||"")} placeholder="https://maps.app.goo.gl/..." className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Jam Operasional</label><textarea value={v.store_hours||""} onChange={e=>setV(x=>({...x,store_hours:e.target.value}))} onBlur={()=>save("store_hours",v.store_hours||"")} rows={2} placeholder="Senin-Sabtu: 08:00-20:00" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Info Pembayaran</label><textarea value={v.store_payment_info||""} onChange={e=>setV(x=>({...x,store_payment_info:e.target.value}))} onBlur={()=>save("store_payment_info",v.store_payment_info||"")} rows={3} placeholder="BCA 1234567890 a.n. ..." className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Minimum Order</label><input value={v.store_minimum_order||""} onChange={e=>setV(x=>({...x,store_minimum_order:e.target.value}))} onBlur={()=>save("store_minimum_order",v.store_minimum_order||"")} placeholder="Contoh: Rp 50.000 untuk delivery" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
    </div>

    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-4">❓ FAQ</h3>
      {faqs.map((f,i)=>(<div key={i} className="mb-3 bg-stone-50 rounded-2xl p-3"><div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-stone-500">Pertanyaan #{i+1}</span><button onClick={()=>rmFAQ(i)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button></div><input value={f.q} onChange={e=>updFAQ(i,"q",e.target.value)} onBlur={saveFAQ} placeholder="Pertanyaan..." className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white mb-2 focus:outline-none focus:ring-2 focus:ring-amber-300"/><textarea value={f.a} onChange={e=>updFAQ(i,"a",e.target.value)} onBlur={saveFAQ} rows={2} placeholder="Jawaban..." className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>))}
      <button onClick={addFAQ} className="text-sm text-amber-700 font-medium hover:text-amber-900 transition">+ Tambah FAQ</button>
    </div>

    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-1">🎟️ Kode Voucher / Promo</h3>
      <p className="text-xs text-stone-400 mb-4">Kode yang aktif dapat digunakan customer saat checkout</p>
      {vouchers.length===0&&<p className="text-sm text-stone-400 mb-3">Belum ada voucher</p>}
      {vouchers.map((vc,i)=>{const expired=vc.expiresAt&&new Date(vc.expiresAt+"T23:59:59")<new Date();return(<div key={i} className={`mb-3 bg-stone-50 rounded-2xl p-4 border ${expired?"border-red-200":"border-stone-100"}`}>
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-stone-500">Voucher #{i+1}</span><label className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={vc.active!==false} onChange={e=>{const n=vouchers.map((x,j)=>j===i?{...x,active:e.target.checked}:x);persistVouchers(n);}} className="w-4 h-4 accent-amber-700"/><span className={vc.active!==false?"text-emerald-700 font-semibold":"text-stone-400"}>{vc.active!==false?"Aktif":"Nonaktif"}</span></label>{expired&&<span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ Kedaluwarsa</span>}</div><button onClick={()=>rmVoucher(i)} className="text-red-400 hover:text-red-600 text-sm" title="Hapus voucher">🗑️</button></div>
        <div className="mb-2"><label className="block text-xs font-medium text-stone-500 mb-1">Kode</label><input value={vc.code||""} onChange={e=>updVoucher(i,"code",e.target.value.toUpperCase())} onBlur={saveVouchers} placeholder="HEMAT10" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="block text-xs font-medium text-stone-500 mb-1">Tipe</label><select value={vc.type||"percentage"} onChange={e=>{const n=vouchers.map((x,j)=>j===i?{...x,type:e.target.value}:x);persistVouchers(n);}} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"><option value="percentage">Persen (%)</option><option value="fixed">Nominal (Rp)</option></select></div>
          <div><label className="block text-xs font-medium text-stone-500 mb-1">{vc.type==="fixed"?"Potongan (Rp)":"Persen (%)"}</label><input type="number" min="0" value={vc.value||0} onChange={e=>updVoucher(i,"value",parseInt(e.target.value)||0)} onBlur={saveVouchers} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="block text-xs font-medium text-stone-500 mb-1">Min. Order (Rp)</label><input type="number" min="0" value={vc.minOrder||0} onChange={e=>updVoucher(i,"minOrder",parseInt(e.target.value)||0)} onBlur={saveVouchers} placeholder="0" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
          {vc.type==="percentage"&&<div><label className="block text-xs font-medium text-stone-500 mb-1">Maks. Diskon (Rp)</label><input type="number" min="0" value={vc.maxDiscount||0} onChange={e=>updVoucher(i,"maxDiscount",parseInt(e.target.value)||0)} onBlur={saveVouchers} placeholder="0 = tanpa batas" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>}
        </div>
        <div className="mb-2"><label className="block text-xs font-medium text-stone-500 mb-1">Berlaku sampai <span className="text-stone-400">(opsional)</span></label><input type="date" value={vc.expiresAt||""} onChange={e=>updVoucher(i,"expiresAt",e.target.value)} onBlur={saveVouchers} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
        <div><label className="block text-xs font-medium text-stone-500 mb-1">Deskripsi <span className="text-stone-400">(opsional)</span></label><input value={vc.description||""} onChange={e=>updVoucher(i,"description",e.target.value)} onBlur={saveVouchers} placeholder="Contoh: Promo lebaran" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      </div>);})}
      <button onClick={addVoucher} className="text-sm text-amber-700 font-medium hover:text-amber-900 transition">+ Tambah Voucher</button>
    </div>

    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-4">⚙️ Pengaturan Umum</h3>
      <ImgUp value={v.hero_bg||""} onChange={val=>save("hero_bg",val)} label="Background Homepage"/>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Kuota Order/Hari</label><input type="number" value={v.daily_quota||"20"} onChange={e=>setV(x=>({...x,daily_quota:e.target.value}))} onBlur={()=>save("daily_quota",v.daily_quota)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Lead Time Daily/Savory (hari)</label><input type="number" value={v.lead_time_classic||"0"} onChange={e=>setV(x=>({...x,lead_time_classic:e.target.value}))} onBlur={()=>save("lead_time_classic",v.lead_time_classic)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/><p className="text-xs text-stone-400 mt-1">0 = same day</p></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Lead Time Special (hari)</label><input type="number" value={v.lead_time_special||"5"} onChange={e=>setV(x=>({...x,lead_time_special:e.target.value}))} onBlur={()=>save("lead_time_special",v.lead_time_special)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300"/></div>
      {sv&&<p className="text-xs text-amber-600">Menyimpan...</p>}
    </div>
  </div>);
};

const ASchedule = ({products,settings:st,onRefresh:rf}) => {
  const [sched,setSched]=useState(()=>readSchedIds(st.daily_schedule_json));
  const [day,setDay]=useState(todayKey());const [sv,setSv]=useState(false);const [err,setErr]=useState("");
  const classic=products.filter(p=>p.category==="classic"||p.category==="harian");
  const ids=sched[day]||[];
  const persist=async(next)=>{setSv(true);setErr("");try{await dbUS("daily_schedule_json",JSON.stringify(next));setSched(next);if(rf)rf();}catch(e){setErr("Gagal menyimpan: "+(e.message||"coba lagi"));}setSv(false);};
  const toggle=(pid)=>{const cur=ids.includes(pid)?ids.filter(x=>x!==pid):[...ids,pid];persist({...sched,[day]:cur});};
  const setAll=(on)=>persist({...sched,[day]:on?classic.map(p=>p.id):[]});
  const copyFrom=(srcKey)=>{if(!confirm(`Salin jadwal ${DAYS.find(x=>x.key===srcKey).label} ke ${DAYS.find(x=>x.key===day).label}?`))return;persist({...sched,[day]:[...(sched[srcKey]||[])]});};

  return(<div className="space-y-4">
    {err&&<div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-2xl border border-red-200">⚠️ {err}</div>}
    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-1">🗓️ Jadwal Produk Daily Harian</h3>
      <p className="text-xs text-stone-400 mb-4">Centang produk yang tersedia tiap hari. Customer akan lihat produk hari ini di beranda. Hari ini: <span className="font-semibold text-amber-700">{todayLabel()}</span></p>
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">{DAYS.map(dd=>(<button key={dd.key} onClick={()=>setDay(dd.key)} className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${day===dd.key?"bg-amber-800 text-white shadow":"bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>{dd.label}{dd.key===todayKey()&&" ·"}{(sched[dd.key]||[]).length>0&&<span className="ml-1 text-[10px] opacity-70">({(sched[dd.key]||[]).length})</span>}</button>))}</div>

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap"><p className="text-sm font-semibold text-stone-700">Menu {DAYS.find(x=>x.key===day).label}</p><div className="flex gap-2 items-center"><button onClick={()=>setAll(true)} className="text-xs text-amber-700 hover:text-amber-900 font-medium">Centang semua</button><span className="text-stone-300">·</span><button onClick={()=>setAll(false)} className="text-xs text-stone-500 hover:text-red-600 font-medium">Kosongkan</button><select onChange={e=>{if(e.target.value){copyFrom(e.target.value);e.target.value="";}}} className="text-xs border border-stone-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"><option value="">Salin dari...</option>{DAYS.filter(d=>d.key!==day).map(d=>(<option key={d.key} value={d.key}>{d.label} ({(sched[d.key]||[]).length})</option>))}</select></div></div>

      {classic.length===0&&<p className="text-sm text-stone-400 mb-3">Belum ada produk Daily. Tambahkan dulu di tab Menu.</p>}
      {classic.map(p=>{const on=ids.includes(p.id);return(<label key={p.id} className={`flex items-center gap-3 p-3 mb-2 rounded-xl border cursor-pointer transition ${on?"bg-amber-50 border-amber-200":"bg-stone-50 border-stone-100 hover:border-amber-200"}`}>
        <input type="checkbox" checked={on} onChange={()=>toggle(p.id)} className="w-5 h-5 accent-amber-700"/>
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><Img name={p.name} color={p.color} img={firstImg(p.image_url)} size="sm"/></div>
        <div className="flex-1 min-w-0"><p className="font-semibold text-sm text-stone-800 truncate">{p.name}</p><p className="text-xs text-stone-400">{fmt(p.price)}{p.is_sold_out&&" · Habis"}</p></div>
      </label>);})}
      {sv&&<p className="text-xs text-amber-600 mt-2">Menyimpan...</p>}
    </div>
  </div>);
};

const Admin = ({onLogout}) => {
  const [tab,setTab]=useState("orders");
  const [products,setProducts]=useState([]);const [orders,setOrders]=useState([]);const [allOrders,setAllOrders]=useState([]);const [cd,setCd]=useState([]);const [settings,setSettings]=useState({});const [loading,setLoading]=useState(true);
  const [prevOrderCount,setPrevOrderCount]=useState(0);const [newCount,setNewCount]=useState(0);
  const notifAudio=useRef(null);

  const load=async()=>{try{const [p,o,ao,c,s]=await Promise.all([dbP(),dbO(),dbAO(),dbCD(),dbS()]);setProducts(p||[]);const newOrders=o||[];setAllOrders(ao||[]);setCd(c||[]);const sm={};(s||[]).forEach(x=>sm[x.key]=x.value);setSettings(sm);
    const waitingCount=newOrders.filter(x=>x.status==="waiting").length;
    if(prevOrderCount>0&&waitingCount>prevOrderCount){setNewCount(waitingCount);try{notifAudio.current?.play();}catch{}}
    setPrevOrderCount(waitingCount);setOrders(newOrders);
  }catch(e){console.error(e);}setLoading(false);};

  useEffect(()=>{load();const iv=setInterval(load,30000);return()=>clearInterval(iv);},[]);

  const tabs=[{id:"orders",icon:"📋",label:"Pesanan"},{id:"menu",icon:"🍰",label:"Menu"},{id:"schedule",icon:"🗓️",label:"Jadwal"},{id:"calendar",icon:"📅",label:"Kalender"},{id:"stats",icon:"📊",label:"Statistik"},{id:"settings",icon:"⚙️",label:"Setting"}];
  const toggle=async ds=>{await dbTD(ds);const c=await dbCD();setCd(c||[]);};

  return(<div className="min-h-screen bg-stone-50">
    <audio ref={notifAudio} preload="auto"><source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LkZeYm5eTjYF0ZVlUX2x5hpGZoKSnpqGblI2BdGhcUlRdanmGkZmgpKempqGblI2BdGhdUVRdanmGkZmgpKempaGblI2BdGhcUlReanyHkpmgoqWmpqKcl4+Ee29kXFhbZXB+ipOaoaSlpaSgm5WNgndsYFdVXGhzhI+Yn6OlpqWhn5qUjIF2a2BYVV1odIOQmJ+jpaalop+blJCFem9kXVpdZ3OBjpifoqWmpqShnpqTi4F2bGJcW19odo=" type="audio/wav"/></audio>
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-stone-100 px-4 py-3.5 flex items-center justify-between"><h1 className="font-bold text-stone-800">Admin SJB</h1><button onClick={()=>{logoutAuth();onLogout();}} className="text-xs text-red-400 hover:text-red-600 font-medium transition">Logout</button></header>
    <div className="px-4 py-5 pb-24">{loading?<Spin text="Memuat data..."/>:<>
      {tab==="orders"&&<AOrders orders={orders} onRefresh={load} newCount={newCount}/>}
      {tab==="menu"&&<AMenu products={products} onRefresh={load}/>}
      {tab==="schedule"&&<ASchedule products={products} settings={settings} onRefresh={load}/>}
      {tab==="calendar"&&<ACal closedDates={cd} orders={orders} quota={parseInt(settings.daily_quota||"20")} onToggle={toggle}/>}
      {tab==="stats"&&<AStats orders={allOrders} settings={settings} onRefresh={load}/>}
      {tab==="settings"&&<ASettings settings={settings} onRefresh={load}/>}
    </>}</div>
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-stone-100 flex z-30">{tabs.map(t=><button key={t.id} onClick={()=>{setTab(t.id);if(t.id==="orders")setNewCount(0);}} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[11px] transition relative ${tab===t.id?"text-amber-800 font-bold":"text-stone-400"}`}><span className="text-lg">{t.icon}</span>{t.label}{t.id==="orders"&&newCount>0&&<span className="absolute top-1 right-1/4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center" style={{width:18,height:18}}>{newCount}</span>}</button>)}</nav>
  </div>);
};

/* ── MAIN ── */

export default function App(){
  const [pg,setPg]=useState("home");const [cat,setCat]=useState("");const [pid,setPid]=useState(null);
  const [cart,d]=useReducer(cR,[]);const [co,setCo]=useState(null);
  const [isA,setIsA]=useState(()=>typeof window!=="undefined"&&window.location.pathname.replace(/\/+$/,"")==="/admin");const [aLog,setALog]=useState(false);const [ok,setOk]=useState(false);
  const [products,setProducts]=useState([]);const [orders,setOrders]=useState([]);const [cd,setCd]=useState([]);const [st,setSt]=useState({});const [ld,setLd]=useState(true);

  const goH=()=>{setPg("home");setCat("");setPid(null);if(typeof window!=="undefined"&&window.location.pathname!=="/"){window.history.pushState({},"","/");}};

  useEffect(()=>{(async()=>{try{const [p,s]=await Promise.all([dbP(),dbS()]);setProducts(p||[]);const sm={};(s||[]).forEach(x=>sm[x.key]=x.value);setSt(sm);}catch(e){console.error(e);}setLd(false);})();},[]);
  useEffect(()=>{const onPop=()=>setIsA(window.location.pathname.replace(/\/+$/,"")==="/admin");window.addEventListener("popstate",onPop);return()=>window.removeEventListener("popstate",onPop);},[]);
  const openAdmin=()=>{if(typeof window!=="undefined")window.history.pushState({},"","/admin");setIsA(true);};
  const closeAdmin=()=>{setALog(false);setIsA(false);if(typeof window!=="undefined")window.history.pushState({},"","/");};

  const loadCO=async()=>{try{const [o,c]=await Promise.all([dbO(),dbCD()]);setOrders(o||[]);setCd(c||[]);}catch(e){console.error(e);}};

  if(isA){if(!aLog)return<ALogin onLogin={()=>setALog(true)}/>;return<Admin onLogout={closeAdmin}/>;}

  const storeOpen=st.store_open!=="false";
  if(!ld&&!storeOpen&&!isA) return(<><StoreClosed/><div className="fixed bottom-4 left-4 z-50"><button onClick={openAdmin} className="text-stone-300 hover:text-stone-500 transition p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button></div></>);

  if(ok)return(<div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center px-5"><div className="text-center"><div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5"><span className="text-4xl">✅</span></div><h2 className="text-xl font-bold text-stone-800 mb-2">Order Terkirim!</h2><p className="text-sm text-stone-400 mb-8 max-w-xs mx-auto leading-relaxed">Lanjutkan di WhatsApp untuk konfirmasi pembayaran.</p><Btn onClick={()=>{d({type:"CLR"});setCo(null);setOk(false);goH();}}>🏠 Kembali ke Beranda</Btn></div></div>);

  const pr=pid?products.find(p=>p.id===pid):null;

  return(<>
    {pg==="home"&&<Home products={products} onCat={c=>{setCat(c);setPg("cat")}} onProd={id=>{setPid(id);setPg("prod")}} cart={cart} onCart={()=>setPg("cart")} heroBg={st.hero_bg||""} loading={ld} onTrack={()=>setPg("track")} onInfo={()=>setPg("info")} onFAQ={()=>setPg("faq")} schedIds={readSchedIds(st.daily_schedule_json)}/>}
    {pg==="track"&&<Tracking onBack={goH} onHome={goH}/>}
    {pg==="info"&&<StoreInfo settings={st} onBack={goH} onHome={goH}/>}
    {pg==="faq"&&<FAQ settings={st} onBack={goH} onHome={goH}/>}
    {pg==="cat"&&<Catalog products={products} category={cat} onProd={id=>{setPid(id);setPg("prod")}} onBack={goH} cart={cart} onCart={()=>setPg("cart")} onHome={goH} schedIds={readSchedIds(st.daily_schedule_json)}/>}
    {pg==="prod"&&pr&&<Product product={pr} onBack={()=>setPg(cat?"cat":"home")} onAdd={it=>{d({type:"ADD",item:it});setPg("cart")}} cart={cart} onCart={()=>setPg("cart")} onHome={goH}/>}
    {pg==="cart"&&<Cart cart={cart} dispatch={d} onCheckout={async()=>{await loadCO();setPg("co")}} onBack={()=>setPg("home")} onHome={goH}/>}
    {pg==="co"&&<Checkout cart={cart} settings={st} orders={orders} closedDates={cd} onSubmit={x=>{setCo(x);setPg("prev")}} onBack={()=>setPg("cart")} onHome={goH}/>}
    {pg==="prev"&&co&&<Preview cart={cart} checkout={co} onSend={()=>setOk(true)} onBack={()=>setPg("co")} onHome={goH}/>}
    {pg==="home"&&<div className="bg-stone-100 py-8 px-5"><div className="flex items-center justify-between"><button onClick={openAdmin} className="text-stone-300 hover:text-stone-500 transition p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button><p className="text-[11px] text-stone-400">© 2026 Sinar Jaya Bakery</p></div></div>}
  </>);
}
