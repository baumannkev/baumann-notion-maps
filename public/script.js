document.addEventListener("DOMContentLoaded", async () => {
    let map, markerGroup, currentDbId;
    let embedSpots = [];
    let embedMarkers = [];
  
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
      let res = await fetch(base), j = await res.json();
      if (j.success) return { lat: +j.lat, lon: +j.lon };
      if (!/\b(CA|USA)\b/.test(addr)) {
        res = await fetch(base + `, CA, USA`), j = await res.json();
        if (j.success) return { lat: +j.lat, lon: +j.lon };
      }
      return null;
    }
  
    // ─── Initialize Leaflet (zoomControl disabled) ───────────────────
    function initMap() {
      map = L.map("map", { zoomControl: false })
        .setView([37.7749, -122.4194], 12);
      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "&copy; OpenStreetMap contributors" }
      ).addTo(map);
      markerGroup = L.featureGroup().addTo(map);
    }
  
    // ─── Fetch all pages for a DB ──────────────────────────────────────
    async function fetchSpots(dbId) {
      const res = await fetch(`/api/databases/${dbId}/pages`);
      const { results } = await res.json();
      const spots = [];
      for (const page of results) {
        const addr = getAddress(page);
        let lat = page.properties.Latitude?.rich_text[0]?.plain_text;
        let lon = page.properties.Longitude?.rich_text[0]?.plain_text;
        if (!lat || !lon) {
          const g = await geocodeAddress(addr);
          if (g) { lat = g.lat; lon = g.lon; }
        }
        if (lat && lon) {
          spots.push({ page, addr, lat: +lat, lon: +lon });
        }
      }
      return spots;
    }
  
    // ─── Render markers and return marker instances ───────────────────
    function renderMarkers(spots) {
      markerGroup.clearLayers();
      spots.forEach(s => {
        L.marker([s.lat, s.lon])
          .addTo(markerGroup)
          .bindPopup(`<strong>${s.addr}</strong>`);
      });
      setTimeout(() => {
        map.invalidateSize();
        if (markerGroup.getLayers().length) {
          map.fitBounds(markerGroup.getBounds(), { padding: [20,20] });
        }
      }, 100);
    }
  
    // ─── Render the embed list with click‐to‐focus ────────────────────
    function renderEmbedList() {
      const list = document.getElementById("markerList");
      list.innerHTML = "";
      embedSpots.forEach((s, i) => {
        const item = document.createElement("div");
        item.className = "marker-item";
        item.innerHTML = `<div class="marker-title">${s.addr}</div>`;
        item.onclick = () => {
          const m = embedMarkers[i];
          map.setView(m.getLatLng(), 16);
          m.openPopup();
        };
        Object.entries(s.page.properties).forEach(([key, prop]) => {
          if (prop.type === "title" || key === "Latitude" || key === "Longitude")
            return;
          let val = "";
          switch (prop.type) {
            case "url":
              val = prop.url
                ? `<a href="${prop.url}" target="_blank">${prop.url}</a>`
                : "";
              break;
            case "number":
              val = prop.number ?? "";
              break;
            case "select":
              val = prop.select?.name ?? "";
              break;
            case "multi_select":
              val = prop.multi_select.map(x => x.name).join(", ");
              break;
            case "rich_text":
              val = prop.rich_text.map(t => t.plain_text).join("") || "";
              break;
            case "phone_number":
              val = prop.phone_number;
              break;
            default:
              return;
          }
          if (val) {
            item.innerHTML += `
              <div class="marker-prop">
                <span class="prop-name">${key}</span>${val}
              </div>`;
          }
        });
        list.appendChild(item);
      });
    }
  
    // ─── Toggle for embed list sidebar ────────────────────────────────
    document.getElementById("toggleListBtn").onclick = () => {
      const sb = document.querySelector(".embedSidebar");
      if (sb.style.display === "block") {
        sb.style.display = "none";
      } else {
        renderEmbedList();
        sb.style.display = "block";
      }
    };
  
    // ─── Load maps list for main mode ─────────────────────────────────
    async function loadDatabases() {
      const res = await fetch("/api/databases");
      const { results } = await res.json();
      const mapList = document.getElementById("mapList");
      mapList.innerHTML = "";
      dedupe(results).forEach(db => {
        const title = db.title[0]?.plain_text || "(Untitled)";
        const card = document.createElement("div");
        card.className = "map-card";
        card.innerHTML = `
          <div class="map-title">${title}</div>
          <div class="map-subtitle">Configure & copy link</div>`;
        card.onclick = () => openEditView(db.id, title);
        mapList.appendChild(card);
      });
    }
  
    // ─── Open edit UI for main site ────────────────────────────────────
    async function openEditView(dbId, dbName) {
      currentDbId = dbId;
      document.getElementById("mapListView").style.display = "none";
      document.getElementById("mapEditView").style.display = "block";
  
      document.getElementById("dbSelect").innerHTML = `<option>${dbName}</option>`;
      document.getElementById("mapName").value = dbName;
      document.getElementById("mapUrl").value = `${window.location.origin}/map/${dbId}`;
      document.getElementById("locationCount").textContent = "…";
  
      document.getElementById("copyBtn").onclick = () => {
        const urlBox = document.getElementById("mapUrl");
        urlBox.select();
        document.execCommand("copy");
        alert("Copied!");
      };
  
      await loadDbProperties(dbId);
  
      const spots = await fetchSpots(dbId);
      renderMarkers(spots);
      document.getElementById("locationCount").textContent = spots.length;
    }
  
    // ─── Load & render DB properties controls ────────────────────────
    async function loadDbProperties(dbId) {
      const res = await fetch(`/api/databases/${dbId}`),
            { properties } = await res.json();
      const colorSelect = document.getElementById("markerColorSelect"),
            visCont = document.getElementById("visibleColumns");
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
  
    // ─── Save stub ──────────────────────────────────────────────────
    document.getElementById("saveMap").onclick = () => {
      const config = {
        dbId: currentDbId,
        name: document.getElementById("mapName").value,
        url: document.getElementById("mapUrl").value,
        markerColorProp: document.getElementById("markerColorSelect").value,
        visibleColumns: Array.from(
          document.querySelectorAll("#visibleColumns input:checked")
        ).map(i => i.value),
      };
      console.log("Saved config:", config);
      alert("Map saved! Paste URL into Notion.");
    };
  
    // ─── Go back in edit mode ────────────────────────────────────────
    document.getElementById("goBack").onclick = e => {
      e.preventDefault();
      document.getElementById("mapEditView").style.display = "none";
      document.getElementById("mapListView").style.display = "block";
    };
  
    // ─── Bootstrap & detect embed vs app mode ───────────────────────
    initMap();
  
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "map" && parts[1]) {
      // Embed mode
      document.querySelector(".sidebar").style.display = "none";
      document.querySelector(".topbar").style.display = "none";
      document.querySelector(".embedToolbar").style.display = "flex";
  
      currentDbId  = parts[1];
      embedSpots    = await fetchSpots(currentDbId);
      renderMarkers(embedSpots);
  
      // **Crucial**: grab the marker instances in the same order
      embedMarkers = markerGroup.getLayers();
  
      return;
    }
  
    // Main app:
    loadDatabases();
  });
  