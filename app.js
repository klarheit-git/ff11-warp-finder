const serviceLabels = {
    homepoint: 'ホームポイント',
    survival_guide: 'サバイバルガイド',
    wanted: 'ウォンテッド'
};
const lang = "jp";

const fromAreaSelect = document.getElementById('from-area');
const toAreaSelect = document.getElementById('to-area');
const areaSearchInput = document.getElementById('area-search');
const summaryBox = document.getElementById('summary');
const routeList = document.getElementById('route-list');

let areas = [];
let areasById = new Map();
let areaLabels = new Map();
let locations = [];
let locationsById = new Map();
let routeIndexFrom = new Map();
let routeIndexTo = new Map();

function formatAreaLabel(area) {
    return `${area.name_jp} / ${area.name_en}`;
}

function buildRouteIndex(direction = 'to') {
    const index = new Map();

    const registerRouteEntry = (service, sourceArea, destinationArea, warp, location) => {
        const key = direction === 'from' ? sourceArea.id : destinationArea.id;
        const areaId = direction === 'from' ? destinationArea.id : sourceArea.id;
        const area = direction === 'from' ? destinationArea : sourceArea;

        if (!index.has(key)) {
            index.set(key, []);
        }

        const routes = index.get(key);
        let existing = routes.find(route =>
            route.areaId === areaId && route.service === service
        );

        if (!existing) {
            existing = {
                areaId,
                area,
                service,
                entries: []
            };
            routes.push(existing);
        }

        existing.entries.push({
            label: location.name_jp,
            description: location.description,
            locationId: location.id,
            pos: location.pos,
            cost: warp.cost,
            time: warp.time,
            conditions: warp.conditions_jp || []
        });
    };

    const register = (service, warpEntries) => {
        warpEntries.forEach((warp) => {
            const location = locationsById.get(warp.to);
            if (!location) {
                return;
            }
            const destinationArea = areasById.get(location.area);
            if (!destinationArea) {
                return;
            }
            const sourceAreas = areas.filter((area) => area.warp_services?.includes(service));

            sourceAreas.forEach((sourceArea) => {
                registerRouteEntry(service, sourceArea, destinationArea, warp, location);
            });
        });
    };

    const registerWanted = (warp) => {
        const sourceLocation = locationsById.get(warp.from);
        const destinationLocation = locationsById.get(warp.to);
        if (!sourceLocation || !destinationLocation) {
            return;
        }

        const sourceArea = areasById.get(sourceLocation.area);
        const destinationArea = areasById.get(destinationLocation.area);
        if (!sourceArea || !destinationArea) {
            return;
        }

        registerRouteEntry('wanted', sourceArea, destinationArea, warp, destinationLocation);
    };

    register('homepoint', window.homepoints || []);
    register('survival_guide', window.survivalGuides || []);
    (window.wantedWarps || []).forEach(registerWanted);

    // ソート。なんかしたかったらここでやる。
    // index.forEach((routes) => {
    //     routes.sort((left, right) => left.area.name_jp.localeCompare(right.area.name_jp, 'ja'));
    // });

    return index;
}

function populateAreaSelect(select, selectedValue, query = '') {
    select.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const normalizedQuery = query.trim().toLowerCase();
    const matchedAreas = areas.filter((area) => {
        if (!normalizedQuery) {
            return true;
        }

        const haystack = `${area.name_jp} ${area.name_en}`.toLowerCase();
        return haystack.includes(normalizedQuery);
    });

    if (matchedAreas.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '一致するエリアがありません';
        option.disabled = true;
        fragment.appendChild(option);
        select.appendChild(fragment);
        select.value = '';
        return;
    }

    matchedAreas.forEach((area) => {
        const option = document.createElement('option');
        option.value = area.id;
        option.textContent = `${area.name_jp} (${area.name_en})`;
        fragment.appendChild(option);
    });

    select.appendChild(fragment);
    select.value = matchedAreas.some((area) => area.id === selectedValue)
        ? selectedValue
        : matchedAreas[0]?.id || '';
}

function populateDestinationSelect(sourceAreaId) {
    const routes = routeIndexFrom.get(sourceAreaId) || [];
    const destinationIds = [...new Set(routes.map((route) => route.areaId))];
    const fragment = document.createDocumentFragment();

    destinationIds.forEach((areaId) => {
        const area = areasById.get(areaId);
        if (!area) {
            return;
        }
        const option = document.createElement('option');
        option.value = area.id;
        option.textContent = `${area.name_jp} (${area.name_en})`;
        fragment.appendChild(option);
    });

    toAreaSelect.innerHTML = '';
    toAreaSelect.appendChild(fragment);

    if (!toAreaSelect.value && destinationIds.length > 0) {
        toAreaSelect.value = destinationIds[0];
    }
}
function populateSourceSelect(destinationAreaId) {
    const routes = routeIndexTo.get(destinationAreaId) || [];

    fromAreaSelect.innerHTML = '';

    [...new Set(routes.map(r => r.areaId))]
        .forEach(areaId => {
            const area = areasById.get(areaId);
            if (!area) return;

            const option = document.createElement('option');
            option.value = area.id;
            option.textContent =
                `${area.name_jp} (${area.name_en})`;

            fromAreaSelect.appendChild(option);
        });

    if (routes.length === 0) {
        fromAreaSelect.value = '';
        return;
    }
    fromAreaSelect.value = routes[0].areaId;
}


function renderSummary(fromAreaId, toAreaId) {
    const fromArea = areasById.get(fromAreaId);
    const toArea = areasById.get(toAreaId);

    // if (!fromArea || !toArea) {
    //     summaryBox.innerHTML = '<p>エリア情報を読み込めませんでした。</p>';
    //     return;
    // }
    if (!toArea) {
        summaryBox.innerHTML = '<p>エリア情報を読み込めませんでした。</p>';
        return;
    }

    if (!fromArea) {
        summaryBox.innerHTML = `
            <h2>${toArea.name_jp}</h2>
            <p>このエリアへ直接移動できるワープはありません。</p>
        `;
        return;
    }


    // const routes = (routeIndexFrom.get(fromArea.id) || []).filter((route) => route.areaId === toArea.id);
    const routes = (routeIndexTo.get(toArea.id) || []).filter(route => route.areaId === fromArea.id);

    const availableServices = routes.map((route) => serviceLabels[route.service]).join(' / ');

    summaryBox.innerHTML = `
    <h2>${fromArea.name_jp} → ${toArea.name_jp}</h2>
    <p>
      ${availableServices ? `利用可能なワープ: ${availableServices}` : 'この組み合わせには対応するワープがありません。'}
    </p>
  `;
}

function renderRoutes(fromAreaId, toAreaId) {
    const fromArea = areasById.get(fromAreaId);
    const toArea = areasById.get(toAreaId);

    if (!toArea) {
        routeList.innerHTML = '<div class="empty-state">エリア情報を読み込めませんでした。</div>';
        return;
    }
    if (!fromArea) {
        routeList.innerHTML = '<div class="empty-state">このエリアへ直接移動できるワープはありません</div>';
        return;
    }


    // const routes = (routeIndexFrom.get(fromArea.id) || []).filter((route) => route.areaId === toArea.id);
    const routes = (routeIndexTo.get(toArea.id) || []).filter(route => route.areaId === fromArea.id);


    if (routes.length === 0) {
        routeList.innerHTML = '<div class="empty-state">このエリア間には表示できるワープがありません。</div>';
        return;
    }

    routeList.innerHTML = routes
        .map((route) => {
            const entries = route.entries
                .map((entry) => {
                    const costParts = Object.entries(entry.cost || {})
                        // .map(([key, value]) => `${key}: ${value}`) // 行き先によって値段変わる計算までやる意義が薄いから、保留
                        .map(([key, value]) => `${key}`)
                        .join(', ');
                    const conditionText = entry.conditions.length > 0 ? entry.conditions.join(', ') : '条件なし';
                    return `
            <li>
              <strong>${entry.label}</strong><br />
                <!-- pos: &lt;${entry.pos}&gt; / コスト: ${costParts || 'なし'} / 時間: ${entry.time}分 / 条件: ${conditionText} -->
                ${entry.description || ''} / pos: &lt;${entry.pos}&gt; / コスト: ${costParts || 'なし'} / 条件: ${conditionText}
            </li>
          `;
                })
                .join('');

            return `
        <article class="route-card">
          <h3>${serviceLabels[route.service]}</h3>
          <div class="route-meta">
            <span class="badge">${fromArea.name_jp} → ${toArea.name_jp}</span>
            <span class="badge">${route.entries.length}件</span>
          </div>
          <ul>${entries}</ul>
        </article>
      `;
        })
        .join('');
}

async function loadData() {
    const [areaResponse, locationResponse, homepointResponse, survivalGuideResponse, wantedResponse] = await Promise.all([
        fetch('./data/area.json'),
        fetch('./data/locations.json'),
        fetch('./data/warp/homepoints.json'),
        fetch('./data/warp/survival-guides.json'),
        fetch('./data/warp/wanted.json')
    ]);

    areas = await areaResponse.json();
    locations = await locationResponse.json();
    const homepoints = await homepointResponse.json();
    const survivalGuides = await survivalGuideResponse.json();
    const wantedWarps = await wantedResponse.json();

    areasById = new Map(areas.map((area) => [area.id, area]));
    locationsById = new Map(locations.map((location) => [location.id, location]));
    window.homepoints = homepoints;
    window.survivalGuides = survivalGuides;
    window.wantedWarps = wantedWarps;
    routeIndexFrom = buildRouteIndex('from');
    routeIndexTo = buildRouteIndex('to');

    // populateAreaSelect(fromAreaSelect, areas[0]?.id);
    // populateDestinationSelect(fromAreaSelect.value);
    populateAreaSelect(toAreaSelect, areas[0]?.id);
    populateSourceSelect(toAreaSelect.value);
    renderSummary(fromAreaSelect.value, toAreaSelect.value);
    renderRoutes(fromAreaSelect.value, toAreaSelect.value);
}

fromAreaSelect.addEventListener('change', () => {
    // populateDestinationSelect(fromAreaSelect.value);
    renderSummary(fromAreaSelect.value, toAreaSelect.value);
    renderRoutes(fromAreaSelect.value, toAreaSelect.value);
});

toAreaSelect.addEventListener('change', () => {
    populateSourceSelect(toAreaSelect.value);
    renderSummary(fromAreaSelect.value, toAreaSelect.value);
    renderRoutes(fromAreaSelect.value, toAreaSelect.value);
});

areaSearchInput.addEventListener('input', () => {
    const query = areaSearchInput.value;

    populateAreaSelect(toAreaSelect, toAreaSelect.value, query);
    populateSourceSelect(toAreaSelect.value);
    renderSummary(fromAreaSelect.value, toAreaSelect.value);
    renderRoutes(fromAreaSelect.value, toAreaSelect.value);
});

loadData().catch((error) => {
    summaryBox.innerHTML = '<p>データの読み込みに失敗しました。</p>';
    routeList.innerHTML = `<div class="empty-state">${error.message}</div>`;
});
