const ASSET_JSON_FILE = 'godot4_assets_with_stars_async.json';
const FAVORITES_LOCAL_STORAGE_KEY = 'godotAssetFavorites';
const ITEMS_PER_PAGE = 100;

let allAssets = [], currentlyDisplayedAssets = [], favoriteAssetIds = new Set(), preloadedImageUrls = new Set();
let currentPage = 1, uniqueCategories = new Set(), uniqueGodotVersions = new Set();

const dom = {
    filterTitle: document.getElementById('filterTitle'),
    filterAuthor: document.getElementById('filterAuthor'),
    filterCategory: document.getElementById('filterCategory'),
    filterGodotVersion: document.getElementById('filterGodotVersion'),
    filterMinStars: document.getElementById('filterMinStars'),
    filterFavorites: document.getElementById('filterFavorites'),
    sortKey: document.getElementById('sortKey'),
    assetGrid: document.getElementById('asset-grid'),
    assetCount: document.getElementById('asset-count'),
    resetFiltersBtn: document.getElementById('resetFilters'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageInfo: document.getElementById('pageInfo'),
    paginationControls: document.getElementById('paginationControls'),
    favModalOverlay: document.getElementById('favModalOverlay'),
    openFavModalBtn: document.getElementById('openFavModalBtn'),
    closeFavModalBtn: document.getElementById('closeFavModalBtn'),
    exportFavoritesBtn: document.getElementById('exportFavoritesBtn'),
    importFavoritesBtn: document.getElementById('importFavoritesBtn'),
    favoritesImportExportArea: document.getElementById('favoritesImportExportArea')
};

const GITHUB_URL_PATTERNS = [
    /https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i,
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\//i
];

function extractGithubRepoFromString(url) {
    if (!url || typeof url !== 'string') return null;
    for (const p of GITHUB_URL_PATTERNS) {
        const m = p.exec(url);
        if (m) return `${m[1]}/${m[2]}`;
    }
    return null;
}

function loadFavorites() {
    const s = localStorage.getItem(FAVORITES_LOCAL_STORAGE_KEY);
    if (s) {
        try {
            favoriteAssetIds = new Set(JSON.parse(s));
        } catch (e) {
            console.error("Err favs", e);
        }
    }
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_LOCAL_STORAGE_KEY, JSON.stringify(Array.from(favoriteAssetIds)));
}

function toggleFavoriteOnCard(assetId, cardEl) {
    const btn = cardEl.querySelector('.favorite-btn');
    if (favoriteAssetIds.has(assetId)) {
        favoriteAssetIds.delete(assetId);
        btn.classList.remove('favorited');
        btn.innerHTML = '☆';
        btn.title = 'Add';
    } else {
        favoriteAssetIds.add(assetId);
        btn.classList.add('favorited');
        btn.innerHTML = '★';
        btn.title = 'Remove';
    }
    saveFavorites();
    if (dom.filterFavorites.checked && !favoriteAssetIds.has(assetId)) {
        applyFiltersAndSort(false);
        const tp = Math.ceil(currentlyDisplayedAssets.length / ITEMS_PER_PAGE);
        if (currentPage > tp && tp > 0) currentPage = tp;
        else if (currentlyDisplayedAssets.length === 0) currentPage = 1;
        renderCurrentPage();
    }
}

async function loadAssets() {
    loadFavorites();
    try {
        const r = await fetch(ASSET_JSON_FILE);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        allAssets = await r.json();
        allAssets.forEach(a => {
            if (a.category) uniqueCategories.add(a.category);
            if (a.godot_version) uniqueGodotVersions.add(a.godot_version);
        });

        Array.from(uniqueCategories)
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .forEach(c => dom.filterCategory.add(new Option(c, c)));

        Array.from(uniqueGodotVersions)
            .sort((a, b) => {
                const pA = a.split('.').map(Number);
                const pB = b.split('.').map(Number);
                for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
                    const vA = pA[i] || 0;
                    const vB = pB[i] || 0;
                    if (vA !== vB) return vA - vB;
                }
                return 0;
            })
            .forEach(v => dom.filterGodotVersion.add(new Option(v, v)));

        applyFiltersAndSort();
    } catch (e) {
        dom.assetGrid.innerHTML = `<p class="no-results">Err: ${e.message}</p>`;
        dom.assetCount.textContent = 'Err.';
        dom.paginationControls.classList.add('hidden');
        console.error("Load fail:", e);
    }
}

function renderCurrentPage() {
    dom.assetGrid.innerHTML = '';
    const totalPages = Math.ceil(currentlyDisplayedAssets.length / ITEMS_PER_PAGE);
    currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageAssets = currentlyDisplayedAssets.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    if (pageAssets.length === 0) {
        dom.assetGrid.innerHTML = '<p class="no-results">No assets.</p>';
    }

    pageAssets.forEach(asset => {
        const card = document.createElement('div');
        card.className = 'asset-card';
        card.dataset.assetId = asset.asset_id;
        const isFav = favoriteAssetIds.has(asset.asset_id);
        const stars = asset.github_stars;
        const starsText = stars === -2 ? 'Limit' : (stars >= 0 ? stars : 'N/A');
        const assetLink = `https://godotengine.org/asset-library/asset/${asset.asset_id}`;
        const version = asset.version_string || 'N/A';
        const updated = asset.modify_date ? new Date(asset.modify_date).toLocaleDateString() : 'N/A';

        let tagsHTML = `<div class="tags">`;
        if (asset.category) tagsHTML += `<span class="tag tag-category">${asset.category}</span>`;
        if (asset.godot_version) tagsHTML += `<span class="tag tag-godotversion">${asset.godot_version}</span>`;
        if (asset.support_level) tagsHTML += `<span class="tag tag-supportlevel">${asset.support_level}</span>`;
        if (stars >= 0) tagsHTML += `<span class="tag tag-stars">★ ${starsText}</span>`;
        tagsHTML += `</div>`;

        let licenseHTML = asset.cost ? `<span class="license-tag-bottom">${asset.cost}</span>` : '';

        card.innerHTML = `
            <div class="icon-container">
                ${asset.icon_url ? 
                    `<img src="${asset.icon_url}" alt="${asset.title}" class="icon" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'no-icon-placeholder\\'>No Icon</div>'">` :
                    '<div class="no-icon-placeholder">No Icon</div>'
                }
            </div>
            <div class="content-wrapper">
                <div class="title-row">
                    <h3><a href="${assetLink}" target="_blank">${asset.title || 'Untitled'}</a></h3>
                </div>
                ${tagsHTML}
                <div class="author-row">By: <a href="#" class="author-name" data-author="${asset.author || ''}">${asset.author || 'Unknown'}</a></div>
                <div class="version-date-row">v${version} | ${updated}</div>
            </div>
            ${licenseHTML}
            <button class="favorite-btn ${isFav ? 'favorited' : ''}" title="${isFav ? 'Unfav' : 'Fav'}">${isFav ? '★' : '☆'}</button>
        `;

        dom.assetGrid.appendChild(card);
    });

    updatePaginationControls();
    dom.assetCount.textContent = `Showing ${pageAssets.length > 0 ? startIdx + 1 : 0}-${Math.min(startIdx + ITEMS_PER_PAGE, currentlyDisplayedAssets.length)} of ${currentlyDisplayedAssets.length} matching. (Total: ${allAssets.length})`;
}

function updatePaginationControls() {
    const tP = Math.ceil(currentlyDisplayedAssets.length / ITEMS_PER_PAGE);
    dom.pageInfo.textContent = `Page ${currentPage} of ${tP || 1}`;
    dom.prevPageBtn.disabled = currentPage === 1;
    dom.nextPageBtn.disabled = currentPage === tP || tP === 0;
    dom.paginationControls.classList.toggle('hidden', tP <= 1);
    dom.paginationControls.classList.toggle('visible', tP > 1);
}

function sortAssets(assets, sortKey) {
    return [...assets].sort((a, b) => {
        // show favorites first
        const aIsFav = favoriteAssetIds.has(a.asset_id);
        const bIsFav = favoriteAssetIds.has(b.asset_id);
        if (aIsFav !== bIsFav) {
            return aIsFav ? -1 : 1;
        }

        let vA, vB;
        const [key, dir] = sortKey.split('_');
        const m = dir === 'asc' ? 1 : -1;

        if (key === 'updated') {
            vA = new Date(a.modify_date || 0);
            vB = new Date(b.modify_date || 0);
        } else if (key === 'stars') {
            vA = a.github_stars >= 0 ? a.github_stars : -Infinity;
            vB = b.github_stars >= 0 ? b.github_stars : -Infinity;
        } else if (key === 'title') {
            vA = (a.title || '').toLowerCase();
            vB = (b.title || '').toLowerCase();
        } else return 0;

        if (vA < vB) return -1 * m;
        if (vA > vB) return 1 * m;
        return 0;
    });
}

function applyFiltersAndSort(resetPage = true) {
    const fT = dom.filterTitle.value.toLowerCase();
    const fA = dom.filterAuthor.value.toLowerCase();
    const fC = dom.filterCategory.value;
    const fGV = dom.filterGodotVersion.value;
    const fS = parseInt(dom.filterMinStars.value, 10);
    const fF = dom.filterFavorites.checked;
    const sK = dom.sortKey.value;

    let filt = allAssets.filter(a => 
        (!fT || (a.title && a.title.toLowerCase().includes(fT))) &&
        (!fA || (a.author && a.author.toLowerCase().includes(fA))) &&
        (!fC || a.category === fC) &&
        (!fGV || a.godot_version === fGV) &&
        (isNaN(fS) || (a.github_stars >= 0 && a.github_stars >= fS)) &&
        (!fF || favoriteAssetIds.has(a.asset_id))
    );

    currentlyDisplayedAssets = sortAssets(filt, sK);
    if (resetPage) currentPage = 1;
    renderCurrentPage();
}

function resetAllFilters() {
    dom.filterTitle.value = '';
    dom.filterAuthor.value = '';
    dom.filterCategory.value = '';
    dom.filterGodotVersion.value = '';
    dom.filterMinStars.value = '';
    dom.filterFavorites.checked = false;
    applyFiltersAndSort();
}

function preloadNextPageImages() {
    const tP = Math.ceil(currentlyDisplayedAssets.length / ITEMS_PER_PAGE);
    if (currentPage < tP) {
        const nA = currentlyDisplayedAssets.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
        nA.forEach(a => {
            if (a.icon_url && !preloadedImageUrls.has(a.icon_url)) {
                const i = new Image();
                i.src = a.icon_url;
                preloadedImageUrls.add(a.icon_url);
            }
        });
    }
}

function exportFavorites() {
    const ghFavs = [];
    favoriteAssetIds.forEach(id => {
        const a = allAssets.find(x => x.asset_id === id);
        if (a) {
            let rS = extractGithubRepoFromString(a.browse_url);
            if (!rS) rS = extractGithubRepoFromString(a.icon_url);
            if (rS && !ghFavs.includes(rS)) ghFavs.push(rS);
        }
    });
    const favsText = ghFavs.join('\n');
    if (favsText) {
        navigator.clipboard.writeText(favsText).then(() => {
            alert(`${ghFavs.length} GitHub favs copied to clipboard.`);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard. Please try again.');
        });
    } else {
        alert("No GitHub favs found.");
    }
}

function importFavorites() {
    const txt = dom.favoritesImportExportArea.value.trim();
    if (!txt) {
        alert("Paste list first.");
        return;
    }
    const repos = txt.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.includes('/'));
    let count = 0;
    const newFavs = new Set();
    repos.forEach(r => {
        const found = allAssets.find(a => {
            let aRS = extractGithubRepoFromString(a.browse_url);
            if (!aRS) aRS = extractGithubRepoFromString(a.icon_url);
            return aRS && aRS.toLowerCase() === r.toLowerCase();
        });
        if (found && !favoriteAssetIds.has(found.asset_id)) {
            newFavs.add(found.asset_id);
            count++;
        }
    });
    if (newFavs.size > 0) {
        newFavs.forEach(id => favoriteAssetIds.add(id));
        saveFavorites();
        applyFiltersAndSort(false);
        alert(`${count} new fav(s) imported.`);
    } else if (repos.length > 0) {
        alert("No new matching/unfavorited assets found.");
    } else {
        alert("No valid 'owner/repo' found.");
    }
    dom.favoritesImportExportArea.value = '';
}

// Event Listeners
Object.values(dom)
    .filter(el => el && ['filterTitle', 'filterAuthor', 'filterMinStars'].includes(el.id))
    .forEach(i => i.addEventListener('input', () => applyFiltersAndSort()));

Object.values(dom)
    .filter(el => el && ['filterCategory', 'filterGodotVersion', 'filterFavorites', 'sortKey'].includes(el.id))
    .forEach(s => s.addEventListener('change', () => applyFiltersAndSort()));

dom.resetFiltersBtn.addEventListener('click', resetAllFilters);
dom.prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderCurrentPage();
        window.scrollTo(0, 0);
    }
});
dom.nextPageBtn.addEventListener('click', () => {
    const tP = Math.ceil(currentlyDisplayedAssets.length / ITEMS_PER_PAGE);
    if (currentPage < tP) {
        currentPage++;
        renderCurrentPage();
        window.scrollTo(0, 0);
    }
});
dom.nextPageBtn.addEventListener('mouseenter', preloadNextPageImages);
dom.exportFavoritesBtn.addEventListener('click', exportFavorites);
dom.importFavoritesBtn.addEventListener('click', importFavorites);

dom.assetGrid.addEventListener('click', function(e) {
    const favB = e.target.closest('.favorite-btn');
    const authL = e.target.closest('.author-name');
    if (favB) {
        const card = e.target.closest('.asset-card');
        const id = card.dataset.assetId;
        if (id) toggleFavoriteOnCard(id, card);
    } else if (authL) {
        e.preventDefault();
        const name = authL.dataset.author;
        if (name) {
            dom.filterAuthor.value = name;
            applyFiltersAndSort();
        }
    }
});

// Modal open/close logic
dom.openFavModalBtn.addEventListener('click', () => {
    dom.favModalOverlay.classList.remove('hidden');
    dom.favModalOverlay.classList.add('visible');
});
dom.closeFavModalBtn.addEventListener('click', () => {
    dom.favModalOverlay.classList.remove('visible');
    dom.favModalOverlay.classList.add('hidden');
});
dom.favModalOverlay.addEventListener('click', (event) => {
    if (event.target === dom.favModalOverlay) {
        dom.favModalOverlay.classList.remove('visible');
        dom.favModalOverlay.classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', loadAssets); 