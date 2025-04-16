document.addEventListener("DOMContentLoaded", () => {
    let map, markerGroup, currentDbId;
  
    // ─── Helpers ─────────────────────────────────────────────────
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
      let j   = await res.json();
      if (j.success) return { lat: +j.lat, lon: +j.lon };
  
      // fallback
      if (!addr.match(/\b(CA|USA)\b/)) {
        res = await fetch(base + `, CA, USA`);
        j   = await res.json();
        if (j.success) return { lat: +j.lat, lon: +j.lon };
      }
      return null;
    }
  
    function makeSlug(name) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const rand = Math.random().toString(36).substring(2, 8);
      return `${slug}-${rand}`;
    }
  
    // ─── Initialize Leaflet ────────────────────────────────────────
    function initMap() {
      map = L.map("map").setView([37.7749, -122.4194], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      markerGroup = L.featureGroup().addTo(map);
    }
  
    // ─── Load sidebar list of maps (Notion DBs) ────────────────────
    async function loadDatabases() {
      const res     = await fetch("/api/databases");
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
  
    // ─── Open the Edit View ────────────────────────────────────────
    async function openEditView(dbId, dbName) {
      currentDbId = dbId;
      document.getElementById("mapListView").style.display = "none";
      document.getElementById("mapEditView").style.display = "block";
  
      // DB select
      document.getElementById("dbSelect").innerHTML = `<option>${dbName}</option>`;
  
      // Map name & URL
      const nameInput = document.getElementById("mapName");
      nameInput.value = dbName;
      updateUrl();
      nameInput.oninput = updateUrl;
  
      // Load DB properties for marker color & visible columns
      await loadDbProperties(dbId);
    }
  
    // ─── Fetch DB properties & populate controls ────────────────────
    async function loadDbProperties(dbId) {
      const res     = await fetch(`/api/databases/${dbId}`);
      const { properties } = await res.json();
  
      const colorSelect = document.getElementById("markerColorSelect");
      const visContainer = document.getElementById("visibleColumns");
      colorSelect.innerHTML = `<option value="">None</option>`;
      visContainer.innerHTML = "";
  
      Object.entries(properties).forEach(([key, prop]) => {
        // marker color options: only select / multi_select
        if (prop.type === "select" || prop.type === "multi_select") {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = key;
          colorSelect.append(opt);
        }
        // visible columns: all properties
        const lbl = document.createElement("label");
        lbl.innerHTML = `<input type="checkbox" value="${key}" checked /> ${key}`;
        visContainer.append(lbl);
      });
    }
  
    // ─── Copy URL & Save Map ────────────────────────────────────────
    function updateUrl() {
      const name = document.getElementById("mapName").value.trim() || "map";
      const slug = makeSlug(name);
      document.getElementById("mapUrl").value = `${window.location.origin}/map/${slug}`;
    }
    document.getElementById("copyBtn").onclick = () => {
      const urlBox = document.getElementById("mapUrl");
      urlBox.select();
      document.execCommand("copy");
      alert("Map URL copied!");
    };
    document.getElementById("saveMap").onclick = () => {
      const config = {
        dbId: currentDbId,
        name: document.getElementById("mapName").value,
        url: document.getElementById("mapUrl").value,
        markerColorProp: document.getElementById("markerColorSelect").value,
        visibleColumns: Array.from(
          document.querySelectorAll("#visibleColumns input:checked")
        ).map((inp) => inp.value),
      };
      console.log("Save config:", config);
      alert("Map saved – copy the URL into Notion.");
    };
  
    // ─── Go back to list ────────────────────────────────────────────
    document.getElementById("goBack").onclick = (e) => {
      e.preventDefault();
      document.getElementById("mapEditView").style.display = "none";
      document.getElementById("mapListView").style.display = "block";
    };
  
    // ─── Menu toggle ────────────────────────────────────────────────
    document.getElementById("menuBtn").onclick = () => {
      const dd = document.getElementById("dropdown");
      dd.style.display = dd.style.display === "flex" ? "none" : "flex";
    };
  
    // ─── Kickoff ────────────────────────────────────────────────────
    initMap();
    loadDatabases();
  });
  