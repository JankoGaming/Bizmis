// --- KONFIGURACIJA SESIJE ---
let sessionId = localStorage.getItem('user_session_id');
if (!sessionId) {
    sessionId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('user_session_id', sessionId);
}

// Globalne promenljive
let allProducts = [];
let currentTab = 'all';

// DOM Elementi
const grid = document.getElementById('product-grid');
const loader = document.getElementById('loader');
const noResults = document.getElementById('no-results');
const countEl = document.getElementById('results-count');
const cartCount = document.getElementById('cart-count');
const modal = document.getElementById('product-modal');

// Filter Elementi
const searchInput = document.getElementById('search-input');
const priceSlider = document.getElementById('price-range');
const priceVal = document.getElementById('price-val');
const sortSelect = document.getElementById('sort-select');

// --- 1. INIT FUNKCIJA ---
async function init() {
    await refreshCartCount();
    await checkUserLogin(); 

    // Provera da li smo na stranici korpe
    if (document.getElementById('cart-items-container')) {
        loadCartPage();
        return; 
    }

    // Ako smo na SHOP stranici
    if (grid && searchInput) {
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('category');
        if (catParam) {
            if (catParam === 'akcije') currentTab = 'akcije';
            else switchTab(catParam);
        }
        loadProducts();
    }

    // Homepage logic
    if (document.getElementById('popular-games-grid')) {
        loadHomePageContent();
        checkPromoPopup();
    }
}

// --- 2. UČITAVANJE IGARA ---
async function loadProducts() {
    if(loader) loader.classList.remove('hidden');
    if(grid) grid.innerHTML = '';
    
    try {
        const response = await fetch('/api/games'); 
        allProducts = await response.json();
        if(loader) loader.classList.add('hidden');
        filterProducts(); 
    } catch (error) {
        console.error("Greška:", error);
    }
}

function renderProducts(list) {
    if(!grid) return;
    grid.innerHTML = '';
    if(countEl) countEl.innerText = list.length;

    if (list.length === 0) {
        if(noResults) noResults.classList.remove('hidden');
        return;
    } else {
        if(noResults) noResults.classList.add('hidden');
    }

    list.forEach(game => {
        let badgeClass = 'bg-slate-100 text-slate-600';
        let complexityLabel = 'N/A';
        if (game.complexity === 'lako') { badgeClass = 'bg-green-100 text-green-700'; complexityLabel = 'Lako'; }
        else if (game.complexity === 'srednje') { badgeClass = 'bg-yellow-100 text-yellow-700'; complexityLabel = 'Srednje'; }
        else if (game.complexity === 'tesko') { badgeClass = 'bg-red-100 text-red-700'; complexityLabel = 'Teško'; }

        // DIREKTNO UČITAVANJE IZ BAZE (Bez proxy-ja)
        // Dodali smo timestamp (?v=1) da browser ne koristi keširanu verziju ako si menjao slike
        const imgUrl = game.image_url ? `${game.image_url}?v=1` : 'https://placehold.co/400x300?text=Nema+Slike';
        
        let priceDisplay = `<span class="text-xl font-bold text-indigo-600">${parseInt(game.price).toLocaleString()} RSD</span>`;
        let discountBadge = '';
        if (game.discount_price && game.discount_price < game.price) {
            priceDisplay = `<div class="flex flex-col items-end"><span class="text-xs text-slate-400 line-through">${parseInt(game.price).toLocaleString()} RSD</span><span class="text-xl font-bold text-red-600">${parseInt(game.discount_price).toLocaleString()} RSD</span></div>`;
            discountBadge = `<span class="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">AKCIJA</span>`;
        }

        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-100 overflow-hidden card-hover transition flex flex-col h-full group';
        card.innerHTML = `
            <div class="relative h-56 p-6 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer" onclick="openModal(${game.id})">
                <img src="${imgUrl}" loading="lazy" class="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-110 drop-shadow-sm" onerror="this.src='https://placehold.co/400x300?text=Nema+Slike'">
                ${discountBadge}
                <div class="absolute top-3 right-3"> ${game.complexity ? `<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeClass} shadow-sm">${complexityLabel}</span>` : ''} </div>
            </div>
            <div class="p-5 flex flex-col flex-grow">
                <h3 class="font-bold text-lg text-slate-800 mb-1 leading-snug cursor-pointer hover:text-indigo-600 transition" onclick="openModal(${game.id})">${game.name}</h3>
                <div class="mt-auto flex justify-between items-end border-t border-dashed border-slate-200 pt-4">
                    <div><span class="block text-xs text-slate-400">Cena</span>${priceDisplay}</div>
                    <button onclick="addToCart(${game.id}, event)" class="bg-slate-100 hover:bg-indigo-600 hover:text-white text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center transition shadow-sm cursor-pointer z-20 relative"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

// --- HOMEPAGE LOGIKA ---
async function loadHomePageContent() {
    const popGrid = document.getElementById('popular-games-grid');
    if(popGrid) {
        try {
            const res = await fetch('/api/popular-games');
            const popular = await res.json();
            popGrid.innerHTML = '';
            
            if(popular.length === 0) {
                popGrid.innerHTML = '<p class="text-center col-span-full text-slate-500">Nema popularnih igara trenutno.</p>';
                return;
            }

            popular.forEach(game => {
                // Lokalna slika
                const imgUrl = game.image_url ? `${game.image_url}?v=1` : 'https://placehold.co/400x300';
                const price = game.discount_price ? game.discount_price : game.price;
                
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-2xl shadow-md border border-slate-100 hover:shadow-xl transition group cursor-pointer';
                card.onclick = () => window.location.href = 'shop.html';
                card.innerHTML = `
                    <div class="h-40 flex items-center justify-center bg-slate-50 rounded-xl mb-4 relative overflow-hidden">
                        <img src="${imgUrl}" class="max-h-full max-w-full object-contain group-hover:scale-110 transition duration-500" onerror="this.src='https://placehold.co/400x300'">
                        <div class="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full"><i class="fa-solid fa-star"></i> ${game.rating}</div>
                    </div>
                    <h3 class="font-bold text-lg mb-1 truncate">${game.name}</h3>
                    <p class="text-indigo-600 font-bold mb-3">${parseInt(price).toLocaleString()} RSD</p>
                    <a href="shop.html" class="block text-center bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-600 py-2 rounded-lg font-semibold transition text-sm">Pogledaj</a>
                `;
                popGrid.appendChild(card);
            });
        } catch(e) { console.error("Popular error:", e); }
    }

    // Blogovi
    const blogContainer = document.getElementById('blog-container');
    if(blogContainer) {
        try {
            const res = await fetch('/api/blogs');
            const blogs = await res.json();
            blogContainer.innerHTML = '';
            blogs.forEach(blog => {
                const img = blog.image_url ? `${blog.image_url}?v=1` : 'https://placehold.co/400x300';
                const html = `
                    <div class="flex flex-col md:flex-row gap-6 items-start">
                        <img src="${img}" class="w-full md:w-48 h-32 object-cover rounded-xl shadow-sm" onerror="this.src='https://placehold.co/400x300'">
                        <div>
                            <h3 class="text-xl font-bold text-slate-800 mb-2 hover:text-indigo-600 cursor-pointer">${blog.title}</h3>
                            <p class="text-slate-600 text-sm mb-3">${blog.excerpt}</p>
                            <a href="#" class="text-indigo-600 font-bold text-sm hover:underline">Pročitaj više -></a>
                        </div>
                    </div>`;
                blogContainer.innerHTML += html;
            });
        } catch(e) {}
    }

    // Recenzije (ostaje isto)
    const reviewContainer = document.getElementById('reviews-container');
    if(reviewContainer) {
        try {
            const res = await fetch('/api/reviews');
            const reviews = await res.json();
            reviewContainer.innerHTML = '';
            reviews.forEach(rev => {
                const html = `
                    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div class="flex items-center gap-2 text-yellow-400 mb-3 text-sm">${'<i class="fa-solid fa-star"></i>'.repeat(rev.rating)}</div>
                        <p class="text-slate-600 italic mb-4">"${rev.content}"</p>
                        <p class="text-sm font-bold text-slate-800">- ${rev.user_name}</p>
                    </div>`;
                reviewContainer.innerHTML += html;
            });
        } catch(e) {}
    }
}

// MODAL
function openModal(id) {
    const game = allProducts.find(p => p.id === id); if (!game) return;
    
    // Lokalna slika
    document.getElementById('modal-img').src = game.image_url ? `${game.image_url}?v=1` : 'https://placehold.co/600x400';
    
    document.getElementById('modal-title').innerText = game.name;
    document.getElementById('modal-desc').innerText = game.description || 'Nema opisa.';
    const priceEl = document.getElementById('modal-price');
    if (game.discount_price) priceEl.innerHTML = `<span class="text-sm line-through text-gray-400 mr-2">${game.price}</span><span class="text-red-600">${game.discount_price} RSD</span>`;
    else priceEl.innerText = game.price + ' RSD';

    const setT = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };
    setT('modal-rating', game.rating || '-');
    setT('modal-players', (game.players_min === game.players_max) ? game.players_min : `${game.players_min}-${game.players_max}`);
    setT('modal-time', game.playtime_min ? `${game.playtime_min} min` : '-');
    setT('modal-age', game.age_min ? `${game.age_min}+` : '-');
    setT('modal-complexity', game.complexity);
    setT('modal-type', game.type === 'tcg' ? 'Trading Cards' : 'Board Game');

    const modalBtn = document.getElementById('modal-add-btn');
    if (modalBtn) { const newBtn = modalBtn.cloneNode(true); modalBtn.parentNode.replaceChild(newBtn, modalBtn); newBtn.onclick = (e) => addToCart(game.id, e); }
    
    const vidContainer = document.getElementById('modal-video-container'); const iframe = document.getElementById('modal-iframe');
    if (game.video_url && vidContainer && iframe) { vidContainer.classList.remove('hidden'); iframe.src = game.video_url; } 
    else if (vidContainer && iframe) { vidContainer.classList.add('hidden'); iframe.src = ""; }
    
    if(modal) modal.classList.remove('hidden');
}

function closeModal() { if(modal) { modal.classList.add('hidden'); const f = document.getElementById('modal-iframe'); if(f) f.src=""; } }

// CART PAGE LOAD
async function loadCartPage() {
    const container = document.getElementById('cart-items-container');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    if(!container) return;
    container.innerHTML = '<div class="loader mx-auto"></div>';

    try {
        const res = await fetch(`/api/cart/${sessionId}`);
        const items = await res.json();
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-500">Korpa je prazna.</div>`;
            if(subtotalEl) subtotalEl.innerText = "0 RSD";
            if(totalEl) totalEl.innerText = "0 RSD";
            return;
        }
        let subtotal = 0;
        items.forEach(item => {
            const itemTotal = (item.discount_price || item.price) * item.quantity;
            subtotal += itemTotal;
            
            // Lokalna slika
            const imgUrl = item.image_url ? `${item.image_url}?v=1` : 'https://placehold.co/100';

            const row = document.createElement('div');
            row.className = 'flex flex-col sm:flex-row items-center gap-4 py-6 border-b border-slate-100';
            row.innerHTML = `
                <img src="${imgUrl}" class="w-20 h-20 object-contain bg-slate-50 rounded-lg p-2" onerror="this.src='https://placehold.co/100'">
                <div class="flex-grow text-center sm:text-left">
                    <h4 class="font-bold text-slate-800">${item.name}</h4>
                    <p class="text-sm text-slate-500">${parseInt(item.discount_price || item.price).toLocaleString()} RSD</p>
                </div>
                <div class="flex items-center gap-3">
                    <input type="number" min="1" value="${item.quantity}" onchange="updateQty(${item.cart_item_id}, this.value)" class="w-16 border rounded px-2 py-1 text-center">
                    <button onclick="removeItem(${item.cart_item_id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="font-bold text-slate-800 w-24 text-right">${itemTotal.toLocaleString()} RSD</div>
            `;
            container.appendChild(row);
        });
        if(subtotalEl) subtotalEl.innerText = subtotal.toLocaleString() + " RSD";
        if(totalEl) totalEl.innerText = subtotal.toLocaleString() + " RSD";
    } catch (e) { console.error(e); }
}

// Ostatak funkcija (addToCart, refreshCartCount, removeItem, updateQty, popup, filteri, auth) ostaje ISTI.
// Kopiraj ih iz prethodnog fajla da ne pravim preveliki odgovor.
// (Samo pazi da se zagrade lepo zatvore).

// ... Ovde kopiraj ostatak funkcija ...

async function removeItem(id) { await fetch(`/api/cart/remove/${id}`, { method: 'DELETE' }); loadCartPage(); refreshCartCount(); showNotification("Proizvod obrisan."); }
async function updateQty(id, qty) { if(qty < 1) return; await fetch('/api/cart/update', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart_item_id: id, quantity: qty }) }); loadCartPage(); refreshCartCount(); }
function showNotification(msg) { const t = document.getElementById('notification-toast'); const m = document.getElementById('notification-message'); if(t && m) { m.innerText = msg; t.classList.remove('translate-y-24', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-24', 'opacity-0'), 3000); } else { alert(msg); } }
async function checkPromoPopup() { const res = await fetch('/api/check-auth'); const data = await res.json(); if (data.loggedIn) return; const popupShown = localStorage.getItem('promo_popup_shown'); if (!popupShown) { setTimeout(() => { const popup = document.getElementById('promo-popup'); const content = document.getElementById('promo-content'); if(popup) { popup.classList.remove('hidden'); setTimeout(() => content.classList.remove('scale-95'), 100); } }, 3000); } }
function closePromoPopup() { const popup = document.getElementById('promo-popup'); if(popup) popup.classList.add('hidden'); localStorage.setItem('promo_popup_shown', 'true'); }
function switchTab(tab) { currentTab = tab; document.querySelectorAll('.tab-btn').forEach(btn => { if (btn.dataset.tab === tab) btn.classList.add('active'); else btn.classList.remove('active'); }); filterProducts(); }
function filterProducts() { if (allProducts.length === 0) return; const term = searchInput ? searchInput.value.toLowerCase() : ''; const maxPrice = priceSlider ? parseInt(priceSlider.value) : 100000; const checkedComplexity = Array.from(document.querySelectorAll('.filter-complexity:checked')).map(cb => cb.value); const checkedPlayers = Array.from(document.querySelectorAll('.filter-players:checked')).map(cb => cb.value); let filtered = allProducts.filter(item => { const finalPrice = item.discount_price || item.price; if (currentTab === 'akcije') { if (!item.discount_price) return false; } else if (currentTab !== 'all' && item.type !== currentTab) return false; if (term && !item.name.toLowerCase().includes(term)) return false; if (finalPrice > maxPrice) return false; if (checkedComplexity.length > 0) { if (!item.complexity || !checkedComplexity.includes(item.complexity)) return false; } if (checkedPlayers.length > 0) { if (!item.players_min || !item.players_max) return false; let match = false; if (checkedPlayers.includes('2') && (item.players_min <= 2 && item.players_max >= 2)) match = true; if (checkedPlayers.includes('3-5') && (item.players_max >= 3 && item.players_min <= 5)) match = true; if (checkedPlayers.includes('6+') && (item.players_max >= 6)) match = true; if (!match) return false; } return true; }); if (sortSelect) { const sort = sortSelect.value; if (sort === 'price-asc') filtered.sort((a,b) => (a.discount_price||a.price) - (b.discount_price||b.price)); if (sort === 'price-desc') filtered.sort((a,b) => (b.discount_price||b.price) - (a.discount_price||a.price)); if (sort === 'rating') filtered.sort((a,b) => b.rating - a.rating); } renderProducts(filtered); }
async function addToCart(gameId, event) { if(event) { event.stopPropagation(); event.preventDefault(); } try { const response = await fetch('/api/cart/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, game_id: gameId }) }); const data = await response.json(); if (data.success) { await refreshCartCount(); closeModal(); showNotification("Uspešno dodato u korpu!"); } else { alert("Greška pri dodavanju."); } } catch (error) { console.error("Greška:", error); } }
async function refreshCartCount() { if(!cartCount) return; try { const res = await fetch(`/api/cart/${sessionId}`); const items = await res.json(); const total = items.reduce((sum, item) => sum + item.quantity, 0); cartCount.innerText = total; cartCount.parentElement.classList.add('scale-110'); setTimeout(() => cartCount.parentElement.classList.remove('scale-110'), 200); } catch (e) { console.error(e); } }
async function checkUserLogin() { const navContainer = document.querySelector('nav .flex.items-center.gap-4'); if (!navContainer) return; try { const res = await fetch('/api/check-auth'); const data = await res.json(); const oldUserDiv = document.getElementById('user-auth-div'); if(oldUserDiv) oldUserDiv.remove(); const userDiv = document.createElement('div'); userDiv.id = 'user-auth-div'; userDiv.className = "flex items-center gap-3"; if (data.loggedIn) { userDiv.innerHTML = `<span class="text-sm font-bold text-indigo-600 hidden md:inline">Zdravo, ${data.username}</span><button onclick="logout()" class="text-sm font-medium text-slate-500 hover:text-red-500 transition">Odjavi se</button>`; } else { userDiv.innerHTML = `<a href="login.html" class="px-4 py-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition">Prijavi se</a><a href="register.html" class="hidden md:inline-block px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm">Registracija</a>`; } const cartLink = document.querySelector('a[href="cart.html"]'); if (cartLink && cartLink.parentNode) { cartLink.parentNode.insertBefore(userDiv, cartLink); } } catch (e) { console.error("Auth greška", e); } }
async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.reload(); }
if(searchInput) searchInput.addEventListener('input', filterProducts);
if(priceSlider) priceSlider.addEventListener('input', (e) => { if(priceVal) priceVal.innerText = parseInt(e.target.value).toLocaleString(); filterProducts(); });
if(sortSelect) sortSelect.addEventListener('change', filterProducts);
document.querySelectorAll('.filter-complexity, .filter-players').forEach(cb => cb.addEventListener('change', filterProducts));

init();