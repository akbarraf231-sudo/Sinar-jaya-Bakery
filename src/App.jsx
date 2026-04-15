import { useState, useReducer, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = "https://epydslvgxgucjemzfuxn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVweWRzbHZneGd1Y2plbXpmdXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjE4NjQsImV4cCI6MjA5MTc5Nzg2NH0.0xFvwqwixO1hTBWVIugGmxOObRAaV31CP0MOcBBbDVA";
const WA_NUMBER = "6285745754951";

let accessToken = null;

const sb = async (path, { method = "GET", body, headers: extra = {} } = {}) => {
  const h = { "apikey": SUPABASE_KEY, "Content-Type": "application/json", ...extra };
  h["Authorization"] = `Bearer ${accessToken || SUPABASE_KEY}`;
  const r = await fetch(`${SUPABASE_URL}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
};

const sbAuth = async (email, password) => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) throw new Error("Login gagal");
  const data = await r.json();
  accessToken = data.access_token;
  return data;
};
const sbLogout = () => { accessToken = null; };

const dbProducts = () => sb("/rest/v1/products?is_active=eq.true&order=id.asc", { headers: { "Prefer": "return=representation" } });
const dbOrders = () => sb("/rest/v1/orders?status=neq.archived&order=id.desc", { headers: { "Prefer": "return=representation" } });
const dbAllOrders = () => sb("/rest/v1/orders?order=id.desc", { headers: { "Prefer": "return=representation" } });
const dbClosedDates = () => sb("/rest/v1/closed_dates?order=date.asc", { headers: { "Prefer": "return=representation" } });
const dbSettings = () => sb("/rest/v1/settings?order=id.asc", { headers: { "Prefer": "return=representation" } });
const dbInsertOrder = (o) => sb("/rest/v1/orders", { method: "POST", body: o, headers: { "Prefer": "return=representation" } });
const dbUpdateOrder = (id, d) => sb(`/rest/v1/orders?id=eq.${id}`, { method: "PATCH", body: d, headers: { "Prefer": "return=representation" } });
const dbDeleteOrder = (id) => sb(`/rest/v1/orders?id=eq.${id}`, { method: "PATCH", body: { status: "archived" }, headers: { "Prefer": "return=representation" } });
const dbInsertProduct = (p) => sb("/rest/v1/products", { method: "POST", body: p, headers: { "Prefer": "return=representation" } });
const dbUpdateProduct = (id, p) => sb(`/rest/v1/products?id=eq.${id}`, { method: "PATCH", body: p, headers: { "Prefer": "return=representation" } });
const dbDeleteProduct = (id) => sb(`/rest/v1/products?id=eq.${id}`, { method: "PATCH", body: { is_active: false }, headers: { "Prefer": "return=representation" } });
const dbToggleSoldOut = (id, val) => sb(`/rest/v1/products?id=eq.${id}`, { method: "PATCH", body: { is_sold_out: val }, headers: { "Prefer": "return=representation" } });
const dbToggleDate = async (ds) => {
  const ex = await sb(`/rest/v1/closed_dates?date=eq.${ds}`, { headers: { "Prefer": "return=representation" } });
  if (ex && ex.length > 0) { await sb(`/rest/v1/closed_dates?date=eq.${ds}`, { method: "DELETE" }); return false; }
  else { await sb("/rest/v1/closed_dates", { method: "POST", body: { date: ds }, headers: { "Prefer": "return=representation" } }); return true; }
};
const dbUpdateSetting = (k, v) => sb(`/rest/v1/settings?key=eq.${k}`, { method: "PATCH", body: { value: v }, headers: { "Prefer": "return=representation" } });
const dbGenOrderNum = () => sb("/rest/v1/rpc/generate_order_number", { method: "POST", body: {} });

const fmtPrice = (n) => "Rp " + n.toLocaleString("id-ID");
const dateFmt = (d) => {
  const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const mo = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${days[d.getDay()]}, ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;
};

const ProductImage = ({ name, color, img, size = "md" }) => {
  const s = { sm: "h-16 w-16 rounded-2xl", md: "h-36 w-full rounded-none", lg: "h-52 w-full rounded-none" };
  if (img) return <div className={`${s[size]} overflow-hidden`}><img src={img} alt={name} className="w-full h-full object-cover" /></div>;
  return <div className={`${s[size]} flex items-center justify-center text-white text-xs font-medium`} style={{ backgroundColor: color || "#D4A574" }}><span className="opacity-70 px-2 text-center">{name}</span></div>;
};

const cartReducer = (st, a) => {
  switch (a.type) {
    case "ADD": {
      const k = `${a.item.id}-${a.item.size||""}-${a.item.flavor||""}`;
      const ex = st.find(i => i.key === k);
      if (ex) return st.map(i => i.key === k ? { ...i, qty: i.qty + a.item.qty } : i);
      return [...st, { ...a.item, key: k }];
    }
    case "UPDATE_QTY": return a.qty <= 0 ? st.filter(i => i.key !== a.key) : st.map(i => i.key === a.key ? { ...i, qty: a.qty } : i);
    case "REMOVE": return st.filter(i => i.key !== a.key);
    case "CLEAR": return [];
    default: return st;
  }
};

/* ── UI Primitives ── */

const Badge = ({ children, variant = "default" }) => {
  const v = {
    default: "bg-amber-800/10 text-amber-900",
    best: "bg-orange-100 text-orange-800 border border-orange-200",
    rec: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    status_waiting: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    status_paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    status_process: "bg-blue-50 text-blue-700 border border-blue-200",
    status_done: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  return <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${v[variant] || v.default}`}>{children}</span>;
};

const Btn = ({ children, onClick, variant = "primary", full, disabled, className = "" }) => {
  const base = "font-semibold rounded-2xl transition-all duration-300 text-center active:scale-[0.97]";
  const sz = full ? "w-full py-3.5 px-5 text-[15px]" : "py-2.5 px-6 text-sm";
  const v = {
    primary: "bg-amber-800 text-white hover:bg-amber-900 shadow-lg shadow-amber-800/20",
    secondary: "bg-white/90 text-amber-900 border-2 border-amber-200 hover:bg-amber-50 backdrop-blur-sm",
    danger: "bg-red-500 text-white hover:bg-red-600",
    whatsapp: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20",
    ghost: "text-amber-800 hover:bg-amber-50",
  };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}>{children}</button>;
};

const Input = ({ label, required, ...props }) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-medium text-stone-600 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>}
    <input {...props} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent focus:bg-white transition" />
  </div>
);

const ImageUploader = ({ value, onChange, label = "Foto Produk" }) => {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const proc = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = (e) => onChange(e.target.result);
    r.readAsDataURL(f);
  }, [onChange]);
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-stone-600 mb-1.5">{label}</label>
      {value ? (
        <div className="relative rounded-2xl overflow-hidden">
          <img src={value} alt="Preview" className="w-full h-44 object-cover" />
          <button onClick={() => onChange("")} className="absolute top-3 right-3 bg-black/50 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-black/70">✕</button>
        </div>
      ) : (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) proc(e.dataTransfer.files[0]); }}
          onPaste={(e) => { const it = e.clipboardData?.items; if (it) for (let i = 0; i < it.length; i++) if (it[i].type.startsWith("image/")) { proc(it[i].getAsFile()); break; } }}
          tabIndex={0} onClick={() => ref.current?.click()}
          className={`w-full h-36 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${drag ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-amber-300 hover:bg-stone-50"}`}>
          <span className="text-3xl mb-2 opacity-40">📷</span>
          <p className="text-xs text-stone-400 text-center px-4">Klik, drag & drop, atau paste gambar</p>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files[0]) proc(e.target.files[0]); }} />
        </div>
      )}
    </div>
  );
};

const FloatingCart = ({ cart, onClick }) => {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  if (count === 0) return null;
  return (
    <button onClick={onClick} className="fixed bottom-20 right-4 z-40 bg-amber-800 text-white rounded-full flex items-center justify-center shadow-xl shadow-amber-900/30 hover:bg-amber-900 transition-all active:scale-90 hover:scale-105" style={{ width: 56, height: 56 }}>
      <span className="text-xl">🛒</span>
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold w-5.5 h-5.5 rounded-full flex items-center justify-center shadow-md" style={{width:22,height:22}}>{count}</span>
    </button>
  );
};

const Spinner = ({ text = "Memuat..." }) => (
  <div className="flex flex-col items-center justify-center py-20 text-stone-400">
    <div className="w-10 h-10 rounded-full animate-spin mb-4" style={{ borderWidth: 3, borderStyle: "solid", borderColor: "#E7E0D8", borderTopColor: "#92400E" }} />
    <p className="text-sm font-medium">{text}</p>
  </div>
);

const PageShell = ({ title, onBack, children, onHome }) => (
  <div className="min-h-screen bg-stone-50">
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-stone-100 px-4 py-3.5 flex items-center gap-3">
      {onBack && <button onClick={onBack} className="text-stone-400 hover:text-stone-700 text-lg transition">←</button>}
      {onHome && <button onClick={onHome} className="font-bold text-amber-800 text-lg tracking-tight">SJB</button>}
      {title && <h1 className="font-bold text-stone-800 text-[15px] truncate">{title}</h1>}
    </header>
    <main className="pb-28">{children}</main>
    <div className="fixed bottom-4 right-4 z-50">
      <a href={`https://wa.me/${WA_NUMBER}?text=Halo, saya butuh bantuan`} target="_blank" rel="noreferrer" className="bg-emerald-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 text-xl hover:bg-emerald-600 hover:scale-105 transition-all">💬</a>
    </div>
  </div>
);

/* ── CUSTOMER PAGES ── */

const HomePage = ({ products, onCategory, onProduct, cart, onCart, heroBg, loading }) => {
  const bestSellers = products.filter(p => p.label === "Best Seller").slice(0, 3);
  const heroStyle = heroBg ? { backgroundImage: `linear-gradient(to bottom, rgba(62,39,18,0.55), rgba(62,39,18,0.75)), url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
  return (
    <PageShell>
      <div className={`text-white px-6 pt-14 pb-12 text-center relative overflow-hidden ${!heroBg ? "bg-gradient-to-br from-amber-800 via-amber-900 to-stone-900" : ""}`} style={heroStyle}>
        <div className="relative z-10">
          <p className="text-amber-200/80 text-xs tracking-[0.2em] uppercase mb-3 font-medium">Homemade Bakery</p>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Sinar Jaya Bakery</h1>
          <p className="text-amber-100/70 text-sm mb-8 max-w-xs mx-auto leading-relaxed">Menyempurnakan setiap momen spesial dengan kue buatan tangan penuh cinta</p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <Btn onClick={() => onCategory("special")} full variant="secondary">🎉 Special Selection</Btn>
            <Btn onClick={() => onCategory("classic")} full variant="secondary">🍩 Classic Selection</Btn>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-4 relative z-10">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 flex items-center gap-3">
          <span className="text-lg">⚡</span>
          <p className="text-sm text-stone-600 flex-1"><span className="font-semibold text-amber-800">Slot terbatas</span> setiap hari — pesan sekarang!</p>
        </div>
      </div>

      <div className="px-5 py-8">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[
            { icon: "🌿", title: "Fresh Daily", desc: "Dibuat segar setiap hari" },
            { icon: "🎨", title: "Custom Order", desc: "Sesuai acara kamu" },
            { icon: "❤️", title: "Homemade", desc: "Buatan tangan, penuh cinta" },
          ].map((b, i) => (
            <div key={i} className="min-w-[140px] bg-white rounded-2xl p-4 shadow-sm border border-stone-100 text-center flex-shrink-0">
              <div className="text-2xl mb-2">{b.icon}</div>
              <p className="text-xs font-bold text-stone-800 mb-0.5">{b.title}</p>
              <p className="text-[10px] text-stone-400 leading-tight">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="px-5 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-[2px] bg-amber-300 rounded-full" />
            <h2 className="font-bold text-stone-800 text-lg">Favorit Pelanggan</h2>
          </div>
          <div className="flex flex-col gap-3">
            {bestSellers.map(p => (
              <button key={p.id} onClick={() => !p.is_sold_out && onProduct(p.id)} className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 text-left w-full flex group ${p.is_sold_out ? "opacity-60 cursor-not-allowed" : "hover:shadow-md hover:border-amber-200"} transition-all`}>
                <div className="w-28 min-h-[100px] flex-shrink-0 overflow-hidden relative">
                  <ProductImage name={p.name} color={p.color} img={p.image_url} size="md" />
                  {p.is_sold_out && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">Habis</span></div>}
                </div>
                <div className="flex-1 p-4 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-stone-800">{p.name}</span>
                    <Badge variant="best">⭐ Best Seller</Badge>
                  </div>
                  <p className="text-xs text-stone-400 mb-2 line-clamp-2 leading-relaxed">{p.recommendation}</p>
                  <span className={`font-bold ${p.is_sold_out ? "text-stone-400 line-through" : "text-amber-800"}`}>{fmtPrice(p.price)}</span>
                </div>
                <div className="flex items-center pr-4 text-stone-300 group-hover:text-amber-600 transition">›</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <FloatingCart cart={cart} onClick={onCart} />
    </PageShell>
  );
};

const CatalogPage = ({ products, category, onProduct, onBack, cart, onCart, onHome }) => {
  const filtered = products.filter(p => p.category === category);
  const title = category === "special" ? "Special Selection" : "Classic Selection";
  return (
    <PageShell title={title} onBack={onBack} onHome={onHome}>
      <div className="px-5 py-5">
        {category === "special" && <div className="bg-amber-50 text-amber-800 text-xs px-4 py-3 rounded-2xl mb-5 border border-amber-100">ℹ️ Pemesanan Special Selection minimal H-5 sebelum tanggal ambil</div>}
        {filtered.length === 0 ? <div className="text-center py-20 text-stone-300"><p className="text-5xl mb-4">🍰</p><p className="font-medium text-stone-400">Produk belum tersedia</p></div> : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => (
              <button key={p.id} onClick={() => !p.is_sold_out && onProduct(p.id)} className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 text-left group ${p.is_sold_out ? "opacity-60 cursor-not-allowed" : "hover:shadow-md hover:border-amber-200"} transition-all`}>
                <div className="overflow-hidden relative"><div className={`${p.is_sold_out ? "" : "group-hover:scale-105"} transition-transform duration-500`}><ProductImage name={p.name} color={p.color} img={p.image_url} size="md" /></div>{p.is_sold_out && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">Stok Habis</span></div>}</div>
                <div className="p-3.5">
                  <div className="flex items-center gap-1 mb-1.5 flex-wrap"><span className="font-bold text-sm text-stone-800">{p.name}</span>{p.label === "Best Seller" && <Badge variant="best">⭐</Badge>}{p.label === "Rekomendasi" && <Badge variant="rec">✓</Badge>}</div>
                  {p.portion && <p className="text-[11px] text-stone-400 mb-1">👥 {p.portion}</p>}
                  <p className="text-[11px] text-stone-400 mb-2 line-clamp-1">{p.recommendation}</p>
                  <p className={`font-bold text-sm ${p.is_sold_out ? "text-stone-400 line-through" : "text-amber-800"}`}>{fmtPrice(p.price)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <FloatingCart cart={cart} onClick={onCart} />
    </PageShell>
  );
};

const ProductPage = ({ product, onBack, onAddCart, cart, onCart, onHome }) => {
  const sizes = product.sizes || [], flavors = product.flavors || [];
  const [size, setSize] = useState(sizes.length > 0 ? 0 : -1);
  const [flavor, setFlavor] = useState(flavors.length > 0 ? flavors[0] : "");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const sizeAdd = size >= 0 ? sizes[size].add : 0;
  const unitPrice = product.price + sizeAdd;
  const total = unitPrice * qty;

  return (
    <PageShell title={product.name} onBack={onBack} onHome={onHome}>
      <ProductImage name={product.name} color={product.color} img={product.image_url} size="lg" />
      <div className="px-5 py-5">
        <div className="flex items-center gap-2 mb-2"><h2 className="text-xl font-bold text-stone-800">{product.name}</h2>{product.label === "Best Seller" && <Badge variant="best">⭐ Best Seller</Badge>}{product.label === "Rekomendasi" && <Badge variant="rec">✓ Rekomendasi</Badge>}</div>
        <p className="text-sm text-stone-500 mb-2 leading-relaxed">{product.description}</p>
        {product.portion && <p className="text-xs text-stone-400 mb-3">👥 Estimasi: {product.portion}</p>}
        {product.recommendation && <div className="bg-amber-50 text-amber-800 text-xs px-4 py-3 rounded-2xl mb-5 border border-amber-100">💡 {product.recommendation}</div>}

        {sizes.length > 0 && (
          <div className="mb-5"><p className="text-sm font-semibold text-stone-700 mb-2.5">Pilih Ukuran</p><div className="flex flex-col gap-2">
            {sizes.map((s, i) => <button key={i} onClick={() => setSize(i)} className={`border-2 rounded-2xl px-4 py-3 text-left text-sm transition-all ${i === size ? "border-amber-600 bg-amber-50 font-semibold text-amber-900" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>{s.name} — {fmtPrice(product.price + s.add)}</button>)}
          </div></div>
        )}
        {flavors.length > 0 && (
          <div className="mb-5"><p className="text-sm font-semibold text-stone-700 mb-2.5">Pilih Rasa</p><div className="flex flex-wrap gap-2">
            {flavors.map(f => <button key={f} onClick={() => setFlavor(f)} className={`border-2 rounded-full px-5 py-2 text-sm transition-all ${f === flavor ? "border-amber-600 bg-amber-50 font-semibold text-amber-900" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>{f}</button>)}
          </div></div>
        )}
        <div className="mb-5"><p className="text-sm font-semibold text-stone-700 mb-2.5">Jumlah</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-11 h-11 rounded-full border-2 border-stone-200 flex items-center justify-center text-lg font-bold text-stone-500 hover:border-amber-400 hover:text-amber-700 transition">−</button>
            <span className="text-xl font-bold w-8 text-center text-stone-800">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-11 h-11 rounded-full border-2 border-stone-200 flex items-center justify-center text-lg font-bold text-stone-500 hover:border-amber-400 hover:text-amber-700 transition">+</button>
          </div>
        </div>
        <div className="mb-6">
          <label className="text-sm font-semibold text-stone-700 mb-1.5 block">Catatan <span className="text-stone-400 font-normal text-xs">(opsional)</span></label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Tulisan di kue, request khusus, dll" className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white transition" />
        </div>
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 mb-5 flex items-center justify-between border border-amber-100">
          <span className="text-sm text-stone-600 font-medium">Total</span>
          <span className="text-2xl font-bold text-amber-800">{fmtPrice(total)}</span>
        </div>
        <Btn onClick={() => onAddCart({ id: product.id, name: product.name, color: product.color, img: product.image_url, size: size >= 0 ? sizes[size].name : "", flavor, qty, unitPrice, note, category: product.category })} full>🛒 Tambah ke Keranjang</Btn>
      </div>
      <FloatingCart cart={cart} onClick={onCart} />
    </PageShell>
  );
};

const CartPage = ({ cart, dispatch, onCheckout, onBack, onHome }) => {
  const total = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  return (
    <PageShell title="Keranjang" onBack={onBack} onHome={onHome}>
      <div className="px-5 py-5">
        {cart.length === 0 ? <div className="text-center py-20 text-stone-300"><p className="text-5xl mb-4">🛒</p><p className="font-medium text-stone-400">Belum ada pesanan</p></div> : (
          <>
            {cart.map(item => (
              <div key={item.key} className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-stone-100 flex gap-3">
                <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden"><ProductImage name={item.name} color={item.color} img={item.img} size="sm" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div><p className="font-bold text-stone-800 text-sm">{item.name}</p>{item.size && <p className="text-[11px] text-stone-400">{item.size}</p>}{item.flavor && <p className="text-[11px] text-stone-400">{item.flavor}</p>}{item.note && <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">📝 {item.note}</p>}</div>
                    <button onClick={() => dispatch({ type: "REMOVE", key: item.key })} className="text-stone-300 hover:text-red-500 text-sm ml-2 transition">✕</button>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 bg-stone-50 rounded-full px-1 py-0.5">
                      <button onClick={() => dispatch({ type: "UPDATE_QTY", key: item.key, qty: item.qty - 1 })} className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-bold text-stone-500">−</button>
                      <span className="font-bold text-sm w-5 text-center">{item.qty}</span>
                      <button onClick={() => dispatch({ type: "UPDATE_QTY", key: item.key, qty: item.qty + 1 })} className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-sm font-bold text-stone-500">+</button>
                    </div>
                    <p className="text-amber-800 font-bold text-sm">{fmtPrice(item.unitPrice * item.qty)}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 mb-5 flex items-center justify-between border border-amber-100">
              <span className="font-semibold text-stone-600">Total Pesanan</span>
              <span className="text-2xl font-bold text-amber-800">{fmtPrice(total)}</span>
            </div>
            <Btn onClick={onCheckout} full>Lanjut Pesan →</Btn>
          </>
        )}
      </div>
    </PageShell>
  );
};

const CheckoutPage = ({ cart, settings, orders, closedDates, onSubmit, onBack, onHome }) => {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [date, setDate] = useState(""); const [error, setError] = useState(""); const [sub, setSub] = useState(false);
  const hasSp = cart.some(i => i.category === "special");
  const ltc = parseInt(settings.lead_time_classic || "0"), lts = parseInt(settings.lead_time_special || "5");
  const ld = hasSp ? lts : ltc, quota = parseInt(settings.daily_quota || "20");
  const today = new Date(), minD = new Date(today); minD.setDate(minD.getDate() + ld);
  const minDS = minD.toISOString().split("T")[0];
  const ood = orders.filter(o => o.pickup_date === date).length;
  const isFull = hasSp && ood >= quota, isClosed = closedDates.some(d => d.date === date);
  const sl = hasSp ? Math.max(0, quota - ood) : null;

  const go = async () => {
    if (!name.trim()) return setError("Nama wajib diisi");
    if (!phone.trim()) return setError("Nomor HP wajib diisi");
    if (!date) return setError("Tanggal ambil wajib dipilih");
    if (isClosed) return setError("Tanggal ini tutup");
    if (isFull) return setError("Slot penuh");
    setError(""); setSub(true);
    try { const on = await dbGenOrderNum(); onSubmit({ name: name.trim(), phone: phone.trim(), date, orderNum: on }); }
    catch { setError("Gagal, coba lagi."); }
    setSub(false);
  };

  return (
    <PageShell title="Checkout" onBack={onBack} onHome={onHome}>
      <div className="px-5 py-5">
        {hasSp && <div className="bg-amber-50 text-amber-800 text-xs px-4 py-3 rounded-2xl mb-5 border border-amber-100">ℹ️ Pesanan Special Selection minimal H-{lts} sebelum tanggal ambil</div>}
        <Input label="Nama" required value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" />
        <Input label="Nomor HP" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" type="tel" />
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-600 mb-1.5">Tanggal Ambil<span className="text-red-400 ml-0.5">*</span></label>
          <input type="date" value={date} min={minDS} onChange={e => setDate(e.target.value)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white transition" />
          <p className="text-xs text-stone-400 mt-1.5">{hasSp ? `Minimal H-${lts} dari hari ini` : "Bisa same day"}</p>
        </div>
        {date && isClosed && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">❌ Tanggal ini sudah ditutup.</div>}
        {date && isFull && !isClosed && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">❌ Slot penuh.</div>}
        {date && !isClosed && !isFull && sl !== null && (
          <div className={`text-sm px-4 py-3 rounded-2xl mb-4 border ${sl <= 5 ? "bg-orange-50 text-orange-700 border-orange-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>{sl <= 5 ? `⚡ Sisa ${sl} slot — segera pesan!` : `✅ Tersedia (${sl} slot)`}</div>
        )}
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl mb-4 border border-red-100">⚠️ {error}</div>}
        <Btn onClick={go} full disabled={sub}>{sub ? "Memproses..." : "Lihat Preview →"}</Btn>
      </div>
    </PageShell>
  );
};

const PreviewPage = ({ cart, checkout, onSend, onBack, onHome }) => {
  const [sending, setSending] = useState(false);
  const total = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const pd = new Date(checkout.date + "T00:00:00");
  const oid = checkout.orderNum;
  const waText = `Halo, saya ingin order:%0A%0ANo Order: ${oid}%0ANama: ${checkout.name}%0A%0AProduk:%0A${cart.map(i => { let l = `- ${i.name} x${i.qty}`; if (i.size) l += ` (${i.size})`; if (i.flavor) l += ` — ${i.flavor}`; if (i.note) l += `%0A  Catatan: ${i.note}`; return l; }).join("%0A")}%0A%0ATanggal Ambil: ${dateFmt(pd)}%0ATotal: ${fmtPrice(total)}%0A%0AStatus: Menunggu Verifikasi`;
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

  const go = async () => {
    setSending(true);
    try {
      await dbInsertOrder({ order_number: oid, customer_name: checkout.name, customer_phone: checkout.phone, items: cart.map(i => ({ name: i.name, size: i.size, flavor: i.flavor, qty: i.qty, unitPrice: i.unitPrice })), total, note: cart.map(i => i.note).filter(Boolean).join("; "), pickup_date: checkout.date, status: "waiting" });
      window.open(waLink, "_blank"); onSend();
    } catch { alert("Gagal menyimpan order. Coba lagi."); }
    setSending(false);
  };

  return (
    <PageShell title="Preview Order" onBack={onBack} onHome={onHome}>
      <div className="px-5 py-5">
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 mb-5">
          <div className="text-center mb-5"><p className="text-[11px] text-stone-400 uppercase tracking-wider mb-1">No. Order</p><p className="text-xl font-bold text-amber-800">{oid}</p></div>
          <div className="border-t border-dashed border-stone-200 pt-4 mb-4 space-y-3">
            {cart.map(item => (
              <div key={item.key} className="flex justify-between items-start">
                <div className="flex-1"><p className="font-semibold text-stone-800 text-sm">{item.name} <span className="text-stone-400 font-normal">×{item.qty}</span></p>{item.size && <p className="text-[11px] text-stone-400">{item.size}</p>}{item.flavor && <p className="text-[11px] text-stone-400">{item.flavor}</p>}{item.note && <p className="text-[11px] text-stone-400">📝 {item.note}</p>}</div>
                <p className="font-semibold text-stone-700 text-sm">{fmtPrice(item.unitPrice * item.qty)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-200 pt-4 flex justify-between items-center mb-5"><span className="font-semibold text-stone-600">Total</span><span className="text-2xl font-bold text-amber-800">{fmtPrice(total)}</span></div>
          <div className="bg-stone-50 rounded-2xl p-4 text-sm text-stone-600 space-y-2"><p>👤 {checkout.name}</p><p>📱 {checkout.phone}</p><p>📅 {dateFmt(pd)}</p></div>
        </div>
        <Btn onClick={go} full variant="whatsapp" disabled={sending}>{sending ? "Mengirim..." : "📲 Kirim ke WhatsApp"}</Btn>
        <p className="text-xs text-center text-stone-400 mt-4">Jika WhatsApp tidak terbuka, <a href={waLink} target="_blank" rel="noreferrer" className="text-amber-700 underline">klik di sini</a></p>
      </div>
    </PageShell>
  );
};

/* ── ADMIN ── */
const AdminLogin = ({ onLogin }) => {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [err, setErr] = useState(""); const [ld, setLd] = useState(false);
  const go = async () => { setLd(true); setErr(""); try { await sbAuth(email, pass); onLogin(); } catch (e) { setErr("Login gagal: " + (e.message || "Coba lagi")); } setLd(false); };
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-7 w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-stone-800 mb-1">Admin Panel</h1>
        <p className="text-sm text-center text-stone-400 mb-6">Sinar Jaya Bakery</p>
        <Input label="Email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="Email admin" />
        <Input label="Password" type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} placeholder="••••••••" />
        {err && <p className="text-red-500 text-sm mb-3">⚠️ {err}</p>}
        <Btn onClick={go} full disabled={ld}>{ld ? "Masuk..." : "Masuk"}</Btn>
      </div>
    </div>
  );
};

const AdminOrders = ({ orders, onRefresh }) => {
  const [search, setSearch] = useState(""); const [fs, setFs] = useState("all"); const [busy, setBusy] = useState("");
  const sL = { waiting: "Menunggu", paid: "Lunas", process: "Diproses", done: "Selesai" };
  const sV = { waiting: "status_waiting", paid: "status_paid", process: "status_process", done: "status_done" };
  const sF = { waiting: "paid", paid: "process", process: "done" };
  let list = [...orders]; if (fs !== "all") list = list.filter(o => o.status === fs);
  if (search) list = list.filter(o => o.customer_name.toLowerCase().includes(search.toLowerCase()) || o.customer_phone.includes(search) || o.order_number.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <Input placeholder="Cari nama / no HP / no order..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {["all","waiting","paid","process","done"].map(s => <button key={s} onClick={() => setFs(s)} className={`text-xs px-4 py-2 rounded-full whitespace-nowrap border-2 transition-all font-medium ${s === fs ? "bg-amber-800 text-white border-amber-800" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>{s === "all" ? "Semua" : sL[s]}</button>)}
      </div>
      {list.length === 0 ? <div className="text-center py-12 text-stone-300"><p className="text-4xl mb-3">📋</p><p className="text-stone-400">Belum ada pesanan</p></div> : list.map(o => (
        <div key={o.id} className="bg-white rounded-2xl p-5 mb-3 shadow-sm border border-stone-100">
          <div className="flex items-center justify-between mb-3"><span className="font-bold text-sm text-stone-800">{o.order_number}</span><Badge variant={sV[o.status]}>{sL[o.status]}</Badge></div>
          <p className="text-sm text-stone-600">👤 {o.customer_name} · 📱 {o.customer_phone}</p>
          <div className="mt-2 text-xs text-stone-400">{(o.items||[]).map((it,i) => <p key={i}>{it.name} ×{it.qty}{it.size ? ` (${it.size})` : ""}{it.flavor ? ` — ${it.flavor}` : ""}</p>)}</div>
          {o.note && <p className="text-xs text-stone-400 mt-1">📝 {o.note}</p>}
          <div className="flex items-center justify-between mt-3 text-xs text-stone-400"><span>📅 {o.pickup_date}</span><span className="font-bold text-amber-800 text-sm">{fmtPrice(o.total)}</span></div>
          <div className="flex gap-2 mt-4">
            {sF[o.status] && <Btn onClick={async () => { setBusy(o.order_number); try { await dbUpdateOrder(o.id, { status: sF[o.status] }); await onRefresh(); } catch {} setBusy(""); }} variant="primary" className="text-xs flex-1" disabled={busy === o.order_number}>{o.status === "waiting" ? "💰 Tandai Bayar" : o.status === "paid" ? "⚙️ Proses" : "✅ Selesai"}</Btn>}
            {o.status === "done" && <Btn onClick={async () => { setBusy(o.order_number); try { await dbDeleteOrder(o.id); await onRefresh(); } catch {} setBusy(""); }} variant="danger" className="text-xs" disabled={busy === o.order_number}>🗑️</Btn>}
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminMenu = ({ products, onRefresh }) => {
  const [ed, setEd] = useState(null);
  const [fm, setFm] = useState({ name:"", price:"", category:"classic", label:"", description:"", color:"#D4A574", image_url:"" });
  const [sv, setSv] = useState(false);
  const save = async () => {
    if (!fm.name || !fm.price) return; setSv(true);
    const d = { name:fm.name, price:Number(fm.price), category:fm.category, label:fm.label, description:fm.description, color:fm.color, image_url:fm.image_url };
    try { if (ed === "new") await dbInsertProduct(d); else await dbUpdateProduct(ed, d); await onRefresh(); setEd(null); } catch { alert("Gagal menyimpan"); }
    setSv(false);
  };

  if (ed !== null) return (
    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-4">{ed === "new" ? "Tambah Produk" : "Edit Produk"}</h3>
      <ImageUploader value={fm.image_url} onChange={v => setFm(f => ({ ...f, image_url: v }))} />
      <Input label="Nama" value={fm.name} onChange={e => setFm(f => ({ ...f, name: e.target.value }))} />
      <Input label="Harga" type="number" value={fm.price} onChange={e => setFm(f => ({ ...f, price: e.target.value }))} />
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Kategori</label><select value={fm.category} onChange={e => setFm(f => ({ ...f, category: e.target.value }))} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50"><option value="classic">Classic</option><option value="special">Special</option></select></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Label</label><select value={fm.label} onChange={e => setFm(f => ({ ...f, label: e.target.value }))} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50"><option value="">Tanpa</option><option value="Best Seller">Best Seller</option><option value="Rekomendasi">Rekomendasi</option></select></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Warna Placeholder</label><input type="color" value={fm.color} onChange={e => setFm(f => ({ ...f, color: e.target.value }))} className="w-12 h-10 rounded-xl border-0 cursor-pointer" /></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Deskripsi</label><textarea value={fm.description} onChange={e => setFm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
      <div className="flex gap-2"><Btn onClick={save} full disabled={sv}>{sv ? "Menyimpan..." : "💾 Simpan"}</Btn><Btn onClick={() => setEd(null)} variant="ghost" full>Batal</Btn></div>
    </div>
  );

  return (
    <div>
      <Btn onClick={() => { setFm({ name:"", price:"", category:"classic", label:"", description:"", color:"#D4A574", image_url:"" }); setEd("new"); }} full className="mb-5">+ Tambah Produk</Btn>
      {products.map(p => (
        <div key={p.id} className={`bg-white rounded-2xl p-4 mb-2 shadow-sm border border-stone-100 ${p.is_sold_out ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"><ProductImage name={p.name} color={p.color} img={p.image_url} size="sm" /></div><div><p className="font-bold text-sm text-stone-800">{p.name}{p.is_sold_out && <span className="text-red-500 text-xs font-normal ml-2">· Habis</span>}</p><p className="text-xs text-stone-400">{p.category === "special" ? "Special" : "Classic"} · {fmtPrice(p.price)}</p></div></div>
            <div className="flex gap-1">
              <button onClick={async () => { try { await dbToggleSoldOut(p.id, !p.is_sold_out); await onRefresh(); } catch {} }} className={`text-xs px-2 py-1 rounded-lg transition ${p.is_sold_out ? "text-emerald-600 hover:bg-emerald-50" : "text-orange-500 hover:bg-orange-50"}`}>{p.is_sold_out ? "✅" : "⛔"}</button>
              <button onClick={() => { setFm({ name:p.name, price:String(p.price), category:p.category, label:p.label||"", description:p.description||"", color:p.color||"#D4A574", image_url:p.image_url||"" }); setEd(p.id); }} className="text-xs text-amber-700 px-2 py-1 hover:bg-amber-50 rounded-lg transition">✏️</button>
              <button onClick={async () => { try { await dbDeleteProduct(p.id); await onRefresh(); } catch {} }} className="text-xs text-red-400 px-2 py-1 hover:bg-red-50 rounded-lg transition">🗑️</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminCalendar = ({ closedDates, orders, quota, onToggle }) => {
  const [m, setM] = useState(new Date().getMonth()); const [y, setY] = useState(new Date().getFullYear()); const [busy, setBusy] = useState("");
  const dim = new Date(y, m + 1, 0).getDate(); const fd = new Date(y, m, 1).getDay();
  const mn = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  return (
    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => { if (m === 0) { setM(11); setY(v => v-1); } else setM(v => v-1); }} className="text-stone-400 hover:text-stone-700 px-2 text-lg transition">‹</button>
        <h3 className="font-bold text-stone-800">{mn[m]} {y}</h3>
        <button onClick={() => { if (m === 11) { setM(0); setY(v => v+1); } else setM(v => v+1); }} className="text-stone-400 hover:text-stone-700 px-2 text-lg transition">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-2">{["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(d => <div key={d} className="font-medium text-stone-400 py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {Array(fd).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: dim }, (_, i) => {
          const d = i+1, ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const ic = closedDates.some(cd => cd.date === ds), oc = orders.filter(o => o.pickup_date === ds).length;
          return <button key={d} onClick={async () => { setBusy(ds); await onToggle(ds); setBusy(""); }} disabled={busy === ds} className={`py-2.5 rounded-xl transition-all relative text-sm ${ic ? "bg-red-100 text-red-700 font-bold" : oc >= quota ? "bg-orange-100 text-orange-700" : "hover:bg-stone-100"}`}>{d}{oc > 0 && !ic && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400">{oc}</span>}</button>;
        })}
      </div>
      <div className="flex gap-4 mt-4 text-xs text-stone-400"><span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 rounded-md" /> Tutup</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-orange-100 rounded-md" /> Penuh</span></div>
    </div>
  );
};

const AdminStats = ({ orders }) => {
  const today = new Date().toISOString().split("T")[0], tm = today.slice(0,7), ps = ["paid","process","done","archived"];
  const dr = orders.filter(o => o.order_date === today && ps.includes(o.status)).reduce((s,o) => s+o.total, 0);
  const mr = orders.filter(o => (o.order_date||"").startsWith(tm) && ps.includes(o.status)).reduce((s,o) => s+o.total, 0);
  const up = orders.filter(o => o.status === "waiting").reduce((s,o) => s+o.total, 0);
  const pc = {}; orders.forEach(o => (o.items||[]).forEach(it => { pc[it.name] = (pc[it.name]||0) + it.qty; }));
  const rk = Object.entries(pc).sort((a,b) => b[1]-a[1]);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-5 text-center shadow-sm border border-stone-100"><p className="text-[11px] text-stone-400 mb-1">Hari Ini</p><p className="text-lg font-bold text-emerald-600">{fmtPrice(dr)}</p></div>
        <div className="bg-white rounded-2xl p-5 text-center shadow-sm border border-stone-100"><p className="text-[11px] text-stone-400 mb-1">Bulan Ini</p><p className="text-lg font-bold text-emerald-600">{fmtPrice(mr)}</p></div>
      </div>
      <div className="bg-orange-50 rounded-2xl p-5 mb-5 text-center border border-orange-100"><p className="text-[11px] text-stone-400 mb-1">Belum Dibayar</p><p className="text-lg font-bold text-orange-600">{fmtPrice(up)}</p></div>
      <h3 className="font-bold text-sm text-stone-800 mb-3">Produk Terlaris</h3>
      {rk.length === 0 ? <p className="text-sm text-stone-400">Belum ada data</p> : rk.map(([n,c],i) => (
        <div key={n} className="bg-white rounded-2xl p-4 mb-2 flex items-center justify-between shadow-sm border border-stone-100"><div className="flex items-center gap-3"><span className="text-sm font-bold text-stone-300 w-6">#{i+1}</span><span className="text-sm font-semibold text-stone-800">{n}</span></div><span className="text-sm text-amber-800 font-bold">{c}×</span></div>
      ))}
    </div>
  );
};

const AdminSettings = ({ settings }) => {
  const [v, setV] = useState(settings); const [sv, setSv] = useState(false);
  const save = async (k, val) => { setSv(true); try { await dbUpdateSetting(k, val); setV(x => ({ ...x, [k]: val })); } catch {} setSv(false); };
  return (
    <div className="bg-white rounded-2xl p-5 border border-stone-100">
      <h3 className="font-bold text-stone-800 mb-4">Pengaturan</h3>
      <ImageUploader value={v.hero_bg||""} onChange={val => save("hero_bg", val)} label="Background Homepage" />
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Kuota Order/Hari</label><input type="number" value={v.daily_quota||"20"} onChange={e => setV(x => ({...x, daily_quota:e.target.value}))} onBlur={() => save("daily_quota", v.daily_quota)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Lead Time Classic (hari)</label><input type="number" value={v.lead_time_classic||"0"} onChange={e => setV(x => ({...x, lead_time_classic:e.target.value}))} onBlur={() => save("lead_time_classic", v.lead_time_classic)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300" /><p className="text-xs text-stone-400 mt-1">0 = same day</p></div>
      <div className="mb-4"><label className="block text-sm font-medium text-stone-600 mb-1.5">Lead Time Special (hari)</label><input type="number" value={v.lead_time_special||"5"} onChange={e => setV(x => ({...x, lead_time_special:e.target.value}))} onBlur={() => save("lead_time_special", v.lead_time_special)} className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
      {sv && <p className="text-xs text-amber-600">Menyimpan...</p>}
    </div>
  );
};

const AdminPanel = ({ onLogout }) => {
  const [tab, setTab] = useState("orders");
  const [products, setProducts] = useState([]); const [orders, setOrders] = useState([]); const [allOrders, setAllOrders] = useState([]); const [closedDates, setClosedDates] = useState([]); const [settings, setSettings] = useState({}); const [loading, setLoading] = useState(true);
  const loadAll = async () => { try { const [p,o,ao,cd,s] = await Promise.all([dbProducts(),dbOrders(),dbAllOrders(),dbClosedDates(),dbSettings()]); setProducts(p||[]); setOrders(o||[]); setAllOrders(ao||[]); setClosedDates(cd||[]); const sm = {}; (s||[]).forEach(x => sm[x.key]=x.value); setSettings(sm); } catch(e) { console.error(e); } setLoading(false); };
  useEffect(() => { loadAll(); }, []);
  const tabs = [{id:"orders",icon:"📋",label:"Pesanan"},{id:"menu",icon:"🍰",label:"Menu"},{id:"calendar",icon:"📅",label:"Kalender"},{id:"stats",icon:"📊",label:"Statistik"},{id:"settings",icon:"⚙️",label:"Setting"}];
  const handleToggle = async (ds) => { await dbToggleDate(ds); const cd = await dbClosedDates(); setClosedDates(cd||[]); };
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-stone-100 px-4 py-3.5 flex items-center justify-between">
        <h1 className="font-bold text-stone-800">Admin SJB</h1>
        <button onClick={() => { sbLogout(); onLogout(); }} className="text-xs text-red-400 hover:text-red-600 font-medium transition">Logout</button>
      </header>
      <div className="px-4 py-5 pb-24">
        {loading ? <Spinner text="Memuat data..." /> : <>
          {tab === "orders" && <AdminOrders orders={orders} onRefresh={loadAll} />}
          {tab === "menu" && <AdminMenu products={products} onRefresh={loadAll} />}
          {tab === "calendar" && <AdminCalendar closedDates={closedDates} orders={orders} quota={parseInt(settings.daily_quota||"20")} onToggle={handleToggle} />}
          {tab === "stats" && <AdminStats orders={allOrders} />}
          {tab === "settings" && <AdminSettings settings={settings} />}
        </>}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-stone-100 flex z-30">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[11px] transition ${tab === t.id ? "text-amber-800 font-bold" : "text-stone-400"}`}><span className="text-lg">{t.icon}</span>{t.label}</button>)}
      </nav>
    </div>
  );
};

/* ── MAIN ── */
export default function App() {
  const [page, setPage] = useState("home"); const [category, setCategory] = useState(""); const [productId, setProductId] = useState(null);
  const [cart, dispatch] = useReducer(cartReducer, []); const [checkout, setCheckout] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); const [adminLogged, setAdminLogged] = useState(false); const [showSuccess, setShowSuccess] = useState(false);
  const [products, setProducts] = useState([]); const [orders, setOrders] = useState([]); const [closedDates, setClosedDates] = useState([]); const [settings, setSettings] = useState({}); const [loading, setLoading] = useState(true);

  const goHome = () => { setPage("home"); setCategory(""); setProductId(null); };
  const goCart = () => setPage("cart");

  useEffect(() => {
    (async () => {
      try { const [p,o,cd,s] = await Promise.all([dbProducts(),dbOrders(),dbClosedDates(),dbSettings()]); setProducts(p||[]); setOrders(o||[]); setClosedDates(cd||[]); const sm={}; (s||[]).forEach(x => sm[x.key]=x.value); setSettings(sm); } catch(e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (isAdmin) {
    if (!adminLogged) return <AdminLogin onLogin={() => setAdminLogged(true)} />;
    return <AdminPanel onLogout={() => { setAdminLogged(false); setIsAdmin(false); }} />;
  }

  if (showSuccess) return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center px-5">
      <div className="text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5"><span className="text-4xl">✅</span></div>
        <h2 className="text-xl font-bold text-stone-800 mb-2">Order Terkirim!</h2>
        <p className="text-sm text-stone-400 mb-8 max-w-xs mx-auto leading-relaxed">Lanjutkan di WhatsApp untuk konfirmasi pembayaran. Terima kasih sudah memesan!</p>
        <Btn onClick={() => { dispatch({ type:"CLEAR" }); setCheckout(null); setShowSuccess(false); goHome(); }}>🏠 Kembali ke Beranda</Btn>
      </div>
    </div>
  );

  const product = productId ? products.find(p => p.id === productId) : null;

  return (
    <>
      {page === "home" && <HomePage products={products} onCategory={c => { setCategory(c); setPage("catalog"); }} onProduct={id => { setProductId(id); setPage("product"); }} cart={cart} onCart={goCart} heroBg={settings.hero_bg||""} loading={loading} />}
      {page === "catalog" && <CatalogPage products={products} category={category} onProduct={id => { setProductId(id); setPage("product"); }} onBack={goHome} cart={cart} onCart={goCart} onHome={goHome} />}
      {page === "product" && product && <ProductPage product={product} onBack={() => setPage(category ? "catalog" : "home")} onAddCart={item => { dispatch({ type:"ADD", item }); setPage("cart"); }} cart={cart} onCart={goCart} onHome={goHome} />}
      {page === "cart" && <CartPage cart={cart} dispatch={dispatch} onCheckout={() => setPage("checkout")} onBack={() => setPage("home")} onHome={goHome} />}
      {page === "checkout" && <CheckoutPage cart={cart} settings={settings} orders={orders} closedDates={closedDates} onSubmit={d => { setCheckout(d); setPage("preview"); }} onBack={() => setPage("cart")} onHome={goHome} />}
      {page === "preview" && checkout && <PreviewPage cart={cart} checkout={checkout} onSend={() => setShowSuccess(true)} onBack={() => setPage("checkout")} onHome={goHome} />}

      {page === "home" && (
        <div className="bg-stone-100 py-8 px-5">
          <div className="flex items-center justify-between">
            <button onClick={() => setIsAdmin(true)} className="text-stone-300 hover:text-stone-500 transition p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <p className="text-[11px] text-stone-400">© 2026 Sinar Jaya Bakery</p>
          </div>
        </div>
      )}
    </>
  );
}
