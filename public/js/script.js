// --- 1. KONFIGURACIJA SESIJE ---
let sessionId = localStorage.getItem('user_session_id');
if (!sessionId) {
    sessionId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('user_session_id', sessionId);
}

// --- 2. GLOBALNE PROMENLJIVE ---
let allProducts = [];
let wishlistIds = [];
let currentTab = 'all';
let currentUserRole = 'user'; // Po defaultu user

// --- 3. DOM ELEMENTI ---
const grid = document.getElementById('product-grid');
const loader = document.getElementById('loader');
const noResults = document.getElementById('no-results');
const countEl = document.getElementById('results-count');
const cartCount = document.getElementById('cart-count');
const modal = document.getElementById('product-modal');

// Filteri (provera da li postoje)
const searchInput = document.getElementById('search-input');
const priceSlider = document.getElementById('price-range');
const priceVal = document.getElementById('price-val');
const sortSelect = document.getElementById('sort-select');
const stockFilter = document.getElementById('filter-stock');

// --- THEME ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}
function updateThemeIcon(isDark) {
    document.querySelectorAll('#theme-icon').forEach(icon => {
        icon.className = isDark ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-slate-500';
    });
}
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

// --- 4. INIT FUNKCIJA ---
async function init() {
    if (!document.getElementById('theme-icon')) {
        const navRight = document.querySelector('nav .flex.items-center.gap-4') || document.querySelector('nav .flex.items-center.space-x-4');
        if (navRight) {
            const btn = document.createElement('button');
            btn.onclick = toggleTheme;
            btn.className = "text-slate-500 hover:text-indigo-600 text-xl transition mr-3";
            btn.innerHTML = `<i id="theme-icon" class="fa-solid fa-moon"></i>`;
            navRight.prepend(btn);
        }
    }
    updateThemeIcon(document.body.classList.contains('dark-mode'));

    await Promise.all([refreshCartCount(), checkUserLogin(), loadWishlistIds()]);

    if (document.getElementById('cart-items-container')) { loadCartPage(); return; }
    if (document.getElementById('checkout-form')) { loadCheckoutSummary(); setupCheckoutForm(); return; }
    if (document.getElementById('profile-form')) { loadProfilePage(); return; }

    if (grid && searchInput) {
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('category');
        if (catParam) {
            if (catParam === 'akcije') currentTab = 'akcije';
            else switchTab(catParam);
        }
        loadProducts();
    }

    if (document.getElementById('popular-games-grid')) {
        loadHomePageContent();
        checkPromoPopup();
    }
}

// --- 5. POMOĆNE FUNKCIJE ---
function getOptimizedImage(url, width = 400) {
    if (!url) return `https://placehold.co/${width}x${Math.floor(width*0.7)}?text=Nema+Slike`;
    if (url.startsWith('http')) return `https://wsrv.nl/?url=${url}&w=${width}&output=webp`;
    return `${url}?v=1`;
}

function showNotification(msg) {
    const toast = document.getElementById('notification-toast');
    const msgEl = document.getElementById('notification-message');
    if (toast && msgEl) {
        msgEl.innerText = msg;
        toast.classList.remove('translate-y-24', 'opacity-0');
        setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
    } else { alert(msg); }
}

// --- 6. AUTH & ROLE ---
async function checkUserLogin() {
    const navContainer = document.querySelector('nav .flex.items-center.gap-4') || document.querySelector('nav .flex.items-center.space-x-4');
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        
        currentUserRole = data.role || 'user'; 

        if (!navContainer) return;

        const oldUserDiv = document.getElementById('user-auth-div'); if(oldUserDiv) oldUserDiv.remove();
        const userDiv = document.createElement('div'); userDiv.id = 'user-auth-div'; userDiv.className = "flex items-center gap-3";
        
        let adminBtn = '';
        if (data.role === 'admin') {
            adminBtn = `<a href="admin.html" class="px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition mr-3">ADMIN</a>`;
        }

        if (data.loggedIn) { 
            userDiv.innerHTML = `${adminBtn}<a href="profile.html" class="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition mr-2"><i class="fa-solid fa-user-circle text-lg"></i><span class="hidden md:inline">${data.username}</span></a>`; 
        } else { 
            userDiv.innerHTML = `<a href="login.html" class="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition">Prijavi se</a>`; 
        }
        
        const cartLink = document.querySelector('a[href="cart.html"]');
        if (cartLink && cartLink.parentNode) { cartLink.parentNode.insertBefore(userDiv, cartLink); }
    } catch (e) { console.error("Auth greška", e); }
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = 'index.html'; }

// --- 7. SHOP LOGIKA ---
async function loadProducts() {
    if(loader) loader.classList.remove('hidden');
    if(grid) grid.innerHTML = '';
    try {
        const response = await fetch('/api/games'); 
        allProducts = await response.json();
        if(loader) loader.classList.add('hidden');
        filterProducts(); 
    } catch (error) { console.error(error); }
}

function filterProducts() {
    if (!allProducts || allProducts.length === 0) return;

    const term = searchInput ? searchInput.value.toLowerCase() : '';
    const maxPrice = priceSlider ? parseInt(priceSlider.value) : 100000;
    const onlyInStock = stockFilter ? stockFilter.checked : false;
    
    const checkedComplexity = Array.from(document.querySelectorAll('.filter-complexity:checked')).map(cb => cb.value);
    const checkedPlayers = Array.from(document.querySelectorAll('.filter-players:checked')).map(cb => cb.value);

    let filtered = allProducts.filter(item => {
        const finalPrice = item.discount_price || item.price;
        if (currentTab === 'akcije') { if (!item.discount_price) return false; } 
        else if (currentTab !== 'all' && item.type !== currentTab) return false;
        
        if (term && !item.name.toLowerCase().includes(term)) return false;
        if (finalPrice > maxPrice) return false;

        if (onlyInStock && (!item.stock_quantity || item.stock_quantity <= 0)) return false;

        if (checkedComplexity.length > 0) { if (!item.complexity || !checkedComplexity.includes(item.complexity)) return false; }
        if (checkedPlayers.length > 0) {
            if (!item.players_min || !item.players_max) return false;
            let match = false;
            if (checkedPlayers.includes('2') && (item.players_min <= 2 && item.players_max >= 2)) match = true;
            if (checkedPlayers.includes('3-5') && (item.players_max >= 3 && item.players_min <= 5)) match = true;
            if (checkedPlayers.includes('6+') && (item.players_max >= 6)) match = true;
            if (!match) return false;
        }
        return true;
    });

    if (sortSelect) {
        const sort = sortSelect.value;
        if (sort === 'price-asc') filtered.sort((a,b) => (a.discount_price||a.price) - (b.discount_price||b.price));
        if (sort === 'price-desc') filtered.sort((a,b) => (b.discount_price||b.price) - (a.discount_price||a.price));
        if (sort === 'rating') filtered.sort((a,b) => b.rating - a.rating);
    }
    renderProducts(filtered);
}

function renderProducts(list) {
    if (!grid) return;
    grid.innerHTML = '';
    
    if (countEl) countEl.innerText = list.length;
    if (list.length === 0) { if (noResults) noResults.classList.remove('hidden'); return; } 
    else { if (noResults) noResults.classList.add('hidden'); }

    list.forEach(game => {
        const imgUrl = getOptimizedImage(game.image_url, 600);
        let badgeClass = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
        let complexityLabel = 'N/A';
        if (game.complexity === 'lako') { badgeClass = 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'; complexityLabel = 'Lako'; }
        else if (game.complexity === 'srednje') { badgeClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'; complexityLabel = 'Srednje'; }
        else if (game.complexity === 'tesko') { badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'; complexityLabel = 'Teško'; }

        const isOutOfStock = (game.stock_quantity === undefined || game.stock_quantity <= 0);
        let stockHtml = '';
        let cardOpacity = '';
        let imageFilter = '';
        let btnDisabled = '';
        let btnClass = 'bg-slate-100 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 dark:hover:text-white';
        let btnIcon = '<i class="fa-solid fa-plus"></i>';

        if (currentUserRole === 'admin') {
            let color = isOutOfStock ? 'bg-red-600 border-red-400' : 'bg-blue-600 border-blue-400';
            stockHtml = `<div class="absolute top-3 left-3 ${color} text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm border z-20">ZALIHA: ${game.stock_quantity}</div>`;
        } else {
            if (!isOutOfStock) {
                stockHtml = `<div class="absolute top-3 left-3 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm z-20">NA STANJU</div>`;
            } else {
                stockHtml = `<div class="absolute inset-0 bg-white/60 dark:bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]"><span class="bg-red-600 text-white font-bold px-4 py-2 rounded-xl shadow-lg transform -rotate-12 border-2 border-white text-sm">RASPRODATO</span></div>`;
                cardOpacity = 'opacity-75';
                imageFilter = 'grayscale';
                btnDisabled = 'disabled style="opacity:0.5; cursor:not-allowed;"';
                btnClass = 'bg-gray-200 text-gray-400 dark:bg-slate-800 dark:text-gray-600';
                btnIcon = '<i class="fa-solid fa-ban"></i>';
            }
        }

        let priceDisplay = `<span class="text-xl font-bold text-indigo-600 dark:text-indigo-400">${parseInt(game.price).toLocaleString()} RSD</span>`;
        let discountBadge = '';
        if (game.discount_price && game.discount_price < game.price && !isOutOfStock) {
            priceDisplay = `<div class="flex flex-col items-end"><span class="text-xs text-slate-400 dark:text-slate-500 line-through">${parseInt(game.price).toLocaleString()} RSD</span><span class="text-xl font-bold text-red-600 dark:text-red-400">${parseInt(game.discount_price).toLocaleString()} RSD</span></div>`;
            discountBadge = `<span class="absolute top-3 right-12 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm animate-pulse z-20">AKCIJA</span>`;
        } else if (isOutOfStock) {
             priceDisplay = `<span class="text-xl font-bold text-gray-400 line-through decoration-2">${parseInt(game.discount_price || game.price).toLocaleString()} RSD</span>`;
        }

        const isLiked = wishlistIds.includes(parseInt(game.id));
        const heartClass = isLiked ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart text-white';

        const card = document.createElement('div');
        card.className = `bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden card-hover transition flex flex-col h-full group relative ${cardOpacity}`;
        card.innerHTML = `
            <div class="relative h-56 p-6 flex items-center justify-center bg-slate-50 dark:bg-slate-700 overflow-hidden cursor-pointer" onclick="openModal(${game.id})">
                <img src="${imgUrl}" loading="lazy" class="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-110 drop-shadow-sm ${imageFilter}">
                ${stockHtml}
                ${discountBadge}
                <button onclick="event.stopPropagation(); toggleWishlist(${game.id}, this)" class="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center backdrop-blur-sm transition z-20">
                    <i class="${heartClass} text-lg transition-colors"></i>
                </button>
                <div class="absolute bottom-3 left-3"> <span class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeClass} shadow-sm">${complexityLabel}</span> </div>
            </div>
            <div class="p-5 flex flex-col flex-grow">
                <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1 leading-snug cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition" onclick="openModal(${game.id})">${game.name}</h3>
                <div class="mt-auto flex justify-between items-end border-t border-dashed border-slate-200 dark:border-slate-700 pt-4">
                    <div><span class="block text-xs text-slate-400 dark:text-slate-500">Cena</span>${priceDisplay}</div>
                    <button onclick="addToCart(${game.id}, event)" ${btnDisabled} class="${btnClass} w-10 h-10 rounded-xl flex items-center justify-center transition shadow-sm cursor-pointer z-20 relative"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tab) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    filterProducts();
}

// --- 8. WISHLIST ---
async function loadWishlistIds() {
    try {
        const res = await fetch('/api/wishlist/ids');
        if (res.ok) {
            const rawIds = await res.json();
            wishlistIds = rawIds.map(id => parseInt(id));
        }
    } catch (e) {}
}

async function toggleWishlist(gameId, btn) {
    const resAuth = await fetch('/api/check-auth');
    const authData = await resAuth.json();
    if (!authData.loggedIn) { alert("Morate biti ulogovani!"); window.location.href = 'login.html'; return; }

    const icon = btn.querySelector('i');
    const id = parseInt(gameId);
    const isLiked = wishlistIds.includes(id);

    if (!isLiked) {
        icon.className = 'fa-solid fa-heart text-red-500 text-lg transition-colors';
        wishlistIds.push(id);
    } else {
        icon.className = 'fa-regular fa-heart text-white text-lg transition-colors'; 
        wishlistIds = wishlistIds.filter(wId => wId !== id);
    }

    try {
        const res = await fetch('/api/wishlist/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: id }) });
        const data = await res.json();
        if (data.success) showNotification(data.status === 'added' ? "Dodato u listu želja ❤️" : "Uklonjeno iz liste želja");
        else { await loadWishlistIds(); if(grid) filterProducts(); }
    } catch (e) {}
}

// --- 9. MODAL ---
function openModal(id) {
    const game = allProducts.find(p => p.id === id); if (!game) return;
    const isOutOfStock = (game.stock_quantity === undefined || game.stock_quantity <= 0);

    document.getElementById('modal-img').src = getOptimizedImage(game.image_url, 800);
    document.getElementById('modal-img').className = isOutOfStock ? "max-h-[50vh] object-contain drop-shadow-xl z-10 grayscale opacity-70" : "max-h-[50vh] object-contain drop-shadow-xl z-10";
    
    document.getElementById('modal-title').innerText = game.name;
    document.getElementById('modal-desc').innerText = game.description || 'Nema opisa.';
    
    const priceEl = document.getElementById('modal-price');
    if (isOutOfStock) {
        priceEl.innerHTML = `<span class="text-2xl font-bold text-gray-400 line-through">RASPRODATO</span>`;
    } else if (game.discount_price && game.discount_price < game.price) {
        priceEl.innerHTML = `<span class="text-sm line-through text-gray-400 mr-2">${game.price}</span><span class="text-red-600">${game.discount_price} RSD</span>`;
    } else { priceEl.innerText = game.price + ' RSD'; }

    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val !== undefined ? val : '-'; };
    setText('modal-rating', game.rating);
    setText('modal-players', (game.players_min === game.players_max) ? game.players_min : `${game.players_min}-${game.players_max}`);
    setText('modal-time', game.playtime_min ? `${game.playtime_min} min` : '-');
    setText('modal-age', game.age_min ? `${game.age_min}+` : '-');
    setText('modal-complexity', game.complexity);

    const modalBtn = document.getElementById('modal-add-btn');
    if (modalBtn) { 
        const newBtn = modalBtn.cloneNode(true); 
        modalBtn.parentNode.replaceChild(newBtn, modalBtn); 
        
        if (isOutOfStock) {
            newBtn.disabled = true;
            newBtn.innerHTML = '<i class="fa-solid fa-ban mr-2"></i> Rasprodato';
            newBtn.className = 'w-full bg-gray-300 dark:bg-slate-700 text-gray-500 cursor-not-allowed font-bold py-3.5 rounded-xl flex justify-center items-center gap-2';
        } else {
            newBtn.disabled = false;
            newBtn.innerHTML = '<i class="fa-solid fa-cart-plus mr-2"></i> Dodaj u korpu';
            newBtn.className = 'w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-indigo-200';
            newBtn.onclick = (e) => addToCart(game.id, e); 
        }
    }
    
    const vidContainer = document.getElementById('modal-video-container'); 
    const iframe = document.getElementById('modal-iframe');
    if (game.video_url && vidContainer && iframe) { 
        vidContainer.classList.remove('hidden'); iframe.src = game.video_url; 
    } else if (vidContainer && iframe) { 
        vidContainer.classList.add('hidden'); iframe.src = ""; 
    }
    if(modal) modal.classList.remove('hidden');
}

function closeModal() { if (modal) { modal.classList.add('hidden'); const iframe = document.getElementById('modal-iframe'); if (iframe) iframe.src = ""; } }

// --- 10. KORPA ---
async function addToCart(gameId, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    try {
        const response = await fetch('/api/cart/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, game_id: gameId }) });
        const data = await response.json();
        if (data.success) { await refreshCartCount(); closeModal(); showNotification("Uspešno dodato u korpu!"); } 
        else { alert("Greška: " + (data.error || "Nepoznata greška")); }
    } catch (error) { console.error("Greška:", error); }
}

async function refreshCartCount() {
    if (!cartCount) return;
    try {
        const res = await fetch(`/api/cart/${sessionId}`);
        const items = await res.json();
        const total = items.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.innerText = total;
        cartCount.parentElement.classList.add('scale-110'); setTimeout(() => cartCount.parentElement.classList.remove('scale-110'), 200);
    } catch (e) { console.error(e); }
}

async function loadCartPage() {
    const container = document.getElementById('cart-items-container');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    if (!container) return;
    container.innerHTML = '<div class="loader mx-auto"></div>';

    try {
        const res = await fetch(`/api/cart/${sessionId}`);
        const items = await res.json();
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-500 dark:text-slate-400">Korpa je prazna.</div>`;
            if (subtotalEl) subtotalEl.innerText = "0 RSD";
            if (totalEl) totalEl.innerText = "0 RSD";
            return;
        }
        let subtotal = 0;
        items.forEach(item => {
            const itemTotal = (item.discount_price || item.price) * item.quantity;
            subtotal += itemTotal;
            const imgUrl = getOptimizedImage(item.image_url, 100);
            const row = document.createElement('div');
            row.className = 'flex flex-col sm:flex-row items-center gap-4 py-6 border-b border-slate-100 dark:border-slate-700';
            row.innerHTML = `
                <img src="${imgUrl}" class="w-20 h-20 object-contain bg-slate-50 dark:bg-slate-700 rounded-lg p-2">
                <div class="flex-grow text-center sm:text-left">
                    <h4 class="font-bold text-slate-800 dark:text-white">${item.name}</h4>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${parseInt(item.discount_price || item.price).toLocaleString()} RSD</p>
                </div>
                <div class="flex items-center gap-3">
                    <input type="number" min="1" max="${item.stock_quantity}" value="${item.quantity}" onchange="updateQty(${item.cart_item_id}, this.value)" class="w-16 border rounded px-2 py-1 text-center bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600">
                    <button onclick="removeItem(${item.cart_item_id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="font-bold text-slate-800 dark:text-white w-24 text-right">${itemTotal.toLocaleString()} RSD</div>
            `;
            container.appendChild(row);
        });
        if (subtotalEl) subtotalEl.innerText = subtotal.toLocaleString() + " RSD";
        if (totalEl) totalEl.innerText = subtotal.toLocaleString() + " RSD";
    } catch (e) { console.error(e); }
}

async function removeItem(id) { await fetch(`/api/cart/remove/${id}`, { method: 'DELETE' }); loadCartPage(); refreshCartCount(); showNotification("Proizvod obrisan."); }
async function updateQty(id, qty) { if(qty < 1) return; await fetch('/api/cart/update', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart_item_id: id, quantity: qty }) }); loadCartPage(); refreshCartCount(); }
function checkout() { window.location.href = 'checkout.html'; }

async function loadCheckoutSummary() {
    const container = document.getElementById('checkout-summary');
    const totalEl = document.getElementById('checkout-total');
    try {
        const res = await fetch(`/api/cart/${sessionId}`);
        const items = await res.json();
        if (items.length === 0) { alert("Korpa je prazna!"); window.location.href = 'shop.html'; return; }
        container.innerHTML = '';
        let total = 0;
        items.forEach(item => {
            const price = item.discount_price || item.price;
            total += price * item.quantity;
            container.innerHTML += `<div class="flex justify-between text-sm border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0"><span class="text-slate-600 dark:text-slate-400">${item.quantity}x ${item.name}</span><span class="font-bold dark:text-white">${(price * item.quantity).toLocaleString()}</span></div>`;
        });
        totalEl.innerText = total.toLocaleString() + " RSD";
    } catch (e) { console.error(e); }
}

function setupCheckoutForm() {
    const form = document.getElementById('checkout-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customer = { fullName: document.getElementById('full-name').value, address: document.getElementById('address').value, city: document.getElementById('city').value, zip: document.getElementById('zip').value, phone: document.getElementById('phone').value, email: document.getElementById('email').value };
        try {
            const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, customer: customer }) });
            const data = await res.json();
            if (data.success) { alert("Hvala na kupovini! Vaša narudžbina je primljena."); window.location.href = 'index.html'; } else { alert("Greška: " + data.error); }
        } catch (e) { alert("Greška na serveru."); }
    });
}

async function loadProfilePage() {
    const resAuth = await fetch('/api/check-auth');
    const authData = await resAuth.json();
    if (!authData.loggedIn) { window.location.href = 'login.html'; return; }
    try {
        const userRes = await fetch('/api/user/details');
        const user = await userRes.json();
        if (document.getElementById('p-fullname')) document.getElementById('p-fullname').value = user.full_name || '';
        if (document.getElementById('p-address')) document.getElementById('p-address').value = user.address || '';
        if (document.getElementById('p-city')) document.getElementById('p-city').value = user.city || '';
        if (document.getElementById('p-zip')) document.getElementById('p-zip').value = user.zip || '';
        if (document.getElementById('p-phone')) document.getElementById('p-phone').value = user.phone || '';
    } catch(e) {}
    const wContainer = document.getElementById('wishlist-container');
    if (wContainer) {
        try {
            const res = await fetch('/api/user/wishlist');
            const items = await res.json();
            wContainer.innerHTML = '';
            if (!Array.isArray(items) || items.length === 0) { wContainer.innerHTML = '<p class="text-sm text-slate-400">Nemate sačuvanih igara.</p>'; } 
            else {
                items.forEach(game => {
                    const img = getOptimizedImage(game.image_url, 100);
                    wContainer.innerHTML += `<div class="flex items-center gap-3 border-b border-slate-50 dark:border-slate-700 pb-3"><img src="${img}" class="w-12 h-12 object-contain bg-slate-50 dark:bg-slate-700 rounded"><div class="flex-grow"><h4 class="font-bold text-sm text-slate-800 dark:text-slate-200">${game.name}</h4><a href="shop.html" class="text-xs text-indigo-500 hover:underline">Pogledaj</a></div><button onclick="toggleWishlist(${game.id}, this); this.parentElement.remove()" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button></div>`;
                });
            }
        } catch(e) { wContainer.innerHTML = `<p class="text-red-500 text-sm">Greška.</p>`; }
    }
    const oContainer = document.getElementById('orders-container');
    try {
        const res = await fetch('/api/user/orders');
        const orders = await res.json();
        oContainer.innerHTML = '';
        if(orders.length === 0) { oContainer.innerHTML = '<p class="text-sm text-slate-400">Nemate narudžbina.</p>'; }
        else {
            orders.forEach(order => {
                const date = new Date(order.created_at).toLocaleDateString('sr-RS');
                let statusColor = 'bg-gray-100 text-gray-600';
                if (order.status === 'poslata') statusColor = 'bg-blue-100 text-blue-600';
                oContainer.innerHTML += `<div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-100 dark:border-slate-600 text-sm"><div class="flex justify-between mb-1"><span class="font-bold dark:text-slate-200">#${order.id}</span><span class="text-indigo-600 dark:text-indigo-400 font-bold">${order.total_price} RSD</span></div><div class="flex justify-between text-xs mb-2"><span class="text-slate-500 dark:text-slate-400">${date}</span><span class="${statusColor} px-2 py-0.5 rounded text-[10px] uppercase">${order.status}</span></div><p class="text-slate-700 dark:text-slate-300 truncate">${order.items}</p></div>`;
            });
        }
    } catch(e) {}
    const form = document.getElementById('profile-form');
    if(form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = { fullName: document.getElementById('p-fullname').value, address: document.getElementById('p-address').value, city: document.getElementById('p-city').value, zip: document.getElementById('p-zip').value, phone: document.getElementById('p-phone').value };
            const res = await fetch('/api/user/update', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            const resp = await res.json();
            if(resp.success) showNotification("Profil uspešno sačuvan!");
        });
    }
}

async function loadHomePageContent() {
    const popGrid = document.getElementById('popular-games-grid');
    if(popGrid) {
        try {
            const res = await fetch('/api/popular-games');
            const popular = await res.json();
            popGrid.innerHTML = '';
            if(popular.length === 0) { popGrid.innerHTML = '<p class="text-center col-span-full text-slate-500">Nema podataka.</p>'; return; }
            popular.forEach(game => {
                const imgUrl = getOptimizedImage(game.image_url, 400);
                const price = game.discount_price ? game.discount_price : game.price;
                const card = document.createElement('div');
                card.className = 'bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700 hover:shadow-xl transition group cursor-pointer';
                card.onclick = () => window.location.href = 'shop.html';
                card.innerHTML = `<div class="h-40 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-xl mb-4 relative overflow-hidden"><img src="${imgUrl}" class="max-h-full max-w-full object-contain group-hover:scale-110 transition duration-500"><div class="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full"><i class="fa-solid fa-star"></i> ${game.rating}</div></div><h3 class="font-bold text-lg mb-1 truncate text-slate-800 dark:text-slate-200">${game.name}</h3><p class="text-indigo-600 dark:text-indigo-400 font-bold mb-3">${parseInt(price).toLocaleString()} RSD</p><a href="shop.html" class="block text-center bg-slate-100 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white text-slate-600 dark:text-slate-300 py-2 rounded-lg font-semibold transition text-sm">Pogledaj</a>`;
                popGrid.appendChild(card);
            });
        } catch(e) {}
    }
    const blogContainer = document.getElementById('blog-container');
    if(blogContainer) {
        try {
            const res = await fetch('/api/blogs');
            const blogs = await res.json();
            blogContainer.innerHTML = '';
            blogs.forEach(blog => {
                const img = getOptimizedImage(blog.image_url, 400);
                blogContainer.innerHTML += `<div class="flex flex-col md:flex-row gap-6 items-start"><img src="${img}" class="w-full md:w-48 h-32 object-cover rounded-xl shadow-sm"><div><h3 class="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2 hover:text-indigo-600 cursor-pointer">${blog.title}</h3><p class="text-slate-600 dark:text-slate-400 text-sm mb-3">${blog.excerpt}</p><a href="#" class="text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline">Pročitaj više -></a></div></div>`;
            });
        } catch(e) {}
    }
    const reviewContainer = document.getElementById('reviews-container');
    if(reviewContainer) {
        try {
            const res = await fetch('/api/reviews');
            const reviews = await res.json();
            reviewContainer.innerHTML = '';
            reviews.forEach(rev => {
                reviewContainer.innerHTML += `<div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 mb-4"><div class="flex items-center gap-2 text-yellow-400 mb-3 text-sm">${'<i class="fa-solid fa-star"></i>'.repeat(rev.rating)}</div><p class="text-slate-600 dark:text-slate-400 italic mb-4">"${rev.content}"</p><p class="text-sm font-bold text-slate-800 dark:text-slate-200">- ${rev.user_name}</p></div>`;
            });
        } catch(e) {}
    }
}

// EVENT LISTENERS
if(searchInput) searchInput.addEventListener('input', filterProducts);
if(priceSlider) priceSlider.addEventListener('input', (e) => { if(priceVal) priceVal.innerText = parseInt(e.target.value).toLocaleString(); filterProducts(); });
if(sortSelect) sortSelect.addEventListener('change', filterProducts);
if(stockFilter) stockFilter.addEventListener('change', filterProducts);
document.querySelectorAll('.filter-complexity, .filter-players').forEach(cb => cb.addEventListener('change', filterProducts));

init();