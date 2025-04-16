document.addEventListener("DOMContentLoaded", () => {
    let map, markerGroup, currentDbId;
  
    // ─── Helpers ──────────────────────────────────────────────────────
    function dedupe(dbs) {
      const seen = new Set();
      return dbs.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
    }
  
    function getPageTitle(page) {
      const key = Object.keys(page.properties)
        .find(k => page.properties[k].type === "title");
      const arr = page.properties[key]?.title || [];
      return arr[0]?.plain_text || "No title";
    }
  
    function getAddress(page) {
      return getPageTitle(page);
    }
  
    async function geocodeAddress(addr) {
      const base = `/api/geocode?address=${encodeURIComponent(addr)}`;
      let res = await fetch(base);
      let j = await res.json();
      if (j.success) return { lat: +j.lat, lon: +j.lon };
      if (!/\b(CA|USA)\b/.test(addr)) {
        res = await fetch(base + `, CA, USA`);
        j   = await res.json();
        if (j.success) return { lat: +j.lat, lon: +j.lon };
      }
      return null;
    }
  
    // ─── Initialize Leaflet ────────────────────────────────────────────
    function initMap() {
      map = L.map("map").setView([37.7749, -122.4194], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      markerGroup = L.featureGroup().addTo(map);
    }
  
    // ─── Render pins for a database & update counts ───────────────────
    async function loadMapForDatabase(dbId, inEdit = false) {
      markerGroup.clearLayers();
      const res = await fetch(`/api/databases/${dbId}/pages`);
      const { results } = await res.json();
  
      const spots = [];
      for (const page of results) {
        const title = getPageTitle(page);
        const addr  = getAddress(page);
        let lat = page.properties.Latitude?.rich_text[0]?.plain_text;
        let lon = page.properties.Longitude?.rich_text[0]?.plain_text;
        if (!lat || !lon) {
          const g = await geocodeAddress(addr);
          if (g) { lat = g.lat; lon = g.lon; }
        }
        if (lat && lon) {
          spots.push({ title, addr, lat: +lat, lon: +lon });
        }
      }
  
      // Add markers
      spots.forEach(s => {
        L.marker([s.lat, s.lon])
          .addTo(markerGroup)
          .bindPopup(`<strong>${s.addr}</strong>`);
      });
  
      // Update counts
      const count = spots.length;
      document.getElementById("locationCount").textContent = count;
      const embedBadge = document.getElementById("embedCount");
      embedBadge.textContent = `${count} locations`;
      if (!inEdit) {
        embedBadge.style.display = "block";
      } else {
        embedBadge.style.display = "none";
      }
  
      // Fit map
      setTimeout(() => {
        map.invalidateSize();
        if (markerGroup.getLayers().length) {
          map.fitBounds(markerGroup.getBounds(), { padding: [20,20] });
        }
      }, 100);
    }
  
    // ─── Load sidebar list of maps (Notion DBs) ───────────────────────
    async function loadDatabases() {
      const res = await fetch("/api/databases");
      const { results } = await res.json();
      const mapList = document.getElementById("mapList");
      mapList.innerHTML = "";
  
      dedupe(results).forEach(db => {
        const title = db.title[0]?.plain_text || "(Untitled)";
        const card  = document.createElement("div");
        card.className = "map-card";
        card.innerHTML = `
          <div class="map-title">${title}</div>
          <div class="map-subtitle">Configure & copy link</div>
        `;
        card.onclick = () => openEditView(db.id, title);
        mapList.appendChild(card);
      });
    }
  
    // ─── Open the editor sidebar for a map ────────────────────────────
    async function openEditView(dbId, dbName) {
      currentDbId = dbId;
      document.getElementById("mapListView").style.display = "none";
      document.getElementById("mapEditView").style.display = "block";
  
      document.getElementById("dbSelect").innerHTML = `<option>${dbName}</option>`;
      const nameInput = document.getElementById("mapName");
      nameInput.value = dbName;
      // Embed link uses DB ID directly:
      document.getElementById("mapUrl").value =
        `${window.location.origin}/map/${dbId}`;
  
      // No slug logic needed any more
      document.getElementById("copyBtn").onclick = () => {
        const urlBox = document.getElementById("mapUrl");
        urlBox.select();
        document.execCommand("copy");
        alert("Copied!");
      };
  
      // Load property controls
      await loadDbProperties(dbId);
  
      // Show markers in the edit map
      await loadMapForDatabase(dbId, true);
    }
  
    // ─── Fetch and render DB properties controls ───────────────────────
    async function loadDbProperties(dbId) {
      const res = await fetch(`/api/databases/${dbId}`);
      const { properties } = await res.json();
  
      const colorSelect = document.getElementById("markerColorSelect");
      const visCont     = document.getElementById("visibleColumns");
      colorSelect.innerHTML = `<option value="">None</option>`;
      visCont.innerHTML = "";
  
      Object.entries(properties).forEach(([key, prop]) => {
        if (prop.type === "select" || prop.type === "multi_select") {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = key;
          colorSelect.append(opt);
        }
        const lbl = document.createElement("label");
        lbl.innerHTML = `<input type="checkbox" value="${key}" checked /> ${key}`;
        visCont.append(lbl);
      });
    }
  
    // ─── Save map stub ────────────────────────────────────────────────
    document.getElementById("saveMap").onclick = () => {
      const config = {
        dbId: currentDbId,
        name: document.getElementById("mapName").value,
        url:  document.getElementById("mapUrl").value,
        markerColorProp: document.getElementById("markerColorSelect").value,
        visibleColumns: Array.from(
          document.querySelectorAll("#visibleColumns input:checked")
        ).map(i => i.value),
      };
      console.log("Saved config:", config);
      alert("Map saved! Paste URL into Notion.");
    };
  
    // ─── Go back to list view ────────────────────────────────────────
    document.getElementById("goBack").onclick = e => {
      e.preventDefault();
      document.getElementById("mapEditView").style.display = "none";
      document.getElementById("mapListView").style.display = "block";
    };
  
    // ─── Menu toggle ────────────────────────────────────────────────
    document.getElementById("menuBtn").onclick = () => {
      const dd = document.getElementById("dropdown");
      dd.style.display = dd.style.display === "flex" ? "none" : "flex";
    };
  
    // ─── Bootstrap & URL detection ──────────────────────────────────
    initMap();
  
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "map" && parts[1]) {
      // Embed mode
      document.querySelector(".sidebar").style.display = "none";
      document.getElementById("embedCount").style.display = "block";
      loadMapForDatabase(parts[1], false);
      return;
    }
  
    // App mode
    loadDatabases();
  });
  