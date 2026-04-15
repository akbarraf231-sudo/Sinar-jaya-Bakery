import { useState, useReducer, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = "https://epydslvgxgucjemzfuxn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVweWRzbHZneGd1Y2plbXpmdXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjE4NjQsImV4cCI6MjA5MTc5Nzg2NH0.0xFvwqwixO1hTBWVIugGmxOObRAaV31CP0MOcBBbDVA";
const WA_NUMBER = "6285745754951";

let accessToken = null;

const sb = async (path, { method = "GET", body, headers: extra = {} } = {}) => {
  const h = { "apikey": SUPABASE_KEY, "Content-Type": "application/json", ...extra };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  else h["Authorization"] = `Bearer ${SUPABASE_KEY}`;
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
const dbOrders = () => sb("/rest/v1/orders?order=id.desc", { headers: { "Prefer": "return=representation" } });
const dbClosedDates = () => sb("/rest/v1/closed_dates?order=date.asc", { headers: { "Prefer": "return=representation" } });
const dbSettings = () => sb("/rest/v1/settings?order=id.asc", { headers: { "Prefer": "return=representation" } });
const dbInsertOrder = (order) => sb("/rest/v1/orders", { method: "POST", body: order, headers: { "Prefer": "return=representation" } });
const dbUpdateOrder = (id, data) => sb(`/rest/v1/orders?id=eq.${id}`, { method: "PATCH", body: data, headers: { "Prefer": "return=representation" } });
const dbDeleteOrder = (id) => sb(`/rest/v1/orders?id=eq.${id}`, { method: "DELETE" });
const dbInsertProduct = (p) => sb("/rest/v1/products", { method: "POST", body: p, headers: { "Prefer": "return=representation" } });
const dbUpdateProduct = (id, p) => sb(`/rest/v1/products?id=eq.${id}`, { method: "PATCH", body: p, headers: { "Prefer": "return=representation" } });
const dbDeleteProduct = (id) => sb(`/rest/v1/products?id=eq.${id}`, { method: "PATCH", body: { is_active: false }, headers: { "Prefer": "return=representation" } });

const dbToggleDate = async (dateStr) => {
  const existing = await sb(`/rest/v1/closed_dates?date=eq.${dateStr}`, { headers: { "Prefer": "return=representation" } });
  if (existing && existing.length > 0) {
    await sb(`/rest/v1/closed_dates?date=eq.${dateStr}`, { method: "DELETE" });
    return false;
  } else {
    await sb("/rest/v1/closed_dates", { method: "POST", body: { date: dateStr }, headers: { "Prefer": "return=representation" } });
    return true;
  }
};

const dbUpdateSetting = (key, value) => sb(`/rest/v1/settings?key=eq.${key}`, { method: "PATCH", body: { value }, headers: { "Prefer": "return=representation" } });
const dbGenOrderNum = () => sb("/rest/v1/rpc/generate_order_number", { method: "POST", body: {} });

const fmtPrice = (n) => "Rp " + n.toLocaleString("id-ID");
const dateFmt = (d) => {
  const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const ProductImage = ({ name, color, img, size = "md" }) => {
  const s = { sm: "h-14 w-14", md: "h-28 w-full", lg: "h-48 w-full" };
  if (img) return <div className={`${s[size]} overflow-hidden`}><img src={img} alt={name} className="w-full h-full object-cover" /></div>;
  return <div className={`${s[size]} flex items-center justify-center font-semibold text-white text-xs`} style={{ backgroundColor: color || "#9CA3AF" }}><span className="opacity-80 px-2 text-center">{name}</span></div>;
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case "ADD": {
      const key = `${action.item.id}-${action.item.size || ""}-${action.item.flavor || ""}`;
      const ex = state.find(i => i.key === key);
      if (ex) return state.map(i => i.key === key ? { ...i, qty: i.qty + action.item.qty } : i);
      return [...state, { ...action.item, key }];
    }
    case "UPDATE_QTY": return action.qty <= 0 ? state.filter(i => i.key !== action.key) : state.map(i => i.key === action.key ? { ...i, qty: action.qty } : i);
    case "REMOVE": return state.filter(i => i.key !== action.key);
    case "CLEAR": return [];
    default: return state;
  }
};

const Badge = ({ children, color = "amber" }) => {
  const c = { amber: "bg-amber-100 text-amber-800", green: "bg-green-100 text-green-800", blue: "bg-blue-100 text-blue-800", red: "bg-red-100 text-red-800", gray: "bg-gray-100 text-gray-600", orange: "bg-orange-100 text-orange-800" };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c[color] || c.amber}`}>{children}</span>;
};

const Btn = ({ children, onClick, variant = "primary", full, disabled, className = "" }) => {
  const base = "font-semibold rounded-xl transition-all duration-200 text-center";
  const sz = full ? "w-full py-3 px-4 text-base" : "py-2 px-5 text-sm";
  const v = { primary: "bg-amber-600 text-white hover:bg-amber-700 active:scale-95 shadow-md", secondary: "bg-white text-amber-700 border-2 border-amber-300 hover:bg-amber-50", danger: "bg-red-500 text-white hover:bg-red-600", whatsapp: "bg-green-600 text-white hover:bg-green-700 shadow-md" };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}>{children}</button>;
};

const Input = ({ label, required, ...props }) => (
  <div className="mb-3">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    <input {...props} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
  </div>
);

const ImageUploader = ({ value, onChange, label = "Foto Produk" }) => {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsDataURL(file);
  }, [onChange]);

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {value ? (
        <div className="relative">
          <img src={value} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
          <button onClick={() => onChange("")} className="absolute top-2 right-2 bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center shadow hover:bg-red-600">✕</button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
          onPaste={(e) => { const items = e.clipboardData?.items; if (items) for (let i = 0; i < items.length; i++) if (items[i].type.startsWith("image/")) { processFile(items[i].getAsFile()); break; } }}
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition ${dragging ? "border-amber-500 bg-amber-50" : "border-gray-300 hover:border-amber-400 hover:bg-gray-50"}`}
        >
          <span className="text-2xl mb-1">📷</span>
          <p className="text-xs text-gray-500 text-center px-4">Klik, drag & drop, atau paste (Ctrl+V)</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files[0]) processFile(e.target.files[0]); }} />
        </div>
      )}
    </div>
  );
};

const FloatingCart = ({ cart, onClick }) => {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  if (count === 0) return null;
  return (
    <button onClick={onClick} className="fixed bottom-20 right-4 z-40 bg-amber-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-700 transition active:scale-90" style={{ width: 52, height: 52 }}>
      <span className="text-xl">🛒</span>
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{count}</span>
    </button>
  );
};

const Spinner = ({ text = "Memuat..." }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
    <div className="w-8 h-8 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-3" style={{ borderWidth: 3, borderStyle: "solid", borderTopColor: "#d97706" }} />
    <p className="text-sm">{text}</p>
  </div>
);

const PageShell = ({ title, onBack, children, onHome }) => (
  <div className="min-h-screen bg-gray-50">
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
      {onBack && <button onClick={onBack} className="text-gray-500 hover:text-gray-800 text-xl mr-1">←</button>}
      {onHome && <button onClick={onHome} className="text-amber-700 font-bold text-lg">SJB</button>}
      {title && <h1 className="font-bold text-gray-800 text-base truncate">{title}</h1>}
    </header>
    <main className="pb-28">{children}</main>
    <div className="fixed bottom-4 right-4 z-50">
      <a href={`https://wa.me/${WA_NUMBER}?text=Halo, saya butuh bantuan`} target="_blank" rel="noreferrer" className="bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg text-xl hover:bg-green-600 transition">💬</a>
    </div>
  </div>
);

const HomePage = ({ products, onCategory, onProduct, cart, onCart, heroBg, loading }) => {
  const bestSellers = products.filter(p => p.label === "Best Seller").slice(0, 3);
  const heroStyle = heroBg ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
  return (
    <PageShell>
      <div className={`text-white px-5 py-10 text-center ${!heroBg ? "bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800" : ""}`} style={heroStyle}>
        <h1 className="text-2xl font-bold mb-1">Sinar Jaya Bakery</h1>
        <p className="text-amber-100 text-sm mb-6">Menyempurnakan Setiap Momen Spesial</p>
        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          <Btn onClick={() => onCategory("special")} full variant="secondary">🎉 Special Selection</Btn>
          <Btn onClick={() => onCategory("classic")} full variant="secondary">🍩 Classic Selection</Btn>
        </div>
      </div>
      <div className="px-4 py-2 bg-amber-50 flex items-center justify-center gap-2 text-sm text-amber-800">
        <span>⚡</span><span className="font-semibold">Slot terbatas setiap hari — pesan sekarang!</span>
      </div>
      <div className="px-4 py-5">
        <div className="grid grid-cols-3 gap-2">
          {[{ icon: "🌿", text: "Dibuat Fresh Setiap Hari" }, { icon: "🎨", text: "Custom Sesuai Acara Anda" }, { icon: "🏠", text: "Homemade Quality" }].map((b, i) => (
            <div key={i} className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xl mb-1">{b.icon}</div>
              <p className="text-[11px] text-gray-600 font-medium leading-tight">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="px-4 pb-6">
          <h2 className="font-bold text-gray-800 text-lg mb-3">⭐ Best Seller</h2>
          <div className="flex flex-col gap-3">
            {bestSellers.map(p => (
              <button key={p.id} onClick={() => onProduct(p.id)} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition text-left w-full flex">
                <div className="w-24 min-h-[80px] flex-shrink-0 overflow-hidden"><ProductImage name={p.name} color={p.color} img={p.image_url} size="sm" /></div>
                <div className="flex-1 p-3 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-0.5"><span className="font-bold text-gray-800 text-sm">{p.name}</span><Badge>Best Seller</Badge></div>
                  <p className="text-xs text-gray-500 mb-1 line-clamp-1">{p.recommendation}</p>
                  <span className="text-amber-700 font-bold text-sm">{fmtPrice(p.price)}</span>
                </div>
                <div className="flex items-center pr-3 text-gray-300">›</div>
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
      <div className="px-4 py-4">
        {category === "special" && <div className="bg-purple-50 text-purple-700 text-xs px-3 py-2 rounded-lg mb-4">ℹ️ Pemesanan Special Selection minimal H-5 sebelum tanggal ambil</div>}
        {filtered.length === 0 ? <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">📦</p><p className="font-semibold">Produk belum tersedia</p></div> : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => (
              <button key={p.id} onClick={() => onProduct(p.id)} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition text-left">
                <ProductImage name={p.name} color={p.color} img={p.image_url} size="md" />
                <div className="p-3">
                  <div className="flex items-center gap-1 mb-1 flex-wrap"><span className="font-bold text-sm text-gray-800">{p.name}</span>{p.label && <Badge>{p.label}</Badge>}</div>
                  {p.portion && <p className="text-xs text-gray-400 mb-1">👥 {p.portion}</p>}
                  <p className="text-xs text-gray-500 mb-2 line-clamp-1">{p.recommendation}</p>
                  <p className="text-amber-700 font-bold text-sm">{fmtPrice(p.price)}</p>
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
  const sizes = product.sizes || [];
  const flavors = product.flavors || [];
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
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-1"><h2 className="text-xl font-bold text-gray-800">{product.name}</h2>{product.label && <Badge>{product.label}</Badge>}</div>
        <p className="text-sm text-gray-600 mb-1">{product.description}</p>
        {product.portion && <p className="text-xs text-gray-400 mb-2">👥 Estimasi: {product.portion}</p>}
        {product.recommendation && <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg mb-4">💡 {product.recommendation}</div>}
        {sizes.length > 0 && (
          <div className="mb-4"><p className="text-sm font-semibold text-gray-700 mb-2">Ukuran</p><div className="flex flex-col gap-2">
            {sizes.map((s, i) => <button key={i} onClick={() => setSize(i)} className={`border rounded-xl px-3 py-2.5 text-left text-sm transition ${i === size ? "border-amber-500 bg-amber-50 font-semibold" : "border-gray-200"}`}>{s.name} — {fmtPrice(product.price + s.add)}</button>)}
          </div></div>
        )}
        {flavors.length > 0 && (
          <div className="mb-4"><p className="text-sm font-semibold text-gray-700 mb-2">Rasa</p><div className="flex flex-wrap gap-2">
            {flavors.map(f => <button key={f} onClick={() => setFlavor(f)} className={`border rounded-full px-4 py-1.5 text-sm transition ${f === flavor ? "border-amber-500 bg-amber-50 font-semibold" : "border-gray-200"}`}>{f}</button>)}
          </div></div>
        )}
        <div className="mb-4"><p className="text-sm font-semibold text-gray-700 mb-2">Jumlah</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-amber-400">−</button>
            <span className="text-lg font-bold w-8 text-center">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-amber-400">+</button>
          </div>
        </div>
        <div className="mb-6">
          <label className="text-sm font-semibold text-gray-700 mb-1 block">Catatan <span className="text-gray-400 font-normal">(tulisan di kue, request, dll)</span></label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Contoh: Tulisan 'Happy Birthday Alya', warna pink" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div className="bg-amber-50 rounded-xl p-4 mb-4 flex items-center justify-between"><span className="text-sm text-gray-600">Total</span><span className="text-xl font-bold text-amber-800">{fmtPrice(total)}</span></div>
        <Btn onClick={() => onAddCart({ id: product.id, name: product.name, color: product.color, img: product.image_url, size: size >= 0 ? sizes[size].name : "", flavor, qty, unitPrice, note, category: product.category })} full>Tambah ke Keranjang</Btn>
      </div>
      <FloatingCart cart={cart} onClick={onCart} />
    </PageShell>
  );
};

const CartPage = ({ cart, dispatch, onCheckout, onBack, onHome }) => {
  const total = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  return (
    <PageShell title="Keranjang" onBack={onBack} onHome={onHome}>
      <div className="px-4 py-4">
        {cart.length === 0 ? <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">🛒</p><p className="font-semibold">Belum ada pesanan</p></div> : (
          <>
            {cart.map(item => (
              <div key={item.key} className="bg-white rounded-xl p-3 mb-3 shadow-sm flex gap-3">
                <div className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden"><ProductImage name={item.name} color={item.color} img={item.img} size="sm" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div><p className="font-bold text-gray-800 text-sm">{item.name}</p>{item.size && <p className="text-xs text-gray-500">{item.size}</p>}{item.flavor && <p className="text-xs text-gray-500">{item.flavor}</p>}{item.note && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">📝 {item.note}</p>}</div>
                    <button onClick={() => dispatch({ type: "REMOVE", key: item.key })} className="text-red-400 hover:text-red-600 text-sm ml-2">✕</button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => dispatch({ type: "UPDATE_QTY", key: item.key, qty: item.qty - 1 })} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-sm font-bold">−</button>
                      <span className="font-bold text-sm w-5 text-center">{item.qty}</span>
                      <button onClick={() => dispatch({ type: "UPDATE_QTY", key: item.key, qty: item.qty + 1 })} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-sm font-bold">+</button>
                    </div>
                    <p className="text-amber-700 font-bold text-sm">{fmtPrice(item.unitPrice * item.qty)}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-amber-50 rounded-xl p-4 mb-4 flex items-center justify-between"><span className="font-semibold text-gray-700">Total</span><span className="text-xl font-bold text-amber-800">{fmtPrice(total)}</span></div>
            <Btn onClick={onCheckout} full>Lanjut Pesan →</Btn>
          </>
        )}
      </div>
    </PageShell>
  );
};

const CheckoutPage = ({ cart, settings, orders, closedDates, onSubmit, onBack, onHome }) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasSpecial = cart.some(i => i.category === "special");
  const ltc = parseInt(settings.lead_time_classic || "0");
  const lts = parseInt(settings.lead_time_special || "5");
  const leadDays = hasSpecial ? lts : ltc;
  const quota = parseInt(settings.daily_quota || "20");
  const today = new Date();
  const minDate = new Date(today); minDate.setDate(minDate.getDate() + leadDays);
  const minDateStr = minDate.toISOString().split("T")[0];
  const ordersOnDate = orders.filter(o => o.pickup_date === date).length;
  const isFull = hasSpecial && ordersOnDate >= quota;
  const isClosed = closedDates.some(d => d.date === date);
  const slotsLeft = hasSpecial ? Math.max(0, quota - ordersOnDate) : null;

  const handleSubmit = async () => {
    if (!name.trim()) return setError("Nama wajib diisi");
    if (!phone.trim()) return setError("Nomor HP wajib diisi");
    if (!date) return setError("Tanggal ambil wajib dipilih");
    if (isClosed) return setError("Tanggal ini tutup");
    if (isFull) return setError("Slot penuh");
    setError(""); setSubmitting(true);
    try {
      const orderNum = await dbGenOrderNum();
      onSubmit({ name: name.trim(), phone: phone.trim(), date, orderNum });
    } catch (e) { setError("Gagal generate nomor order. Coba lagi."); }
    setSubmitting(false);
  };

  return (
    <PageShell title="Checkout" onBack={onBack} onHome={onHome}>
      <div className="px-4 py-4">
        {hasSpecial && <div className="bg-purple-50 text-purple-700 text-xs px-3 py-2 rounded-lg mb-4">ℹ️ Pesanan Special Selection minimal H-{lts} sebelum tanggal ambil</div>}
        <Input label="Nama" required value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" />
        <Input label="Nomor HP" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" type="tel" />
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Ambil<span className="text-red-500 ml-0.5">*</span></label>
          <input type="date" value={date} min={minDateStr} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <p className="text-xs text-gray-400 mt-1">{hasSpecial ? `Minimal H-${lts} dari hari ini` : "Bisa same day atau H-1"}</p>
        </div>
        {date && isClosed && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">❌ Tanggal ini sudah ditutup.</div>}
        {date && isFull && !isClosed && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">❌ Slot penuh.</div>}
        {date && !isClosed && !isFull && slotsLeft !== null && (
          <div className={`text-sm px-3 py-2 rounded-lg mb-3 ${slotsLeft <= 5 ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}>{slotsLeft <= 5 ? `⚡ Sisa ${slotsLeft} slot` : `✅ Tersedia (${slotsLeft} slot)`}</div>
        )}
        <div className="bg-gray-50 text-xs text-gray-500 px-3 py-2 rounded-lg mb-4">ℹ️ Pemesanan mendadak tergantung ketersediaan.</div>
        {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-3">⚠️ {error}</div>}
        <Btn onClick={handleSubmit} full disabled={submitting}>{submitting ? "Memproses..." : "Lihat Preview Order →"}</Btn>
      </div>
    </PageShell>
  );
};

const PreviewPage = ({ cart, checkout, onSend, onBack, onHome }) => {
  const [sending, setSending] = useState(false);
  const total = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const pickupDate = new Date(checkout.date + "T00:00:00");
  const orderId = checkout.orderNum;
  const waText = `Halo, saya ingin order:%0A%0ANo Order: ${orderId}%0ANama: ${checkout.name}%0A%0AProduk:%0A${cart.map(i => { let l = `- ${i.name} x${i.qty}`; if (i.size) l += ` (${i.size})`; if (i.flavor) l += ` — ${i.flavor}`; if (i.note) l += `%0A  Catatan: ${i.note}`; return l; }).join("%0A")}%0A%0ATanggal Ambil: ${dateFmt(pickupDate)}%0ATotal: ${fmtPrice(total)}%0A%0AStatus: Menunggu Verifikasi`;
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

  const handleSend = async () => {
    setSending(true);
    try {
      await dbInsertOrder({
        order_number: orderId, customer_name: checkout.name, customer_phone: checkout.phone,
        items: cart.map(i => ({ name: i.name, size: i.size, flavor: i.flavor, qty: i.qty, unitPrice: i.unitPrice })),
        total, note: cart.map(i => i.note).filter(Boolean).join("; "),
        pickup_date: checkout.date, status: "waiting"
      });
      window.open(waLink, "_blank");
      onSend();
    } catch (e) { alert("Gagal menyimpan order. Coba lagi."); }
    setSending(false);
  };

  return (
    <PageShell title="Preview Order" onBack={onBack} onHome={onHome}>
      <div className="px-4 py-4">
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <div className="text-center mb-4"><p className="text-xs text-gray-400">No. Order</p><p className="text-lg font-bold text-amber-800">{orderId}</p></div>
          <div className="border-t border-dashed border-gray-200 pt-3 mb-3">
            {cart.map(item => (
              <div key={item.key} className="flex justify-between items-start mb-2 text-sm">
                <div className="flex-1"><p className="font-semibold text-gray-800">{item.name} <span className="text-gray-400">x{item.qty}</span></p>{item.size && <p className="text-xs text-gray-500">{item.size}</p>}{item.flavor && <p className="text-xs text-gray-500">Rasa: {item.flavor}</p>}{item.note && <p className="text-xs text-gray-400">📝 {item.note}</p>}</div>
                <p className="font-semibold text-gray-700">{fmtPrice(item.unitPrice * item.qty)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between items-center mb-3"><span className="font-semibold text-gray-700">Total</span><span className="text-xl font-bold text-amber-800">{fmtPrice(total)}</span></div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1"><p>👤 {checkout.name}</p><p>📱 {checkout.phone}</p><p>📅 {dateFmt(pickupDate)}</p></div>
        </div>
        <Btn onClick={handleSend} full variant="whatsapp" disabled={sending}>{sending ? "Mengirim..." : "📲 Kirim ke WhatsApp"}</Btn>
        <p className="text-xs text-center text-gray-400 mt-3">Jika WhatsApp tidak terbuka, <a href={waLink} target="_blank" rel="noreferrer" className="text-amber-600 underline">klik di sini</a></p>
      </div>
    </PageShell>
  );
};

const AdminLogin = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    setLoading(true); setErr("");
    try { await sbAuth(email, pass); onLogin(); }
    catch (e) { setErr("Login gagal: " + (e.message || "Coba lagi")); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-800 mb-1">Admin Panel</h1>
        <p className="text-sm text-center text-gray-400 mb-6">Sinar Jaya Bakery</p>
        <Input label="Email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="Email admin" />
        <Input label="Password" type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} placeholder="••••••••" />
        {err && <p className="text-red-500 text-sm mb-3">⚠️ {err}</p>}
        <Btn onClick={handleLogin} full disabled={loading}>{loading ? "Masuk..." : "Masuk"}</Btn>
      </div>
    </div>
  );
};

const AdminOrders = ({ orders, onRefresh }) => {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [busy, setBusy] = useState("");
  const sL = { waiting: "Menunggu", paid: "Lunas", process: "Diproses", done: "Selesai" };
  const sC = { waiting: "amber", paid: "green", process: "blue", done: "gray" };
  const sF = { waiting: "paid", paid: "process", process: "done" };
  let list = [...orders];
  if (filterStatus !== "all") list = list.filter(o => o.status === filterStatus);
  if (search) list = list.filter(o => o.customer_name.toLowerCase().includes(search.toLowerCase()) || o.customer_phone.includes(search) || o.order_number.toLowerCase().includes(search.toLowerCase()));

  const advance = async (o) => { setBusy(o.order_number); try { await dbUpdateOrder(o.id, { status: sF[o.status] }); await onRefresh(); } catch {} setBusy(""); };
  const remove = async (o) => { setBusy(o.order_number); try { await dbDeleteOrder(o.id); await onRefresh(); } catch {} setBusy(""); };

  return (
    <div>
      <Input placeholder="Cari nama / no HP / no order..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {["all", "waiting", "paid", "process", "done"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border transition ${s === filterStatus ? "bg-amber-600 text-white border-amber-600" : "border-gray-300 text-gray-600"}`}>{s === "all" ? "Semua" : sL[s]}</button>
        ))}
      </div>
      {list.length === 0 ? <div className="text-center py-10 text-gray-400"><p className="text-3xl mb-2">📋</p><p>Belum ada pesanan</p></div> : list.map(o => (
        <div key={o.id} className="bg-white rounded-xl p-4 mb-3 shadow-sm">
          <div className="flex items-center justify-between mb-2"><span className="font-bold text-sm text-gray-800">{o.order_number}</span><Badge color={sC[o.status]}>{sL[o.status]}</Badge></div>
          <p className="text-sm text-gray-700">👤 {o.customer_name} — 📱 {o.customer_phone}</p>
          <div className="mt-1 text-xs text-gray-500">{(o.items || []).map((it, i) => <p key={i}>{it.name} x{it.qty}{it.size ? ` (${it.size})` : ""}{it.flavor ? ` — ${it.flavor}` : ""}</p>)}</div>
          {o.note && <p className="text-xs text-gray-400 mt-1">📝 {o.note}</p>}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500"><span>📅 Ambil: {o.pickup_date}</span><span className="font-bold text-amber-700">{fmtPrice(o.total)}</span></div>
          <div className="flex gap-2 mt-3">
            {sF[o.status] && <Btn onClick={() => advance(o)} variant="primary" className="text-xs flex-1" disabled={busy === o.order_number}>{o.status === "waiting" ? "💰 Tandai Bayar" : o.status === "paid" ? "⚙️ Proses" : "✅ Selesai"}</Btn>}
            {o.status === "done" && <Btn onClick={() => remove(o)} variant="danger" className="text-xs" disabled={busy === o.order_number}>🗑️</Btn>}
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminMenu = ({ products, onRefresh }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", price: "", category: "classic", label: "", description: "", color: "#F59E0B", image_url: "" });
  const [saving, setSaving] = useState(false);

  const startEdit = (p) => { setForm({ name: p.name, price: String(p.price), category: p.category, label: p.label || "", description: p.description || "", color: p.color || "#F59E0B", image_url: p.image_url || "" }); setEditing(p.id); };
  const startAdd = () => { setForm({ name: "", price: "", category: "classic", label: "", description: "", color: "#F59E0B", image_url: "" }); setEditing("new"); };

  const save = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    const data = { name: form.name, price: Number(form.price), category: form.category, label: form.label, description: form.description, color: form.color, image_url: form.image_url };
    try {
      if (editing === "new") await dbInsertProduct(data);
      else await dbUpdateProduct(editing, data);
      await onRefresh(); setEditing(null);
    } catch (e) { alert("Gagal menyimpan"); }
    setSaving(false);
  };

  const remove = async (id) => { try { await dbDeleteProduct(id); await onRefresh(); } catch {} };

  if (editing !== null) return (
    <div className="bg-white rounded-xl p-4">
      <h3 className="font-bold mb-3">{editing === "new" ? "Tambah Produk" : "Edit Produk"}</h3>
      <ImageUploader value={form.image_url} onChange={(v) => setForm(f => ({ ...f, image_url: v }))} />
      <Input label="Nama" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      <Input label="Harga" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"><option value="classic">Classic</option><option value="special">Special</option></select></div>
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
        <select value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"><option value="">Tanpa Label</option><option value="Best Seller">Best Seller</option><option value="Rekomendasi">Rekomendasi</option></select></div>
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Warna Placeholder</label><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" /></div>
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" /></div>
      <div className="flex gap-2"><Btn onClick={save} full disabled={saving}>{saving ? "Menyimpan..." : "💾 Simpan"}</Btn><Btn onClick={() => setEditing(null)} variant="secondary" full>Batal</Btn></div>
    </div>
  );

  return (
    <div>
      <Btn onClick={startAdd} full className="mb-4">+ Tambah Produk</Btn>
      {products.map(p => (
        <div key={p.id} className="bg-white rounded-xl p-3 mb-2 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><ProductImage name={p.name} color={p.color} img={p.image_url} size="sm" /></div>
            <div><p className="font-bold text-sm">{p.name}</p><p className="text-xs text-gray-500">{p.category === "special" ? "Special" : "Classic"} — {fmtPrice(p.price)}</p></div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => startEdit(p)} className="text-xs text-amber-600 px-2 py-1 hover:bg-amber-50 rounded">✏️</button>
            <button onClick={() => remove(p.id)} className="text-xs text-red-500 px-2 py-1 hover:bg-red-50 rounded">🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminCalendar = ({ closedDates, orders, quota, onToggle }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState("");
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const toggle = async (ds) => { setBusy(ds); await onToggle(ds); setBusy(""); };

  return (
    <div className="bg-white rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} className="text-gray-500 px-2 text-lg">‹</button>
        <h3 className="font-bold text-gray-800">{monthNames[month]} {year}</h3>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} className="text-gray-500 px-2 text-lg">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">{["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(d => <div key={d} className="font-semibold text-gray-400 py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isClosed = closedDates.some(cd => cd.date === ds);
          const oc = orders.filter(o => o.pickup_date === ds).length;
          return <button key={d} onClick={() => toggle(ds)} disabled={busy === ds} className={`py-2 rounded-lg transition relative ${isClosed ? "bg-red-100 text-red-700 font-bold" : oc >= quota ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}>{d}{oc > 0 && !isClosed && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-gray-400">{oc}</span>}</button>;
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 rounded" /> Tutup</span><span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-100 rounded" /> Penuh</span></div>
      <p className="text-xs text-gray-400 mt-2">Klik tanggal untuk buka/tutup</p>
    </div>
  );
};

const AdminStats = ({ orders }) => {
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7);
  const ps = ["paid", "process", "done"];
  const dailyRev = orders.filter(o => o.order_date === today && ps.includes(o.status)).reduce((s, o) => s + o.total, 0);
  const monthlyRev = orders.filter(o => (o.order_date || "").startsWith(thisMonth) && ps.includes(o.status)).reduce((s, o) => s + o.total, 0);
  const unpaid = orders.filter(o => o.status === "waiting").reduce((s, o) => s + o.total, 0);
  const pc = {}; orders.forEach(o => (o.items || []).forEach(it => { pc[it.name] = (pc[it.name] || 0) + it.qty; }));
  const ranking = Object.entries(pc).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm"><p className="text-xs text-gray-400">Revenue Hari Ini</p><p className="text-lg font-bold text-green-600">{fmtPrice(dailyRev)}</p></div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm"><p className="text-xs text-gray-400">Revenue Bulan Ini</p><p className="text-lg font-bold text-green-600">{fmtPrice(monthlyRev)}</p></div>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 mb-4 text-center"><p className="text-xs text-gray-500">Belum Dibayar</p><p className="text-lg font-bold text-orange-600">{fmtPrice(unpaid)}</p></div>
      <h3 className="font-bold text-sm text-gray-800 mb-2">Produk Terlaris</h3>
      {ranking.length === 0 ? <p className="text-sm text-gray-400">Belum ada data</p> : ranking.map(([name, count], i) => (
        <div key={name} className="bg-white rounded-lg p-3 mb-2 flex items-center justify-between shadow-sm"><div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-400">#{i + 1}</span><span className="text-sm font-semibold text-gray-800">{name}</span></div><span className="text-sm text-amber-700 font-bold">{count} terjual</span></div>
      ))}
    </div>
  );
};

const AdminSettings = ({ settings }) => {
  const [vals, setVals] = useState(settings);
  const [saving, setSaving] = useState(false);
  const save = async (key, value) => { setSaving(true); try { await dbUpdateSetting(key, value); setVals(v => ({ ...v, [key]: value })); } catch {} setSaving(false); };
  return (
    <div className="bg-white rounded-xl p-4">
      <h3 className="font-bold text-sm text-gray-800 mb-3">Pengaturan</h3>
      <ImageUploader value={vals.hero_bg || ""} onChange={(v) => save("hero_bg", v)} label="Background Homepage" />
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Kuota Order/Hari (Special)</label>
        <input type="number" value={vals.daily_quota || "20"} onChange={e => setVals(v => ({ ...v, daily_quota: e.target.value }))} onBlur={() => save("daily_quota", vals.daily_quota)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" /></div>
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Lead Time Classic (hari)</label>
        <input type="number" value={vals.lead_time_classic || "0"} onChange={e => setVals(v => ({ ...v, lead_time_classic: e.target.value }))} onBlur={() => save("lead_time_classic", vals.lead_time_classic)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <p className="text-xs text-gray-400 mt-1">0 = same day</p></div>
      <div className="mb-3"><label className="block text-sm font-medium text-gray-700 mb-1">Lead Time Special (hari)</label>
        <input type="number" value={vals.lead_time_special || "5"} onChange={e => setVals(v => ({ ...v, lead_time_special: e.target.value }))} onBlur={() => save("lead_time_special", vals.lead_time_special)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" /></div>
      {saving && <p className="text-xs text-amber-600">Menyimpan...</p>}
    </div>
  );
};

const AdminPanel = ({ onLogout }) => {
  const [tab, setTab] = useState("orders");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [closedDates, setClosedDates] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [p, o, cd, s] = await Promise.all([dbProducts(), dbOrders(), dbClosedDates(), dbSettings()]);
      setProducts(p || []); setOrders(o || []); setClosedDates(cd || []);
      const sm = {}; (s || []).forEach(x => sm[x.key] = x.value); setSettings(sm);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const tabs = [{ id: "orders", icon: "📋", label: "Pesanan" }, { id: "menu", icon: "🍰", label: "Menu" }, { id: "calendar", icon: "📅", label: "Kalender" }, { id: "stats", icon: "📊", label: "Statistik" }, { id: "settings", icon: "⚙️", label: "Setting" }];
  const handleToggleDate = async (ds) => { await dbToggleDate(ds); const cd = await dbClosedDates(); setClosedDates(cd || []); };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-gray-800">Admin SJB</h1>
        <button onClick={() => { sbLogout(); onLogout(); }} className="text-xs text-red-500 hover:text-red-700">Logout</button>
      </header>
      <div className="px-4 py-4 pb-20">
        {loading ? <Spinner text="Memuat data..." /> : (
          <>
            {tab === "orders" && <AdminOrders orders={orders} onRefresh={loadAll} />}
            {tab === "menu" && <AdminMenu products={products} onRefresh={loadAll} />}
            {tab === "calendar" && <AdminCalendar closedDates={closedDates} orders={orders} quota={parseInt(settings.daily_quota || "20")} onToggle={handleToggleDate} />}
            {tab === "stats" && <AdminStats orders={orders} />}
            {tab === "settings" && <AdminSettings settings={settings} />}
          </>
        )}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs transition ${tab === t.id ? "text-amber-700 font-bold" : "text-gray-400"}`}><span className="text-base">{t.icon}</span>{t.label}</button>)}
      </nav>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState("home");
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState(null);
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [checkout, setCheckout] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogged, setAdminLogged] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [closedDates, setClosedDates] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const goHome = () => { setPage("home"); setCategory(""); setProductId(null); };
  const goCart = () => setPage("cart");

  useEffect(() => {
    const load = async () => {
      try {
        const [p, o, cd, s] = await Promise.all([dbProducts(), dbOrders(), dbClosedDates(), dbSettings()]);
        setProducts(p || []); setOrders(o || []); setClosedDates(cd || []);
        const sm = {}; (s || []).forEach(x => sm[x.key] = x.value); setSettings(sm);
      } catch (e) { console.error("Load error:", e); }
      setLoading(false);
    };
    load();
  }, []);

  if (isAdmin) {
    if (!adminLogged) return <AdminLogin onLogin={() => setAdminLogged(true)} />;
    return <AdminPanel onLogout={() => { setAdminLogged(false); setIsAdmin(false); }} />;
  }

  if (showSuccess) return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Order Terkirim!</h2>
        <p className="text-sm text-gray-500 mb-6">Silakan lanjutkan di WhatsApp untuk konfirmasi pembayaran.</p>
        <Btn onClick={() => { dispatch({ type: "CLEAR" }); setCheckout(null); setShowSuccess(false); goHome(); }}>Kembali ke Beranda</Btn>
      </div>
    </div>
  );

  const product = productId ? products.find(p => p.id === productId) : null;

  return (
    <>
      {page === "home" && <HomePage products={products} onCategory={(c) => { setCategory(c); setPage("catalog"); }} onProduct={(id) => { setProductId(id); setPage("product"); }} cart={cart} onCart={goCart} heroBg={settings.hero_bg || ""} loading={loading} />}
      {page === "catalog" && <CatalogPage products={products} category={category} onProduct={(id) => { setProductId(id); setPage("product"); }} onBack={goHome} cart={cart} onCart={goCart} onHome={goHome} />}
      {page === "product" && product && <ProductPage product={product} onBack={() => setPage(category ? "catalog" : "home")} onAddCart={(item) => { dispatch({ type: "ADD", item }); setPage("cart"); }} cart={cart} onCart={goCart} onHome={goHome} />}
      {page === "cart" && <CartPage cart={cart} dispatch={dispatch} onCheckout={() => setPage("checkout")} onBack={() => setPage("home")} onHome={goHome} />}
      {page === "checkout" && <CheckoutPage cart={cart} settings={settings} orders={orders} closedDates={closedDates} onSubmit={(data) => { setCheckout(data); setPage("preview"); }} onBack={() => setPage("cart")} onHome={goHome} />}
      {page === "preview" && checkout && <PreviewPage cart={cart} checkout={checkout} onSend={() => setShowSuccess(true)} onBack={() => setPage("checkout")} onHome={goHome} />}

      {page === "home" && (
        <div className="bg-gray-100 py-6 px-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setIsAdmin(true)} className="text-gray-300 hover:text-gray-500 transition p-1" title="Admin">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <p className="text-xs text-gray-400">© 2026 Sinar Jaya Bakery</p>
          </div>
        </div>
      )}
    </>
  );
}
