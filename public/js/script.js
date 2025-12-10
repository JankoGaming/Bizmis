// Globalne promenljive
let allProducts = [];
let currentTab = 'all';
let cart = 0;

// DOM Elementi
const grid = document.getElementById('product-grid');
const loader = document.getElementById('loader');
const noResults = document.getElementById('no-results');
const countEl = document.getElementById('results-count');

const searchInput = document.getElementById('search-input');
const priceSlider = document.getElementById('price-range');
const priceVal = document.getElementById('price-val');
const sortSelect = document.getElementById('sort-select');
const cartCount = document.getElementById('cart-count');
const modal = document.getElementById('product-modal');

// --- 1. INIT FUNKCIJA (API POZIV) ---
async function init() {
    loader.classList.remove('hidden');
    grid.innerHTML = '';
    
    try {
        // Poziv ka tvom Node.js serveru
        const response = await fetch('/api/games'); 
        
        if (!response.ok) {
            throw new Error('Mreža nije odgovorila kako treba (Network response was not ok)');
        }
        
        allProducts = await response.json();
        
        loader.classList.add('hidden');
        filterProducts(); // Inicijalno renderovanje
    } catch (error) {
        console.error("Greška pri učitavanju:", error);
        loader.innerHTML = `
            <div class="text-center w-full text-red-500">
                <p class="font-bold">Greška pri učitavanju podataka.</p>
                <p class="text-sm">Proveri da li je Node.js server pokrenut.</p>
            </div>`;
    }
}

// --- 2. RENDER FUNKCIJA ---
function renderProducts(list) {
    grid.innerHTML = '';
    countEl.innerText = list.length;

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    list.forEach(game => {
        // Određivanje boja za težinu
        let badgeClass = 'bg-slate-100 text-slate-600';
        let complexityLabel = 'N/A';
        
        if (game.complexity === 'lako') { 
            badgeClass = 'bg-green-100 text-green-700'; 
            complexityLabel = 'Lako';
        } else if (game.complexity === 'srednje') { 
            badgeClass = 'bg-yellow-100 text-yellow-700'; 
            complexityLabel = 'Srednje';
        } else if (game.complexity === 'tesko') { 
            badgeClass = 'bg-red-100 text-red-700'; 
            complexityLabel = 'Teško';
        }

        // Formatiranje broja igrača
        const playersText = (game.players_min === game.players_max) 
            ? (game.players_min || '-') 
            : `${game.players_min}-${game.players_max}`;
        
        // Fallback slika ako URL nije validan ili ne postoji
        const imgUrl = game.image_url || 'https://placehold.co/400x300?text=Nema+Slike';

        // Kreiranje HTML kartice
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-100 overflow-hidden card-hover transition flex flex-col h-full group';
        card.innerHTML = `
            <div class="relative h-56 p-6 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer" onclick="openModal(${game.id})">
                <img src="${imgUrl}" referrerpolicy="no-referrer" loading="lazy" class="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-110 drop-shadow-sm" onerror="this.src='https://placehold.co/400x300?text=Nema+Slike'">
                
                <div class="absolute top-3 right-3 flex flex-col gap-2">
                        ${game.complexity ? `<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeClass} shadow-sm">${complexityLabel}</span>` : ''}
                </div>
            </div>
            
            <div class="p-5 flex flex-col flex-grow">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">
                        ${game.type === 'tcg' ? 'TCG' : (game.type === 'equipment' ? 'Oprema' : 'Board Game')}
                    </span>
                    <div class="flex items-center text-yellow-400 text-xs font-bold gap-1">
                        <i class="fa-solid fa-star"></i> ${game.rating || '-'}
                    </div>
                </div>

                <h3 class="font-bold text-lg text-slate-800 mb-1 leading-snug cursor-pointer hover:text-indigo-600 transition" onclick="openModal(${game.id})">
                    ${game.name}
                </h3>

                ${game.type !== 'equipment' ? `
                <div class="flex items-center gap-3 text-xs text-slate-500 mb-4 mt-2">
                    <div class="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        <i class="fa-solid fa-users text-slate-400"></i> ${playersText}
                    </div>
                    <div class="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        <i class="fa-regular fa-clock text-slate-400"></i> ${game.playtime_min ? game.playtime_min + 'm' : '-'}
                    </div>
                </div>
                ` : '<div class="mb-4"></div>'}

                <div class="mt-auto flex justify-between items-end border-t border-dashed border-slate-200 pt-4">
                    <div>
                        <span class="block text-xs text-slate-400">Cena</span>
                        <span class="text-xl font-bold text-indigo-600">${parseInt(game.price).toLocaleString()} RSD</span>
                    </div>
                    <button onclick="addToCart(event)" class="bg-slate-100 hover:bg-indigo-600 hover:text-white text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center transition shadow-sm">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- 3. FILTER FUNKCIJE ---
function switchTab(tab) {
    currentTab = tab;
    // Ažuriraj aktivnu klasu na dugmićima
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    filterProducts();
}

function filterProducts() {
    const term = searchInput.value.toLowerCase();
    const maxPrice = parseInt(priceSlider.value);
    
    // Dohvati selektovane checkbox-ove
    const checkedComplexity = Array.from(document.querySelectorAll('.filter-complexity:checked')).map(cb => cb.value);
    const checkedPlayers = Array.from(document.querySelectorAll('.filter-players:checked')).map(cb => cb.value);

    let filtered = allProducts.filter(item => {
        // 1. Tab (Kategorija)
        if (currentTab !== 'all' && item.type !== currentTab) return false;
        
        // 2. Pretraga (Naziv)
        if (!item.name.toLowerCase().includes(term)) return false;
        
        // 3. Cena
        if (parseInt(item.price) > maxPrice) return false;

        // 4. Težina
        if (checkedComplexity.length > 0 && !checkedComplexity.includes(item.complexity)) return false;

        // 5. Broj Igrača
        if (checkedPlayers.length > 0) {
            let match = false;
            // Provera opsega igrača
            if (checkedPlayers.includes('2') && item.players_min <= 2 && item.players_max >= 2) match = true;
            if (checkedPlayers.includes('3-5') && (item.players_max >= 3 && item.players_min <= 5)) match = true;
            if (checkedPlayers.includes('6+') && item.players_max >= 6) match = true;
            
            if (!match) return false;
        }

        return true;
    });

    // Sortiranje
    const sort = sortSelect.value;
    if (sort === 'price-asc') filtered.sort((a,b) => a.price - b.price);
    if (sort === 'price-desc') filtered.sort((a,b) => b.price - a.price);
    if (sort === 'rating') filtered.sort((a,b) => b.rating - a.rating);

    renderProducts(filtered);
}

// --- 4. MODAL & KORPA ---
function openModal(id) {
    const game = allProducts.find(p => p.id === id);
    if (!game) return;

    // Popunjavanje podataka
    document.getElementById('modal-img').src = game.image_url || 'https://placehold.co/400x400?text=Nema+Slike';
    document.getElementById('modal-title').innerText = game.name;
    document.getElementById('modal-price').innerText = parseInt(game.price).toLocaleString() + ' RSD';
    document.getElementById('modal-rating').innerText = game.rating || '-';
    document.getElementById('modal-desc').innerText = game.description || 'Nema opisa.';
    
    document.getElementById('modal-type').innerText = game.type === 'tcg' ? 'Trading Cards' : 'Board Game';
    
    // Specifikacije
    document.getElementById('modal-players').innerText = (game.players_min === game.players_max) ? game.players_min : `${game.players_min}-${game.players_max}`;
    document.getElementById('modal-time').innerText = game.playtime_min ? `${game.playtime_min} min` : '-';
    document.getElementById('modal-age').innerText = game.age_min ? `${game.age_min}+` : '-';
    
    let compText = '-';
    if(game.complexity === 'lako') compText = 'Lako';
    if(game.complexity === 'srednje') compText = 'Srednje';
    if(game.complexity === 'tesko') compText = 'Teško';
    document.getElementById('modal-complexity').innerText = compText;

    // Video
    const vidContainer = document.getElementById('modal-video-container');
    const iframe = document.getElementById('modal-iframe');
    
    if (game.video_url) {
        vidContainer.classList.remove('hidden');
        iframe.src = game.video_url;
    } else {
        vidContainer.classList.add('hidden');
        iframe.src = "";
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    document.getElementById('modal-iframe').src = ""; // Stop video
}

function addToCart(e) {
    if(e) e.stopPropagation();
    cart++;
    cartCount.innerText = cart;
    
    // Animacija
    cartCount.parentElement.classList.add('scale-110');
    setTimeout(() => {
        cartCount.parentElement.classList.remove('scale-110');
    }, 200);
}

// --- 5. EVENT LISTENERI ---
searchInput.addEventListener('input', filterProducts);

priceSlider.addEventListener('input', (e) => {
    priceVal.innerText = parseInt(e.target.value).toLocaleString();
    filterProducts();
});

sortSelect.addEventListener('change', filterProducts);

// Checkbox eventi
document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', filterProducts);
});

// Reset dugme
document.getElementById('reset-filters').addEventListener('click', () => {
    searchInput.value = '';
    priceSlider.value = 25000;
    priceVal.innerText = '25.000';
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    switchTab('all'); // Vraća na sve tabove i filtrira
});

// Mobilni filter toggle
document.getElementById('toggle-filters').addEventListener('click', () => {
    document.getElementById('filter-container').classList.toggle('hidden');
});

// Inicijalizacija aplikacije
init();