// --- KONFIGURACIJA KORISNIKA (SESSION) ---
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

// --- 1. INIT FUNKCIJA ---
async function init() {
    await refreshCartCount(); 

    if (document.getElementById('cart-items-container')) {
        loadCartPage();
        return; 
    }

    if (grid) {
        loadProducts();
    }
}

// --- 2. UČITAVANJE PROIZVODA (SHOP) ---
async function loadProducts() {
    loader.classList.remove('hidden');
    grid.innerHTML = '';
    
    try {
        const response = await fetch('/api/games'); 
        allProducts = await response.json();
        loader.classList.add('hidden');
        renderProducts(allProducts); 
    } catch (error) {
        console.error("Greška:", error);
        loader.innerHTML = `<p class="text-red-500 text-center">Greška pri povezivanju sa serverom.</p>`;
    }
}

function renderProducts(list) {
    grid.innerHTML = '';
    if(countEl) countEl.innerText = list.length;

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    list.forEach(game => {
        let badgeClass = 'bg-slate-100 text-slate-600';
        let complexityLabel = 'N/A';
        if (game.complexity === 'lako') { badgeClass = 'bg-green-100 text-green-700'; complexityLabel = 'Lako'; }
        else if (game.complexity === 'srednje') { badgeClass = 'bg-yellow-100 text-yellow-700'; complexityLabel = 'Srednje'; }
        else if (game.complexity === 'tesko') { badgeClass = 'bg-red-100 text-red-700'; complexityLabel = 'Teško'; }

        const imgUrl = game.image_url || 'https://placehold.co/400x300?text=Nema+Slike';
        
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-100 overflow-hidden card-hover transition flex flex-col h-full group';
        card.innerHTML = `
            <div class="relative h-56 p-6 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer" onclick="openModal(${game.id})">
                <img src="${imgUrl}" referrerpolicy="no-referrer" loading="lazy" class="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-110 drop-shadow-sm" onerror="this.src='https://placehold.co/400x300?text=Nema+Slike'">
                <div class="absolute top-3 right-3">
                     ${game.complexity ? `<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeClass} shadow-sm">${complexityLabel}</span>` : ''}
                </div>
            </div>
            <div class="p-5 flex flex-col flex-grow">
                <h3 class="font-bold text-lg text-slate-800 mb-1 leading-snug cursor-pointer hover:text-indigo-600 transition" onclick="openModal(${game.id})">${game.name}</h3>
                <div class="mt-auto flex justify-between items-end border-t border-dashed border-slate-200 pt-4">
                    <div><span class="block text-xs text-slate-400">Cena</span><span class="text-xl font-bold text-indigo-600">${parseInt(game.price).toLocaleString()} RSD</span></div>
                    <button onclick="addToCart(${game.id}, event)" class="bg-slate-100 hover:bg-indigo-600 hover:text-white text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center transition shadow-sm cursor-pointer z-20 relative">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

// --- 3. KORPA LOGIKA ---

async function addToCart(gameId, event) {
    if(event) {
        event.stopPropagation();
        event.preventDefault();
    }

    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                game_id: gameId
            })
        });

        const data = await response.json();

        if (data.success) {
            await refreshCartCount();
            closeModal();
            showNotification("Uspešno dodato u korpu!");
        } else {
            alert("Greška pri dodavanju.");
        }
    } catch (error) {
        console.error("Greška:", error);
        alert("Greška na serveru.");
    }
}

async function refreshCartCount() {
    if(!cartCount) return;
    try {
        const res = await fetch(`/api/cart/${sessionId}`);
        const items = await res.json();
        const total = items.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.innerText = total;
        
        cartCount.parentElement.classList.add('scale-110');
        setTimeout(() => cartCount.parentElement.classList.remove('scale-110'), 200);
    } catch (e) {
        console.error("Ne mogu da osvežim korpu", e);
    }
}

// --- 4. CART PAGE LOGIKA ---
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
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            const row = document.createElement('div');
            row.className = 'flex flex-col sm:flex-row items-center gap-4 py-6 border-b border-slate-100';
            row.innerHTML = `
                <img src="${item.image_url || ''}" referrerpolicy="no-referrer" class="w-20 h-20 object-contain bg-slate-50 rounded-lg p-2" onerror="this.src='https://placehold.co/100'">
                <div class="flex-grow text-center sm:text-left">
                    <h4 class="font-bold text-slate-800">${item.name}</h4>
                    <p class="text-sm text-slate-500">${parseInt(item.price).toLocaleString()} RSD</p>
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

    } catch (e) {
        console.error(e);
        container.innerHTML = "Greška pri učitavanju korpe.";
    }
}

async function removeItem(id) {
    await fetch(`/api/cart/remove/${id}`, { method: 'DELETE' });
    loadCartPage();
    refreshCartCount();
    showNotification("Proizvod obrisan.");
}

async function updateQty(id, qty) {
    if(qty < 1) return;
    await fetch('/api/cart/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_item_id: id, quantity: qty })
    });
    loadCartPage();
    refreshCartCount();
}

// --- 5. MODAL I NOTIFIKACIJE ---

function openModal(id) {
    const game = allProducts.find(p => p.id === id);
    if (!game) return;

    // Helperi
    const setText = (elemId, text) => { const el = document.getElementById(elemId); if(el) el.innerText = text; };
    const setSrc = (elemId, src) => { const el = document.getElementById(elemId); if(el) el.src = src; };

    setSrc('modal-img', game.image_url || '');
    setText('modal-title', game.name);
    setText('modal-price', parseInt(game.price).toLocaleString() + ' RSD');
    setText('modal-desc', game.description || 'Nema opisa.');
    
    setText('modal-rating', game.rating || '-');
    setText('modal-players', (game.players_min === game.players_max) ? game.players_min : `${game.players_min}-${game.players_max}`);
    setText('modal-time', game.playtime_min ? `${game.playtime_min} min` : '-');
    setText('modal-age', game.age_min ? `${game.age_min}+` : '-');
    setText('modal-complexity', game.complexity);

    // OVO JE KLJUČNA PROMENA: Gađamo specifično dugme "modal-add-btn"
    // Umesto "prvog dugmeta", sada selektujemo tačno ono koje smo nazvali "modal-add-btn"
    const modalBtn = document.getElementById('modal-add-btn');
    if (modalBtn) {
        // Ukloni stari listener (kloniranjem) i dodaj novi
        const newBtn = modalBtn.cloneNode(true);
        modalBtn.parentNode.replaceChild(newBtn, modalBtn);
        newBtn.onclick = (e) => addToCart(game.id, e);
    }

    // Video
    const vidContainer = document.getElementById('modal-video-container');
    const iframe = document.getElementById('modal-iframe');
    if (game.video_url && vidContainer && iframe) {
        vidContainer.classList.remove('hidden');
        iframe.src = game.video_url;
    } else if (vidContainer && iframe) {
        vidContainer.classList.add('hidden');
        iframe.src = "";
    }

    if(modal) modal.classList.remove('hidden');
}

function closeModal() {
    if(modal) modal.classList.add('hidden');
    const iframe = document.getElementById('modal-iframe');
    if(iframe) iframe.src = "";
}

function showNotification(msg) {
    const toast = document.getElementById('notification-toast');
    const msgEl = document.getElementById('notification-message');
    
    if(toast && msgEl) {
        msgEl.innerText = msg;
        toast.classList.remove('translate-y-24', 'opacity-0'); 
        setTimeout(() => {
            toast.classList.add('translate-y-24', 'opacity-0'); 
        }, 3000);
    } else {
        alert(msg);
    }
}

// --- FILTER LISTENERS ---
const searchInput = document.getElementById('search-input');
const priceSlider = document.getElementById('price-range');
if(searchInput) searchInput.addEventListener('input', () => filterProducts());
if(priceSlider) priceSlider.addEventListener('input', () => filterProducts());

function filterProducts() {
    // Logika filtriranja (kao i pre)
    // Ostavio sam skraćeno ovde jer se nije menjalo
    // Ali u potpunom fajlu bi trebalo da bude
}
// --- AUTH UI LOGIC (Dodaj ovo u script.js) ---

async function checkUserLogin() {
    // Proveravamo navigaciju, ako nema navigacije (npr login page), preskoči
    const navContainer = document.querySelector('nav .flex.items-center.gap-4') || document.querySelector('nav .flex.items-center.space-x-4');
    
    // Ako ne nađemo navigaciju, možda smo na stranici koja nema standardni meni
    if (!navContainer) return;

    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();

        // Kreiramo element za korisnika
        const userDiv = document.createElement('div');
        userDiv.className = "flex items-center gap-3";

        if (data.loggedIn) {
            // Ako je ulogovan: Prikaži ime i Logout dugme
            userDiv.innerHTML = `
                <span class="text-sm font-bold text-indigo-600 hidden md:inline">Zdravo, ${data.username}</span>
                <button onclick="logout()" class="text-sm font-medium text-slate-500 hover:text-red-500 transition">Odjavi se</button>
            `;
        } else {
            // Ako nije ulogovan: Prikaži Login dugme
            userDiv.innerHTML = `
                <a href="login.html" class="px-4 py-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition">Prijavi se</a>
                <a href="register.html" class="hidden md:inline-block px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm">Registracija</a>
            `;
        }

        // Ubacujemo pre ikonice korpe (ili na kraj navigacije)
        const cartLink = document.querySelector('a[href="cart.html"]');
        if (cartLink && cartLink.parentNode) {
            cartLink.parentNode.insertBefore(userDiv, cartLink);
        } else {
            navContainer.appendChild(userDiv);
        }

    } catch (e) {
        console.error("Greška pri proveri autentifikacije", e);
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
}

// OBAVEZNO: Pozovi ovu funkciju na kraju init-a ili na dnu fajla
checkUserLogin();
init();